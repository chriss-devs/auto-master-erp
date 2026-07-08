import { Controller, Get, Module } from '@nestjs/common';
import { Ctx, RequierePermiso, SucursalActual, UsuarioActual } from '../common/decorators';
import { D, money } from '../common/dinero';
import { PrismaService } from '../common/prisma.service';

/** Día operativo en America/Panama (UTC-5 fijo, sin DST — BL-014). */
function rangoDiaPanama(offsetDias = 0, ahora = new Date()): { desde: Date; hasta: Date } {
  const offsetMs = 5 * 3600_000;
  const local = new Date(ahora.getTime() - offsetMs);
  const inicioLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + offsetDias);
  return { desde: new Date(inicioLocal + offsetMs), hasta: new Date(inicioLocal + offsetMs + 24 * 3600_000) };
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  /** Dashboard accionable (Fase 1): hoy vs ayer, utilidad, caja, por cobrar, pagos por método, inventario. */
  @Get()
  @RequierePermiso('reportes:ver')
  async resumen(@UsuarioActual() ctx: Ctx, @SucursalActual() sucursalId: string) {
    const hoy = rangoDiaPanama(0);
    const ayer = rangoDiaPanama(-1);
    const hace7d = new Date(Date.now() - 7 * 24 * 3600_000);
    const t = ctx.tenantId;

    const [
      ventasHoy,
      ventasAyer,
      utilidadHoy,
      pagosHoy,
      preparacion,
      cajaAbierta,
      ultimoCierre,
      inventario,
      facturasPendientes,
      stockBajoFilas,
      topLineas,
      serie,
    ] = await Promise.all([
      this.prisma.venta.aggregate({
        where: { tenantId: t, sucursalId, estado: 'COBRADA', cobradaEn: { gte: hoy.desde, lt: hoy.hasta } },
        _count: true,
        _sum: { total: true, itbmsTotal: true },
      }),
      this.prisma.venta.aggregate({
        where: { tenantId: t, sucursalId, estado: 'COBRADA', cobradaEn: { gte: ayer.desde, lt: ayer.hasta } },
        _count: true,
        _sum: { total: true },
      }),
      // Utilidad bruta de hoy: Σ(base gravable − costo promedio × cantidad) de líneas cobradas (RN-009)
      this.prisma.$queryRaw<Array<{ utilidad: string; base: string }>>`
        SELECT COALESCE(SUM(vl.base_gravable - COALESCE(vl.costo_unitario, 0) * vl.cantidad), 0)::text AS utilidad,
               COALESCE(SUM(vl.base_gravable), 0)::text AS base
        FROM venta_linea vl JOIN venta v ON v.id = vl.venta_id
        WHERE v.tenant_id = ${t}::uuid AND v.sucursal_id = ${sucursalId}::uuid
          AND v.estado = 'COBRADA' AND v.cobrada_en >= ${hoy.desde} AND v.cobrada_en < ${hoy.hasta}`,
      this.prisma.$queryRaw<Array<{ metodo: string; monto: string; pagos: string }>>`
        SELECT vp.metodo::text, SUM(vp.monto)::text AS monto, COUNT(*)::text AS pagos
        FROM venta_pago vp JOIN venta v ON v.id = vp.venta_id
        WHERE v.tenant_id = ${t}::uuid AND v.sucursal_id = ${sucursalId}::uuid
          AND v.estado = 'COBRADA' AND v.cobrada_en >= ${hoy.desde} AND v.cobrada_en < ${hoy.hasta}
        GROUP BY vp.metodo`,
      this.prisma.venta.aggregate({
        where: { tenantId: t, sucursalId, estado: 'PREPARACION' },
        _count: true,
        _sum: { total: true },
        _min: { creadoEn: true },
      }),
      this.prisma.cajaSesion.findFirst({ where: { tenantId: t, sucursalId, estado: 'ABIERTA' }, select: { id: true, abiertaEn: true } }),
      this.prisma.cajaSesion.findFirst({
        where: { tenantId: t, sucursalId, estado: 'CERRADA' },
        orderBy: { cerradaEn: 'desc' },
        select: { cerradaEn: true, descuadreTotal: true },
      }),
      this.prisma.$queryRaw<Array<{ valor: string; items: string }>>`
        SELECT COALESCE(SUM(s.cantidad * s.costo_promedio), 0)::text AS valor,
               COUNT(*) FILTER (WHERE s.cantidad > 0)::text AS items
        FROM stock s WHERE s.tenant_id = ${t}::uuid AND s.sucursal_id = ${sucursalId}::uuid`,
      this.prisma.factura.count({ where: { tenantId: t, estado: 'PENDIENTE_TRANSMISION' } }),
      this.prisma.$queryRaw<Array<{ id: string; sku: string; nombre: string; cantidad: string; stock_minimo: string }>>`
        SELECT p.id, p.sku, p.nombre, s.cantidad::text, p.stock_minimo::text
        FROM stock s JOIN producto p ON p.id = s.producto_id
        WHERE s.tenant_id = ${t}::uuid AND s.sucursal_id = ${sucursalId}::uuid
          AND p.estado = 'ACTIVO' AND p.stock_minimo > 0 AND s.cantidad <= p.stock_minimo
        ORDER BY (s.cantidad / NULLIF(p.stock_minimo, 0)) ASC
        LIMIT 8`,
      this.prisma.$queryRaw<Array<{ producto_id: string; descripcion: string; unidades: string; importe: string; utilidad: string }>>`
        SELECT vl.producto_id, vl.descripcion, SUM(vl.cantidad)::text AS unidades,
               SUM(vl.total_linea)::text AS importe,
               SUM(vl.base_gravable - COALESCE(vl.costo_unitario, 0) * vl.cantidad)::text AS utilidad
        FROM venta_linea vl JOIN venta v ON v.id = vl.venta_id
        WHERE v.tenant_id = ${t}::uuid AND v.sucursal_id = ${sucursalId}::uuid
          AND v.estado = 'COBRADA' AND v.cobrada_en >= ${hace7d}
        GROUP BY vl.producto_id, vl.descripcion
        ORDER BY SUM(vl.total_linea) DESC
        LIMIT 5`,
      this.prisma.$queryRaw<Array<{ dia: string; total: string; ventas: string }>>`
        SELECT to_char(date_trunc('day', v.cobrada_en AT TIME ZONE 'America/Panama'), 'YYYY-MM-DD') AS dia,
               SUM(v.total)::text AS total, COUNT(*)::text AS ventas
        FROM venta v
        WHERE v.tenant_id = ${t}::uuid AND v.sucursal_id = ${sucursalId}::uuid
          AND v.estado = 'COBRADA' AND v.cobrada_en >= ${hace7d}
        GROUP BY 1 ORDER BY 1`,
    ]);

    // Efectivo esperado en la caja abierta (apertura + ventas efectivo + ingresos − egresos/retiros)
    let efectivoEnCaja: string | null = null;
    let ventasTurno = 0;
    if (cajaAbierta) {
      const [r] = await this.prisma.$queryRaw<Array<{ efectivo: string; ventas: string }>>`
        SELECT COALESCE(SUM(CASE
          WHEN cm.tipo = 'APERTURA' THEN cm.monto
          WHEN cm.tipo = 'VENTA' AND cm.metodo = 'EFECTIVO' THEN cm.monto
          WHEN cm.tipo = 'INGRESO' THEN cm.monto
          WHEN cm.tipo IN ('EGRESO', 'RETIRO') THEN -cm.monto
          ELSE 0 END), 0)::text AS efectivo,
          COUNT(DISTINCT cm.venta_id) FILTER (WHERE cm.tipo = 'VENTA')::text AS ventas
        FROM caja_movimiento cm WHERE cm.caja_sesion_id = ${cajaAbierta.id}::uuid`;
      efectivoEnCaja = money(r?.efectivo ?? 0);
      ventasTurno = Number(r?.ventas ?? 0);
    }

    const totalHoy = D(ventasHoy._sum.total ?? 0);
    const totalAyer = D(ventasAyer._sum.total ?? 0);
    const base = D(utilidadHoy[0]?.base ?? 0);
    const utilidad = D(utilidadHoy[0]?.utilidad ?? 0);

    return {
      hoy: {
        ventas: ventasHoy._count,
        total: money(totalHoy),
        itbms: money(ventasHoy._sum.itbmsTotal ?? 0),
        ticketPromedio: ventasHoy._count ? money(totalHoy.div(ventasHoy._count)) : '0.00',
        utilidadBruta: money(utilidad),
        margenPct: base.gt(0) ? utilidad.div(base).mul(100).toFixed(1) : null,
        vsAyer: {
          ventas: ventasAyer._count,
          total: money(totalAyer),
          cambioPct: totalAyer.gt(0) ? totalHoy.sub(totalAyer).div(totalAyer).mul(100).toFixed(1) : null,
        },
        pagosPorMetodo: pagosHoy.map((p) => ({ metodo: p.metodo, monto: money(p.monto), pagos: Number(p.pagos) })),
      },
      caja: {
        abierta: !!cajaAbierta,
        desde: cajaAbierta?.abiertaEn ?? null,
        efectivoEnCaja,
        ventasTurno,
        ultimoCierre: ultimoCierre
          ? { fecha: ultimoCierre.cerradaEn, descuadre: money(ultimoCierre.descuadreTotal ?? 0) }
          : null,
      },
      porCobrar: {
        ventas: preparacion._count,
        monto: money(preparacion._sum.total ?? 0),
        masAntigua: preparacion._min.creadoEn ?? null,
      },
      inventario: {
        valorizado: money(inventario[0]?.valor ?? 0),
        itemsConStock: Number(inventario[0]?.items ?? 0),
        stockBajo: stockBajoFilas.map((f) => ({ id: f.id, sku: f.sku, nombre: f.nombre, cantidad: f.cantidad, stockMinimo: f.stock_minimo })),
      },
      facturasPendientesTransmision: facturasPendientes,
      topProductos7d: topLineas.map((x) => ({
        productoId: x.producto_id,
        descripcion: x.descripcion,
        unidades: x.unidades,
        importe: money(x.importe),
        utilidad: money(x.utilidad),
      })),
      serie7d: serie,
    };
  }
}

@Module({ controllers: [DashboardController] })
export class DashboardModule {}
