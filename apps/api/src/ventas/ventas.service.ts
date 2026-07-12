import { Injectable } from '@nestjs/common';
import { DocTipo, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditoriaService } from '../auditoria/auditoria.module';
import { CajaService } from '../caja/caja.module';
import { Ctx } from '../common/decorators';
import { D, Dec, money } from '../common/dinero';
import { AppError, err } from '../common/errores';
import { PrismaService } from '../common/prisma.service';
import { FacturacionService } from '../facturacion/facturacion.module';
import { InventarioService } from '../inventario/inventario.module';
import { calcularLinea, calcularTotales, porcentajeDescuento, validarPagos } from './calculo';
import { ActualizarLineasDto, AutorizacionDto, CobrarVentaDto, CrearVentaDto, LineaVentaDto } from './ventas.dto';

const INCLUDE_VENTA = {
  lineas: { include: { producto: { select: { id: true, sku: true, nombre: true, ventaFraccionada: true } } }, orderBy: { orden: 'asc' as const } },
  pagos: true,
  cliente: true,
  sucursal: { select: { id: true, codigo: true, nombre: true } },
  factura: { select: { id: true, numero: true, estado: true, cufe: true } },
} satisfies Prisma.VentaInclude;

interface LineaPreparada {
  productoId: string;
  descripcion: string;
  cantidad: Dec;
  precioUnitario: Dec;
  precioLista: Dec;
  importeBruto: Dec;
  descuento: Dec;
  baseGravable: Dec;
  tasaItbms: Dec;
  itbmsLinea: Dec;
  totalLinea: Dec;
  orden: number;
  advertenciaStock?: { disponible: string; solicitado: string };
}

/**
 * Venta en dos pasos (D-020/BL-008):
 *  1) el vendedor arma la venta → estado PREPARACION (sin reservar stock, Q-017);
 *  2) la caja cobra → transacción atómica: stock + movimiento_inv + venta_pago +
 *     caja_movimiento + factura (stub contingencia) + auditoría (RF-VEN-002).
 * No se vende sin stock (RN-007): validación dura al cobrar, con 409 STOCK_INSUFICIENTE.
 */
@Injectable()
export class VentasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventario: InventarioService,
    private readonly caja: CajaService,
    private readonly facturacion: FacturacionService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private async umbralDescuentoPct(tenantId: string): Promise<Dec> {
    const cfg = await this.prisma.configuracion.findUnique({
      where: { tenantId_clave: { tenantId, clave: 'descuento_max_pct_sin_autorizacion' } },
    });
    const v = Number(cfg?.valor ?? 5);
    return D(isFinite(v) ? v : 5);
  }

  /** Presets de % de descuento configurables (Admin > Configuración) para los botones de la ventanilla. */
  async configDescuentos(ctx: Ctx): Promise<{ presets: number[] }> {
    const DEFAULT = [5, 10, 15, 20];
    const cfg = await this.prisma.configuracion.findUnique({
      where: { tenantId_clave: { tenantId: ctx.tenantId, clave: 'descuento_presets_pct' } },
    });
    const valor = cfg?.valor;
    if (!Array.isArray(valor)) return { presets: DEFAULT };
    const presets = valor.map(Number).filter((n) => isFinite(n) && n > 0 && n <= 100);
    return { presets: presets.length ? presets : DEFAULT };
  }

  /** Prepara líneas: precio especial por cliente (D-024), ITBMS por línea, advertencias de stock. */
  private async prepararLineas(ctx: Ctx, sucursalId: string, clienteId: string, lineasDto: LineaVentaDto[]): Promise<LineaPreparada[]> {
    const productoIds = [...new Set(lineasDto.map((l) => l.productoId))];
    const productos = await this.prisma.producto.findMany({
      where: { id: { in: productoIds }, tenantId: ctx.tenantId },
      include: {
        stocks: { where: { sucursalId } },
        preciosEspeciales: { where: { clienteId, activo: true } },
      },
    });
    const porId = new Map(productos.map((p) => [p.id, p]));
    const preparadas: LineaPreparada[] = [];
    let orden = 0;
    for (const l of lineasDto) {
      const p = porId.get(l.productoId);
      if (!p) throw err.noEncontrado('Uno de los productos');
      if (p.estado !== 'ACTIVO') throw err.regla('REGLA_NEGOCIO', `El producto ${p.sku} está descontinuado (RN-023).`);
      const cantidad = D(l.cantidad);
      if (cantidad.lte(0)) throw err.validacion('La cantidad debe ser mayor que cero.');
      if (!p.ventaFraccionada && !cantidad.isInteger()) {
        throw err.regla('REGLA_NEGOCIO', `El producto ${p.sku} no admite venta fraccionada (D-027).`);
      }
      const precioLista = D(p.precioBase);
      const especial = p.preciosEspeciales[0];
      const precioUnitario = especial ? D(especial.precio) : precioLista;
      let calc;
      try {
        calc = calcularLinea({ cantidad, precioUnitario, descuento: l.descuento ? D(l.descuento) : undefined, tasaItbms: D(p.tasaItbms) });
      } catch (e) {
        throw err.validacion(`Línea inválida (${p.sku}): ${(e as Error).message}`);
      }
      const disponible = D(p.stocks[0]?.cantidad ?? 0);
      preparadas.push({
        productoId: p.id,
        descripcion: p.nombre,
        cantidad,
        precioUnitario,
        precioLista,
        importeBruto: calc.importeBruto,
        descuento: calc.descuento,
        baseGravable: calc.baseGravable,
        tasaItbms: D(p.tasaItbms),
        itbmsLinea: calc.itbmsLinea,
        totalLinea: calc.totalLinea,
        orden: orden++,
        ...(disponible.lt(cantidad) ? { advertenciaStock: { disponible: disponible.toFixed(3), solicitado: cantidad.toFixed(3) } } : {}),
      });
    }
    return preparadas;
  }

  /** Descuento sobre umbral requiere autorización de descuentos:aplicar_extra (RN-160/D-024). */
  private async resolverAutorizacionDescuento(ctx: Ctx, lineas: LineaPreparada[], autorizacion?: AutorizacionDto): Promise<string | null> {
    const totales = calcularTotales(lineas);
    if (totales.descuentoTotal.lte(0)) return null;
    if (!ctx.permisos.has('descuentos:aplicar_normal') && !ctx.permisos.has('descuentos:aplicar_extra')) {
      throw err.sinPermiso('descuentos:aplicar_normal');
    }
    const umbral = await this.umbralDescuentoPct(ctx.tenantId);
    const pct = porcentajeDescuento(totales);
    if (pct.lte(umbral)) return null;
    if (ctx.permisos.has('descuentos:aplicar_extra')) return ctx.usuarioId;
    if (!autorizacion) {
      throw err.regla('DESCUENTO_REQUIERE_AUTORIZACION', `El descuento (${pct.toDecimalPlaces(1)}%) supera el ${umbral}% permitido; requiere autorización de un supervisor.`);
    }
    const autorizador = await this.prisma.usuario.findFirst({
      where: { tenantId: ctx.tenantId, usuario: autorizacion.usuario.trim(), activo: true },
      include: { roles: { include: { rol: { include: { permisos: { include: { permiso: true } } } } } } },
    });
    const ok = autorizador && (await bcrypt.compare(autorizacion.password, autorizador.passwordHash));
    if (!ok) throw err.credenciales();
    const permisosAut = new Set(autorizador.roles.flatMap((r) => r.rol.permisos.map((rp) => rp.permiso.codigo)));
    if (!permisosAut.has('descuentos:aplicar_extra')) throw err.sinPermiso('descuentos:aplicar_extra');
    return autorizador.id;
  }

  private async consumidorFinal(tenantId: string): Promise<string> {
    const cf = await this.prisma.cliente.findFirst({ where: { tenantId, tipo: 'CONSUMIDOR_FINAL', activo: true } });
    if (!cf) throw err.regla('REGLA_NEGOCIO', 'No existe el cliente Consumidor Final; siembre los datos base.');
    return cf.id;
  }

  async crear(ctx: Ctx, dto: CrearVentaDto) {
    if (dto.idempotencyKey) {
      const existente = await this.prisma.venta.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: INCLUDE_VENTA });
      if (existente) return { venta: existente, advertencias: [], idempotente: true };
    }
    const sucursalId = dto.sucursalId ?? ctx.sucursalId;
    if (!sucursalId) throw err.validacion('Indique la sucursal (X-Sucursal-Id).');
    if (!ctx.sucursalIds.includes(sucursalId)) throw err.sucursalNoAutorizada();
    const clienteId = dto.clienteId ?? (await this.consumidorFinal(ctx.tenantId));

    const lineas = await this.prepararLineas(ctx, sucursalId, clienteId, dto.lineas);
    const autorizadoPor = await this.resolverAutorizacionDescuento(ctx, lineas, dto.autorizacion);
    const totales = calcularTotales(lineas);

    const venta = await this.prisma.$transaction(async (tx) => {
      const v = await tx.venta.create({
        data: {
          tenantId: ctx.tenantId,
          sucursalId,
          clienteId,
          vendedorId: ctx.usuarioId,
          estado: 'PREPARACION',
          subtotal: totales.subtotal,
          descuentoTotal: totales.descuentoTotal,
          itbmsTotal: totales.itbmsTotal,
          total: totales.total,
          notas: dto.notas,
          idempotencyKey: dto.idempotencyKey,
          descuentoAutorizadoPorId: autorizadoPor,
          lineas: {
            create: lineas.map((l) => ({
              productoId: l.productoId,
              descripcion: l.descripcion,
              cantidad: l.cantidad,
              precioUnitario: l.precioUnitario,
              precioLista: l.precioLista,
              descuento: l.descuento,
              baseGravable: l.baseGravable,
              tasaItbms: l.tasaItbms,
              itbmsLinea: l.itbmsLinea,
              totalLinea: l.totalLinea,
              orden: l.orden,
            })),
          },
        },
      });
      await this.auditoria.registrar(tx, {
        tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, sucursalId, accion: 'venta.crear', entidad: 'venta', entidadId: v.id,
        estadoNuevo: { total: money(totales.total), lineas: lineas.length, clienteId }, ip: ctx.ip,
      });
      return v;
    }, { timeout: 15000, maxWait: 10000 });

    const completa = await this.obtener(ctx, venta.id);
    return {
      venta: completa,
      advertencias: lineas.filter((l) => l.advertenciaStock).map((l) => ({ codigo: 'STOCK_INSUFICIENTE_ADVERTENCIA', producto: l.descripcion, ...l.advertenciaStock! })),
    };
  }

  /** Editar una venta en PREPARACION (reemplaza líneas y recalcula). */
  async actualizarLineas(ctx: Ctx, ventaId: string, dto: ActualizarLineasDto) {
    const venta = await this.prisma.venta.findFirst({ where: { id: ventaId, tenantId: ctx.tenantId } });
    if (!venta) throw err.noEncontrado('La venta');
    if (venta.estado !== 'PREPARACION') throw err.conflicto('CONFLICTO', 'Solo se pueden editar ventas en preparación.');
    if (!ctx.sucursalIds.includes(venta.sucursalId)) throw err.sucursalNoAutorizada();

    const clienteId = dto.clienteId ?? venta.clienteId;
    const lineas = await this.prepararLineas(ctx, venta.sucursalId, clienteId, dto.lineas);
    const autorizadoPor = await this.resolverAutorizacionDescuento(ctx, lineas, dto.autorizacion);
    const totales = calcularTotales(lineas);

    await this.prisma.$transaction(async (tx) => {
      await tx.ventaLinea.deleteMany({ where: { ventaId } });
      await tx.venta.update({
        where: { id: ventaId },
        data: {
          clienteId,
          notas: dto.notas ?? venta.notas,
          subtotal: totales.subtotal,
          descuentoTotal: totales.descuentoTotal,
          itbmsTotal: totales.itbmsTotal,
          total: totales.total,
          descuentoAutorizadoPorId: autorizadoPor ?? venta.descuentoAutorizadoPorId,
          lineas: {
            create: lineas.map((l) => ({
              productoId: l.productoId, descripcion: l.descripcion, cantidad: l.cantidad,
              precioUnitario: l.precioUnitario, precioLista: l.precioLista, descuento: l.descuento,
              baseGravable: l.baseGravable, tasaItbms: l.tasaItbms, itbmsLinea: l.itbmsLinea,
              totalLinea: l.totalLinea, orden: l.orden,
            })),
          },
        },
      });
      await this.auditoria.registrar(tx, {
        tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, sucursalId: venta.sucursalId, accion: 'venta.editar', entidad: 'venta', entidadId: ventaId,
        estadoNuevo: { total: money(totales.total), lineas: lineas.length }, ip: ctx.ip,
      });
    }, { timeout: 15000, maxWait: 10000 });

    const completa = await this.obtener(ctx, ventaId);
    return {
      venta: completa,
      advertencias: lineas.filter((l) => l.advertenciaStock).map((l) => ({ codigo: 'STOCK_INSUFICIENTE_ADVERTENCIA', producto: l.descripcion, ...l.advertenciaStock! })),
    };
  }

  /** Numeración consecutiva por punto de emisión (Q-022/BL-016). */
  private async siguienteConsecutivo(tx: Prisma.TransactionClient, tenantId: string, sucursalId: string, tipo: DocTipo): Promise<number> {
    const filas = await tx.$queryRaw<Array<{ proximo: number }>>`
      UPDATE secuencia_documento SET proximo = proximo + 1
      WHERE tenant_id = ${tenantId}::uuid AND sucursal_id = ${sucursalId}::uuid AND tipo = ${tipo}::"doc_tipo"
      RETURNING proximo - 1 AS proximo`;
    if (filas.length) return Number(filas[0].proximo);
    await tx.secuenciaDocumento.create({ data: { tenantId, sucursalId, tipo, proximo: 2 } });
    return 1;
  }

  /**
   * Cobro en caja — LA transacción del sistema (RF-VEN-002, BL-008):
   * revalida stock y lo descuenta (movimiento inmutable), numera venta y factura,
   * registra pagos + movimientos de caja, emite factura (contingencia) y audita. Atómico.
   */
  async cobrar(ctx: Ctx, ventaId: string, dto: CobrarVentaDto) {
    const venta = await this.prisma.venta.findFirst({ where: { id: ventaId, tenantId: ctx.tenantId }, include: INCLUDE_VENTA });
    if (!venta) throw err.noEncontrado('La venta');
    if (!ctx.sucursalIds.includes(venta.sucursalId)) throw err.sucursalNoAutorizada();
    if (venta.estado === 'CANCELADA') throw err.conflicto('CONFLICTO', 'La venta está cancelada.');
    if (venta.estado === 'COBRADA') {
      if (venta.cobroIdempotencyKey === dto.idempotencyKey) return this.obtener(ctx, ventaId); // reintento idempotente
      throw err.conflicto('YA_COBRADA', `La venta ya fue cobrada (${venta.numero}).`);
    }

    // Caja obligatoria para cobrar (D-039/RN-123)
    const sesionCaja = await this.caja.sesionAbierta(ctx.tenantId, venta.sucursalId);
    if (!sesionCaja) throw err.regla('CAJA_NO_ABIERTA', 'Debe abrir caja antes de cobrar (RN-123).');

    // Pagos: suma exacta, mixto permitido, vuelto solo de efectivo (RF-VEN-005)
    let resultadoPagos;
    try {
      resultadoPagos = validarPagos(
        D(venta.total),
        dto.pagos.map((p) => ({ metodo: p.metodo, monto: D(p.monto) })),
        dto.efectivoRecibido !== undefined ? D(dto.efectivoRecibido) : undefined,
      );
    } catch (e) {
      const codigo = (e as Error).message;
      const mensajes: Record<string, string> = {
        PAGO_INSUFICIENTE: 'Los pagos no cubren el total de la venta.',
        PAGO_EXCEDENTE: 'Los pagos exceden el total: solo el efectivo genera vuelto (indique efectivoRecibido).',
        EFECTIVO_INSUFICIENTE: 'El efectivo recibido es menor que el monto a pagar en efectivo.',
        PAGO_INVALIDO: 'Hay un pago con monto inválido.',
      };
      throw err.regla(codigo, mensajes[codigo] ?? 'Pagos inválidos.', [{ total: money(venta.total) }]);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // Candado de la venta: evita doble cobro concurrente
        const lock = await tx.$queryRaw<Array<{ estado: string }>>`
          SELECT estado::text FROM venta WHERE id = ${ventaId}::uuid FOR UPDATE`;
        if (lock[0]?.estado !== 'PREPARACION') throw new AppError('__COBRO_CONCURRENTE__', 'concurrente', 409);

        // Stock: revalidar y descontar con movimiento inmutable por línea (RN-005/006/007)
        for (const l of venta.lineas) {
          const r = await this.inventario.aplicarMovimiento(tx, {
            tenantId: ctx.tenantId,
            productoId: l.productoId,
            sucursalId: venta.sucursalId,
            tipo: 'SALIDA_VENTA',
            cantidad: D(l.cantidad),
            refTipo: 'VENTA',
            refId: venta.id,
            usuarioId: ctx.usuarioId,
          });
          await tx.ventaLinea.update({ where: { id: l.id }, data: { costoUnitario: r.costoUnitario } });
        }

        const nV = await this.siguienteConsecutivo(tx, ctx.tenantId, venta.sucursalId, 'VENTA');
        const numero = `V-${venta.sucursal.codigo}-${String(nV).padStart(8, '0')}`;
        const nF = await this.siguienteConsecutivo(tx, ctx.tenantId, venta.sucursalId, 'FACTURA');
        const numeroFactura = `F-${venta.sucursal.codigo}-${String(nF).padStart(8, '0')}`;

        await tx.venta.update({
          where: { id: ventaId },
          data: {
            estado: 'COBRADA',
            numero,
            cajeroId: ctx.usuarioId,
            cajaSesionId: sesionCaja.id,
            efectivoRecibido: dto.efectivoRecibido ?? null,
            vuelto: resultadoPagos.vuelto,
            cobradaEn: new Date(),
            cobroIdempotencyKey: dto.idempotencyKey,
          },
        });
        for (const p of dto.pagos) {
          await tx.ventaPago.create({ data: { ventaId, metodo: p.metodo, monto: p.monto, referencia: p.referencia } });
          await tx.cajaMovimiento.create({
            data: { cajaSesionId: sesionCaja.id, tipo: 'VENTA', metodo: p.metodo, monto: p.monto, ventaId, usuarioId: ctx.usuarioId },
          });
        }

        // Factura en contingencia (stub) — nunca bloquea la venta (RF-FAC-005/BL-009)
        const ventaFull = await tx.venta.findUniqueOrThrow({ where: { id: ventaId }, include: { lineas: true, cliente: true, sucursal: true, pagos: true } });
        const factura = await this.facturacion.emitirDentroDeTx(tx, ventaFull, numeroFactura);

        await this.auditoria.registrar(tx, {
          tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, sucursalId: venta.sucursalId,
          accion: 'venta.cobrar', entidad: 'venta', entidadId: ventaId,
          estadoAnterior: { estado: 'PREPARACION' },
          estadoNuevo: {
            estado: 'COBRADA', numero, total: money(venta.total),
            pagos: dto.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
            vuelto: money(resultadoPagos.vuelto), factura: factura?.numero ?? null,
          },
          ip: ctx.ip,
        });
      }, { timeout: 25000, maxWait: 10000 });
    } catch (e) {
      if (e instanceof AppError && e.codigo === '__COBRO_CONCURRENTE__') {
        const actual = await this.prisma.venta.findUnique({ where: { id: ventaId } });
        if (actual?.estado === 'COBRADA' && actual.cobroIdempotencyKey === dto.idempotencyKey) return this.obtener(ctx, ventaId);
        throw err.conflicto('YA_COBRADA', 'La venta fue cobrada por otra operación.');
      }
      throw e;
    }

    return this.obtener(ctx, ventaId);
  }

  async cancelar(ctx: Ctx, ventaId: string, motivo: string) {
    const venta = await this.prisma.venta.findFirst({ where: { id: ventaId, tenantId: ctx.tenantId } });
    if (!venta) throw err.noEncontrado('La venta');
    if (venta.estado !== 'PREPARACION') throw err.conflicto('CONFLICTO', 'Solo se cancelan ventas en preparación (RN-183: nada se borra).');
    await this.prisma.$transaction(async (tx) => {
      await tx.venta.update({ where: { id: ventaId }, data: { estado: 'CANCELADA', canceladaEn: new Date(), notas: `${venta.notas ?? ''}\n[Cancelada] ${motivo}`.trim() } });
      await this.auditoria.registrar(tx, {
        tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, sucursalId: venta.sucursalId, accion: 'venta.cancelar', entidad: 'venta', entidadId: ventaId,
        estadoAnterior: { estado: venta.estado }, estadoNuevo: { estado: 'CANCELADA', motivo }, ip: ctx.ip,
      });
    });
    return this.obtener(ctx, ventaId);
  }

  async obtener(ctx: Ctx, id: string) {
    const v = await this.prisma.venta.findFirst({ where: { id, tenantId: ctx.tenantId }, include: INCLUDE_VENTA });
    if (!v) throw err.noEncontrado('La venta');
    return v;
  }

  async listar(ctx: Ctx, f: { estado?: string; sucursal?: string; limit?: string; cursor?: string; q?: string }) {
    const take = Math.min(Number(f.limit) || 30, 100);
    const filas = await this.prisma.venta.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(f.estado ? { estado: f.estado as never } : {}),
        ...(f.sucursal ? { sucursalId: f.sucursal } : ctx.sucursalId ? { sucursalId: ctx.sucursalId } : {}),
        ...(f.q ? { OR: [{ numero: { contains: f.q, mode: 'insensitive' } }, { cliente: { nombre: { contains: f.q, mode: 'insensitive' } } }] } : {}),
      },
      include: INCLUDE_VENTA,
      orderBy: { creadoEn: 'desc' },
      take: take + 1,
      ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    });
    const hayMas = filas.length > take;
    return { datos: filas.slice(0, take), next_cursor: hayMas ? filas[take - 1].id : null };
  }
}
