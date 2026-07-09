import { Body, Controller, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { MovTipo, Prisma, RefTipo } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.module';
import { Ctx, RequierePermiso, UsuarioActual } from '../common/decorators';
import { D, Dec, round4 } from '../common/dinero';
import { err } from '../common/errores';
import { PrismaService } from '../common/prisma.service';

const ENTRADAS: MovTipo[] = [MovTipo.ENTRADA_COMPRA, MovTipo.ENTRADA_INICIAL, MovTipo.AJUSTE_ENTRADA, MovTipo.TRANSFER_ENTRADA, MovTipo.DEVOLUCION_ENTRADA];

export interface AplicarMovimientoInput {
  tenantId: string;
  productoId: string;
  sucursalId: string;
  tipo: MovTipo;
  cantidad: Dec; // siempre > 0
  costoUnitario?: Dec; // requerido en entradas con costo; en salidas se usa el promedio vigente
  refTipo?: RefTipo;
  refId?: string;
  motivo?: string;
  usuarioId: string;
}

/**
 * Regla de oro del inventario (RN-005/006, D-002): dentro de UNA transacción se inserta el
 * movimiento inmutable y se actualiza la fila materializada de stock. Nunca UPDATE/DELETE
 * sobre movimiento_inv. Costeo promedio ponderado (RN-009/BL-011). No vender sin stock (RN-007).
 */
@Injectable()
export class InventarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async aplicarMovimiento(tx: Prisma.TransactionClient, inp: AplicarMovimientoInput) {
    if (inp.cantidad.lte(0)) throw err.validacion('La cantidad del movimiento debe ser mayor que cero.');

    // Asegurar fila de stock y bloquearla (concurrencia, 07 §4.3)
    await tx.$executeRaw`
      INSERT INTO stock (producto_id, sucursal_id, tenant_id, cantidad, costo_promedio, actualizado_en)
      VALUES (${inp.productoId}::uuid, ${inp.sucursalId}::uuid, ${inp.tenantId}::uuid, 0, 0, now())
      ON CONFLICT (producto_id, sucursal_id) DO NOTHING`;
    const filas = await tx.$queryRaw<Array<{ cantidad: string; costo_promedio: string }>>`
      SELECT cantidad::text, costo_promedio::text FROM stock
      WHERE producto_id = ${inp.productoId}::uuid AND sucursal_id = ${inp.sucursalId}::uuid
      FOR UPDATE`;
    const actual = D(filas[0]?.cantidad);
    const costoActual = D(filas[0]?.costo_promedio);

    const esEntrada = ENTRADAS.includes(inp.tipo);
    let nuevoSaldo: Dec;
    let nuevoCosto = costoActual;
    let costoUnitario: Dec;

    if (esEntrada) {
      costoUnitario = round4(inp.costoUnitario ?? costoActual);
      nuevoSaldo = actual.add(inp.cantidad);
      // Promedio ponderado (BL-011); si el saldo previo era <= 0, adopta el costo de entrada
      nuevoCosto = actual.lte(0)
        ? costoUnitario
        : round4(actual.mul(costoActual).add(inp.cantidad.mul(costoUnitario)).div(nuevoSaldo));
    } else {
      if (actual.lt(inp.cantidad)) {
        throw err.conflicto('STOCK_INSUFICIENTE', 'No hay stock suficiente en la sucursal seleccionada.', [
          { producto_id: inp.productoId, disponible: actual.toFixed(3), solicitado: inp.cantidad.toFixed(3) },
        ]);
      }
      costoUnitario = round4(inp.costoUnitario ?? costoActual);
      nuevoSaldo = actual.sub(inp.cantidad);
    }

    await tx.stock.update({
      where: { productoId_sucursalId: { productoId: inp.productoId, sucursalId: inp.sucursalId } },
      data: { cantidad: nuevoSaldo, costoPromedio: nuevoCosto },
    });
    const mov = await tx.movimientoInv.create({
      data: {
        tenantId: inp.tenantId,
        productoId: inp.productoId,
        sucursalId: inp.sucursalId,
        tipo: inp.tipo,
        cantidad: inp.cantidad,
        costoUnitario,
        saldoResultante: nuevoSaldo,
        refTipo: inp.refTipo ?? null,
        refId: inp.refId ?? null,
        motivo: inp.motivo ?? null,
        usuarioId: inp.usuarioId,
      },
    });
    return { movimientoId: mov.id, saldo: nuevoSaldo, costoPromedio: nuevoCosto, costoUnitario };
  }
}

class AjusteDto {
  @IsUUID() productoId: string;
  @IsUUID() sucursalId: string;
  @IsIn(['ENTRADA', 'SALIDA']) direccion: 'ENTRADA' | 'SALIDA';
  @Matches(/^\d+(\.\d{1,3})?$/, { message: 'Cantidad inválida (hasta 3 decimales).' }) cantidad: string;
  @IsOptional() @Matches(/^\d+(\.\d{1,4})?$/, { message: 'Costo inválido.' }) costoUnitario?: string;
  @IsString() @IsNotEmpty({ message: 'El motivo del ajuste es obligatorio.' }) motivo: string;
}

@Controller('inventario')
export class InventarioController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventario: InventarioService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Stock por sucursal con visibilidad cruzada (D-030). */
  @Get('stock')
  @RequierePermiso('inventario:ver')
  async stock(
    @UsuarioActual() ctx: Ctx,
    @Query('sucursal') sucursal?: string,
    @Query('q') q?: string,
    @Query('bajo_minimo') bajoMinimo?: string,
    @Query('limit') limit = '50',
    @Query('cursor') cursor?: string,
  ) {
    const filtraBajo = bajoMinimo === 'true';
    // "Bajo mínimo" es una lista de alertas (subconjunto pequeño): se filtra sobre los productos
    // con mínimo configurado y se devuelve completa (hasta 200), sin paginar.
    const take = filtraBajo ? 200 : Math.min(Number(limit) || 50, 200);
    const where: Prisma.ProductoWhereInput = {
      tenantId: ctx.tenantId,
      estado: 'ACTIVO',
      ...(filtraBajo ? { stockMinimo: { gt: 0 } } : {}),
      ...(q
        ? {
            OR: [
              { nombre: { contains: q, mode: 'insensitive' } },
              { sku: { contains: q, mode: 'insensitive' } },
              { codigos: { some: { valor: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const productos = await this.prisma.producto.findMany({
      where,
      include: { stocks: { include: { sucursal: { select: { id: true, codigo: true, nombre: true } } } }, unidadMedida: true },
      orderBy: { nombre: 'asc' },
      take: filtraBajo ? undefined : take + 1,
      ...(cursor && !filtraBajo ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    let datos = productos.map((p) => ({
      producto: { id: p.id, sku: p.sku, nombre: p.nombre, unidad: p.unidadMedida.codigo, stockMinimo: p.stockMinimo },
      stocks: p.stocks.map((s) => ({ sucursal: s.sucursal, cantidad: s.cantidad, costoPromedio: s.costoPromedio })),
    }));
    if (filtraBajo) {
      datos = datos.filter((d) => {
        const st = sucursal ? d.stocks.filter((s) => s.sucursal.id === sucursal) : d.stocks;
        const total = st.reduce((a, s) => a.add(D(s.cantidad)), D(0));
        return total.lte(D(d.producto.stockMinimo));
      });
      return { datos: datos.slice(0, take), next_cursor: null };
    }
    const hayMas = productos.length > take;
    return { datos: datos.slice(0, take), next_cursor: hayMas ? productos[take - 1].id : null };
  }

  @Get('productos/:id/kardex')
  @RequierePermiso('inventario:ver')
  async kardex(
    @UsuarioActual() ctx: Ctx,
    @Param('id') productoId: string,
    @Query('sucursal') sucursal?: string,
    @Query('limit') limit = '50',
    @Query('cursor') cursor?: string,
  ) {
    const take = Math.min(Number(limit) || 50, 200);
    const filas = await this.prisma.movimientoInv.findMany({
      where: { tenantId: ctx.tenantId, productoId, ...(sucursal ? { sucursalId: sucursal } : {}) },
      include: { sucursal: { select: { codigo: true, nombre: true } } },
      orderBy: { creadoEn: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hayMas = filas.length > take;
    return { datos: filas.slice(0, take), next_cursor: hayMas ? filas[take - 1].id : null };
  }

  /** Ajuste básico de inventario (Fase 1): movimiento inmutable + auditoría. */
  @Post('ajustes')
  @RequierePermiso('inventario:ajustar')
  async ajustar(@UsuarioActual() ctx: Ctx, @Body() dto: AjusteDto) {
    if (!ctx.sucursalIds.includes(dto.sucursalId)) throw err.sucursalNoAutorizada();
    const producto = await this.prisma.producto.findFirst({ where: { id: dto.productoId, tenantId: ctx.tenantId } });
    if (!producto) throw err.noEncontrado('El producto');

    const resultado = await this.prisma.$transaction(async (tx) => {
      const r = await this.inventario.aplicarMovimiento(tx, {
        tenantId: ctx.tenantId,
        productoId: dto.productoId,
        sucursalId: dto.sucursalId,
        tipo: dto.direccion === 'ENTRADA' ? 'AJUSTE_ENTRADA' : 'AJUSTE_SALIDA',
        cantidad: D(dto.cantidad),
        costoUnitario: dto.costoUnitario ? D(dto.costoUnitario) : undefined,
        refTipo: 'AJUSTE',
        motivo: dto.motivo,
        usuarioId: ctx.usuarioId,
      });
      await this.auditoria.registrar(tx, {
        tenantId: ctx.tenantId,
        usuarioId: ctx.usuarioId,
        sucursalId: dto.sucursalId,
        accion: 'inventario.ajustar',
        entidad: 'producto',
        entidadId: dto.productoId,
        estadoNuevo: { direccion: dto.direccion, cantidad: dto.cantidad, motivo: dto.motivo, saldo: r.saldo.toFixed(3) },
        ip: ctx.ip,
      });
      return r;
    }, { timeout: 15000, maxWait: 10000 });

    return { ok: true, saldo: resultado.saldo, costoPromedio: resultado.costoPromedio, movimientoId: resultado.movimientoId };
  }
}

@Module({ providers: [InventarioService], controllers: [InventarioController], exports: [InventarioService] })
export class InventarioModule {}
