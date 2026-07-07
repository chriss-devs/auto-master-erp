import { Controller, Get, Inject, Injectable, Logger, Module, Param, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.module';
import { Ctx, RequierePermiso, UsuarioActual } from '../common/decorators';
import { money } from '../common/dinero';
import { err } from '../common/errores';
import { PrismaService } from '../common/prisma.service';
import { PAC_PROVIDER, PacDocumento, PacProvider, StubPacProvider } from './pac-provider';

type VentaParaFacturar = Prisma.VentaGetPayload<{
  include: { lineas: true; cliente: true; sucursal: true; pagos: true };
}>;

@Injectable()
export class FacturacionService {
  private readonly logger = new Logger('Facturacion');

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    @Inject(PAC_PROVIDER) private readonly pac: PacProvider,
  ) {}

  /**
   * Emite la factura dentro de la transacción del cobro (BL-008 paso 6).
   * NUNCA lanza: si el PAC falla, la factura queda PENDIENTE_TRANSMISION con el error
   * registrado y la venta continúa (RF-FAC-005). Devuelve la factura o null.
   */
  async emitirDentroDeTx(tx: Prisma.TransactionClient, venta: VentaParaFacturar, numeroFactura: string) {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: venta.tenantId } });
    const doc: PacDocumento = {
      ventaId: venta.id,
      numero: numeroFactura,
      puntoEmision: venta.sucursal.codigo,
      emisor: { nombre: tenant.razonSocial ?? tenant.nombre, ruc: tenant.ruc, dv: tenant.dv, direccion: tenant.direccion },
      receptor: {
        nombre: venta.cliente.nombre,
        rucOCedula: venta.cliente.rucOCedula,
        dv: venta.cliente.dv,
        tipo: venta.cliente.tipo,
      },
      lineas: venta.lineas.map((l) => ({
        descripcion: l.descripcion,
        cantidad: l.cantidad.toString(),
        precioUnitario: money(l.precioUnitario),
        descuento: money(l.descuento),
        baseGravable: money(l.baseGravable),
        tasaItbms: l.tasaItbms.toString(),
        itbms: money(l.itbmsLinea),
        total: money(l.totalLinea),
      })),
      totales: {
        subtotal: money(venta.subtotal),
        descuentoTotal: money(venta.descuentoTotal),
        itbmsTotal: money(venta.itbmsTotal),
        total: money(venta.total),
      },
      fechaEmision: new Date().toISOString(),
    };

    const snapshot = {
      ...doc,
      sucursal: { codigo: venta.sucursal.codigo, nombre: venta.sucursal.nombre, direccion: venta.sucursal.direccion, telefono: venta.sucursal.telefono },
      ventaNumero: venta.numero,
      pagos: venta.pagos.map((p) => ({ metodo: p.metodo, monto: money(p.monto), referencia: p.referencia })),
      moneda: { codigo: 'PAB', simbolo: 'B/.' },
    };

    try {
      const r = await this.pac.emitir(doc);
      return await tx.factura.create({
        data: {
          tenantId: venta.tenantId,
          ventaId: venta.id,
          sucursalId: venta.sucursalId,
          numero: numeroFactura,
          puntoEmision: venta.sucursal.codigo,
          estado: r.estado,
          cufe: r.cufe,
          urlQr: r.urlQr ?? null,
          pacProveedor: this.pac.nombre,
          pacRespuesta: (r.raw as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          intentos: 1,
          ultimoError: r.estado === 'PENDIENTE_TRANSMISION' ? r.mensaje : null,
          emitidaEn: new Date(),
        },
      });
    } catch (e) {
      // Contingencia dura: ni siquiera el stub respondió — factura pendiente sin CUFE
      this.logger.error(`Fallo del PAC al emitir ${numeroFactura}: ${(e as Error).message}`);
      return await tx.factura.create({
        data: {
          tenantId: venta.tenantId,
          ventaId: venta.id,
          sucursalId: venta.sucursalId,
          numero: numeroFactura,
          puntoEmision: venta.sucursal.codigo,
          estado: 'PENDIENTE_TRANSMISION',
          pacProveedor: this.pac.nombre,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          intentos: 1,
          ultimoError: (e as Error).message?.slice(0, 500),
        },
      });
    }
  }

  /** Reintento de transmisión (contingencia → PAC). Con el stub, permanece pendiente. */
  async retransmitir(ctx: Ctx, facturaId: string) {
    const f = await this.prisma.factura.findFirst({ where: { id: facturaId, tenantId: ctx.tenantId } });
    if (!f) throw err.noEncontrado('La factura');
    if (f.estado !== 'PENDIENTE_TRANSMISION' && f.estado !== 'RECHAZADA') {
      throw err.regla('REGLA_NEGOCIO', `La factura está en estado ${f.estado}; no requiere retransmisión.`);
    }
    const snapshot = f.snapshot as unknown as PacDocumento;
    const r = await this.pac.emitir(snapshot);
    const actualizada = await this.prisma.factura.update({
      where: { id: f.id },
      data: {
        estado: r.estado,
        cufe: r.cufe ?? f.cufe,
        intentos: { increment: 1 },
        ultimoError: r.estado === 'PENDIENTE_TRANSMISION' ? r.mensaje : null,
        pacRespuesta: (r.raw as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        autorizadaEn: r.estado === 'AUTORIZADA' ? new Date() : f.autorizadaEn,
      },
    });
    await this.auditoria.registrar(null, {
      tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, accion: 'facturacion.retransmitir', entidad: 'factura', entidadId: f.id,
      estadoAnterior: { estado: f.estado, intentos: f.intentos }, estadoNuevo: { estado: actualizada.estado, intentos: actualizada.intentos }, ip: ctx.ip,
    });
    return actualizada;
  }
}

@Controller('facturas')
export class FacturacionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly facturacion: FacturacionService,
  ) {}

  @Get()
  @RequierePermiso('facturacion:ver')
  async listar(
    @UsuarioActual() ctx: Ctx,
    @Query('estado') estado?: string,
    @Query('limit') limit = '30',
    @Query('cursor') cursor?: string,
  ) {
    const take = Math.min(Number(limit) || 30, 100);
    const filas = await this.prisma.factura.findMany({
      where: { tenantId: ctx.tenantId, ...(estado ? { estado: estado as never } : {}) },
      include: { venta: { select: { id: true, numero: true, total: true, cliente: { select: { nombre: true } } } }, sucursal: { select: { codigo: true, nombre: true } } },
      orderBy: { creadoEn: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hayMas = filas.length > take;
    return { datos: filas.slice(0, take), next_cursor: hayMas ? filas[take - 1].id : null };
  }

  @Get(':id')
  @RequierePermiso('facturacion:ver')
  async obtener(@UsuarioActual() ctx: Ctx, @Param('id') id: string) {
    const f = await this.prisma.factura.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { venta: { include: { lineas: true, pagos: true, cliente: true } }, sucursal: true },
    });
    if (!f) throw err.noEncontrado('La factura');
    return f;
  }

  /** Datos congelados para la representación impresa tamaño carta (BL-009/Q-023). */
  @Get(':id/impresion')
  @RequierePermiso('facturacion:ver')
  async impresion(@UsuarioActual() ctx: Ctx, @Param('id') id: string) {
    const f = await this.prisma.factura.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!f) throw err.noEncontrado('La factura');
    return {
      id: f.id,
      numero: f.numero,
      estado: f.estado,
      cufe: f.cufe,
      emitidaEn: f.emitidaEn,
      contingencia: f.estado === 'PENDIENTE_TRANSMISION',
      snapshot: f.snapshot,
    };
  }

  @Post(':id/retransmitir')
  @RequierePermiso('facturacion:emitir')
  retransmitir(@UsuarioActual() ctx: Ctx, @Param('id') id: string) {
    return this.facturacion.retransmitir(ctx, id);
  }
}

@Module({
  providers: [{ provide: PAC_PROVIDER, useClass: StubPacProvider }, FacturacionService],
  controllers: [FacturacionController],
  exports: [FacturacionService],
})
export class FacturacionModule {}
