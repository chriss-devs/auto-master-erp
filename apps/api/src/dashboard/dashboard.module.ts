import { Controller, Get, Module } from '@nestjs/common';
import { Ctx, RequierePermiso, SucursalActual, UsuarioActual } from '../common/decorators';
import { D, money } from '../common/dinero';
import { PrismaService } from '../common/prisma.service';

/** Día operativo en America/Panama (UTC-5 fijo, sin DST — BL-014). */
function rangoDiaPanama(ahora = new Date()): { desde: Date; hasta: Date } {
  const offsetMs = 5 * 3600_000;
  const local = new Date(ahora.getTime() - offsetMs);
  const inicioLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return { desde: new Date(inicioLocal + offsetMs), hasta: new Date(inicioLocal + offsetMs + 24 * 3600_000) };
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  /** Dashboard accionable básico (Fase 1): hoy, alertas y pendientes que requieren acción. */
  @Get()
  @RequierePermiso('reportes:ver')
  async resumen(@UsuarioActual() ctx: Ctx, @SucursalActual() sucursalId: string) {
    const { desde, hasta } = rangoDiaPanama();
    const hace7d = new Date(Date.now() - 7 * 24 * 3600_000);

    const [ventasHoy, enPreparacion, cajaAbierta, facturasPendientes, stockBajoFilas, topLineas] = await Promise.all([
      this.prisma.venta.findMany({
        where: { tenantId: ctx.tenantId, sucursalId, estado: 'COBRADA', cobradaEn: { gte: desde, lt: hasta } },
        select: { total: true, itbmsTotal: true },
      }),
      this.prisma.venta.count({ where: { tenantId: ctx.tenantId, sucursalId, estado: 'PREPARACION' } }),
      this.prisma.cajaSesion.findFirst({ where: { tenantId: ctx.tenantId, sucursalId, estado: 'ABIERTA' }, select: { id: true, abiertaEn: true } }),
      this.prisma.factura.count({ where: { tenantId: ctx.tenantId, estado: 'PENDIENTE_TRANSMISION' } }),
      this.prisma.$queryRaw<Array<{ id: string; sku: string; nombre: string; cantidad: string; stock_minimo: string }>>`
        SELECT p.id, p.sku, p.nombre, s.cantidad::text, p.stock_minimo::text
        FROM stock s JOIN producto p ON p.id = s.producto_id
        WHERE s.tenant_id = ${ctx.tenantId}::uuid AND s.sucursal_id = ${sucursalId}::uuid
          AND p.estado = 'ACTIVO' AND p.stock_minimo > 0 AND s.cantidad <= p.stock_minimo
        ORDER BY (s.cantidad / NULLIF(p.stock_minimo, 0)) ASC
        LIMIT 8`,
      this.prisma.$queryRaw<Array<{ producto_id: string; descripcion: string; unidades: string; importe: string }>>`
        SELECT vl.producto_id, vl.descripcion, SUM(vl.cantidad)::text AS unidades, SUM(vl.total_linea)::text AS importe
        FROM venta_linea vl JOIN venta v ON v.id = vl.venta_id
        WHERE v.tenant_id = ${ctx.tenantId}::uuid AND v.sucursal_id = ${sucursalId}::uuid
          AND v.estado = 'COBRADA' AND v.cobrada_en >= ${hace7d}
        GROUP BY vl.producto_id, vl.descripcion
        ORDER BY SUM(vl.total_linea) DESC
        LIMIT 5`,
    ]);

    const totalHoy = ventasHoy.reduce((a, v) => a.add(D(v.total)), D(0));
    const itbmsHoy = ventasHoy.reduce((a, v) => a.add(D(v.itbmsTotal)), D(0));

    // Serie de 7 días para mini-gráfico
    const serie = await this.prisma.$queryRaw<Array<{ dia: string; total: string; ventas: string }>>`
      SELECT to_char(date_trunc('day', v.cobrada_en AT TIME ZONE 'America/Panama'), 'YYYY-MM-DD') AS dia,
             SUM(v.total)::text AS total, COUNT(*)::text AS ventas
      FROM venta v
      WHERE v.tenant_id = ${ctx.tenantId}::uuid AND v.sucursal_id = ${sucursalId}::uuid
        AND v.estado = 'COBRADA' AND v.cobrada_en >= ${hace7d}
      GROUP BY 1 ORDER BY 1`;

    return {
      hoy: {
        ventas: ventasHoy.length,
        total: money(totalHoy),
        itbms: money(itbmsHoy),
        ticketPromedio: ventasHoy.length ? money(totalHoy.div(ventasHoy.length)) : '0.00',
      },
      accionables: {
        ventasEnPreparacion: enPreparacion,
        cajaAbierta: cajaAbierta ? { id: cajaAbierta.id, desde: cajaAbierta.abiertaEn } : null,
        facturasPendientesTransmision: facturasPendientes,
        stockBajo: stockBajoFilas.map((f) => ({ id: f.id, sku: f.sku, nombre: f.nombre, cantidad: f.cantidad, stockMinimo: f.stock_minimo })),
      },
      topProductos7d: topLineas.map((t) => ({ productoId: t.producto_id, descripcion: t.descripcion, unidades: t.unidades, importe: t.importe })),
      serie7d: serie,
    };
  }
}

@Module({ controllers: [DashboardController] })
export class DashboardModule {}
