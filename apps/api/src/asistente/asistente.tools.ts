import { ProductosService } from '../catalogo/productos.service';
import { Ctx } from '../common/decorators';
import { money } from '../common/dinero';
import { rangoDeFecha, rangoDiaPanama } from '../common/fechas';
import { PrismaService } from '../common/prisma.service';

export interface ToolDeps {
  prisma: PrismaService;
  productos: ProductosService;
}

/** Herramienta curada del asistente (spec 2026-07-11): solo lectura, RBAC re-verificado al ejecutar. */
export interface Herramienta {
  nombre: string;
  descripcion: string;
  parametros: Record<string, unknown>;
  /** El usuario necesita ALGUNO de estos permisos. */
  permisos: string[];
  ejecutar(deps: ToolDeps, ctx: Ctx, args: Record<string, unknown>): Promise<unknown>;
}

const SIN_PARAMS = { type: 'object', properties: {}, additionalProperties: false } as const;

export const HERRAMIENTAS: Herramienta[] = [
  {
    nombre: 'buscar_producto',
    descripcion: 'Busca productos por nombre, código o marca. Devuelve precio y stock por sucursal visible, con url interna.',
    parametros: {
      type: 'object',
      properties: { q: { type: 'string', description: 'Texto de búsqueda (nombre, código o marca)' } },
      required: ['q'],
      additionalProperties: false,
    },
    permisos: ['productos:ver'],
    async ejecutar(deps, ctx, args) {
      const q = String(args.q ?? '').trim();
      if (!q) return { error: 'Indique qué producto buscar.' };
      const { datos } = await deps.productos.buscar(ctx, q, 5);
      return {
        productos: datos.map((p: any) => ({
          id: p.id,
          sku: p.sku,
          nombre: p.nombre,
          marca: p.marca?.nombre ?? null,
          precio: money(p.precioBase),
          stock: p.stocks
            .filter((s: any) => ctx.sucursalIds.includes(s.sucursalId))
            .map((s: any) => ({ sucursal: s.sucursal.nombre, cantidad: s.cantidad.toString() })),
          url: `/productos/${p.id}`,
        })),
      };
    },
  },
  {
    nombre: 'stock_de_producto',
    descripcion: 'Stock exacto de un producto (por id) en todas las sucursales visibles del usuario, con stock mínimo.',
    parametros: {
      type: 'object',
      properties: { productoId: { type: 'string', description: 'id del producto (uuid, obtenido de buscar_producto)' } },
      required: ['productoId'],
      additionalProperties: false,
    },
    permisos: ['productos:ver'],
    async ejecutar(deps, ctx, args) {
      const id = String(args.productoId ?? '');
      const p = await deps.prisma.producto.findFirst({
        where: { id, tenantId: ctx.tenantId },
        select: { id: true, sku: true, nombre: true, stockMinimo: true },
      });
      if (!p) return { error: 'El producto no existe.' };
      const stocks = await deps.prisma.stock.findMany({
        where: { tenantId: ctx.tenantId, productoId: id, sucursalId: { in: ctx.sucursalIds } },
        include: { sucursal: { select: { codigo: true, nombre: true } } },
      });
      return {
        producto: { sku: p.sku, nombre: p.nombre, stockMinimo: p.stockMinimo.toString(), url: `/productos/${p.id}` },
        stock: stocks.map((s) => ({ sucursal: s.sucursal.nombre, cantidad: s.cantidad.toString() })),
      };
    },
  },
  {
    nombre: 'productos_bajo_minimo',
    descripcion: 'Productos con stock igual o por debajo del mínimo en la sucursal activa (alertas de reposición).',
    parametros: SIN_PARAMS,
    permisos: ['inventario:ver'],
    async ejecutar(deps, ctx) {
      if (!ctx.sucursalId) return { error: 'No hay sucursal activa.' };
      const filas = await deps.prisma.$queryRaw<Array<{ id: string; sku: string; nombre: string; cantidad: string; stock_minimo: string }>>`
        SELECT p.id, p.sku, p.nombre, s.cantidad::text, p.stock_minimo::text
        FROM stock s JOIN producto p ON p.id = s.producto_id
        WHERE s.tenant_id = ${ctx.tenantId}::uuid AND s.sucursal_id = ${ctx.sucursalId}::uuid
          AND p.estado = 'ACTIVO' AND p.stock_minimo > 0 AND s.cantidad <= p.stock_minimo
        ORDER BY (s.cantidad / NULLIF(p.stock_minimo, 0)) ASC
        LIMIT 15`;
      return {
        alertas: filas.map((f) => ({ sku: f.sku, nombre: f.nombre, cantidad: f.cantidad, minimo: f.stock_minimo, url: `/productos/${f.id}` })),
        url: '/inventario',
      };
    },
  },
  {
    nombre: 'ventas_del_dia',
    descripcion: 'Total vendido, número de ventas y desglose por método de pago de un día (hoy si no se indica fecha) en la sucursal activa.',
    parametros: {
      type: 'object',
      properties: { fecha: { type: 'string', description: "Fecha 'YYYY-MM-DD' (opcional; por defecto hoy)" } },
      additionalProperties: false,
    },
    permisos: ['ventas:ver'],
    async ejecutar(deps, ctx, args) {
      if (!ctx.sucursalId) return { error: 'No hay sucursal activa.' };
      let rango = rangoDiaPanama(0);
      if (args.fecha !== undefined && args.fecha !== null && args.fecha !== '') {
        const r = rangoDeFecha(String(args.fecha));
        if (!r) return { error: "Fecha inválida; use 'YYYY-MM-DD'." };
        rango = r;
      }
      const [agg, pagos] = await Promise.all([
        deps.prisma.venta.aggregate({
          where: { tenantId: ctx.tenantId, sucursalId: ctx.sucursalId, estado: 'COBRADA', cobradaEn: { gte: rango.desde, lt: rango.hasta } },
          _count: true,
          _sum: { total: true, itbmsTotal: true },
        }),
        deps.prisma.$queryRaw<Array<{ metodo: string; monto: string; pagos: string }>>`
          SELECT vp.metodo::text, SUM(vp.monto)::text AS monto, COUNT(*)::text AS pagos
          FROM venta_pago vp JOIN venta v ON v.id = vp.venta_id
          WHERE v.tenant_id = ${ctx.tenantId}::uuid AND v.sucursal_id = ${ctx.sucursalId}::uuid
            AND v.estado = 'COBRADA' AND v.cobrada_en >= ${rango.desde} AND v.cobrada_en < ${rango.hasta}
          GROUP BY vp.metodo`,
      ]);
      return {
        ventas: agg._count,
        total: money(agg._sum.total ?? 0),
        itbms: money(agg._sum.itbmsTotal ?? 0),
        porMetodo: pagos.map((x) => ({ metodo: x.metodo, monto: money(x.monto), pagos: Number(x.pagos) })),
        url: '/',
      };
    },
  },
  {
    nombre: 'estado_caja',
    descripcion: 'Si la caja de la sucursal activa está abierta y cuánto efectivo se espera en ella.',
    parametros: SIN_PARAMS,
    permisos: ['caja:operar', 'caja:ver_todas'],
    async ejecutar(deps, ctx) {
      if (!ctx.sucursalId) return { error: 'No hay sucursal activa.' };
      const abierta = await deps.prisma.cajaSesion.findFirst({
        where: { tenantId: ctx.tenantId, sucursalId: ctx.sucursalId, estado: 'ABIERTA' },
        select: { id: true, abiertaEn: true },
      });
      if (!abierta) return { abierta: false, url: '/caja' };
      const [r] = await deps.prisma.$queryRaw<Array<{ efectivo: string; ventas: string }>>`
        SELECT COALESCE(SUM(CASE
          WHEN cm.tipo = 'APERTURA' THEN cm.monto
          WHEN cm.tipo = 'VENTA' AND cm.metodo = 'EFECTIVO' THEN cm.monto
          WHEN cm.tipo = 'INGRESO' THEN cm.monto
          WHEN cm.tipo IN ('EGRESO', 'RETIRO') THEN -cm.monto
          ELSE 0 END), 0)::text AS efectivo,
          COUNT(DISTINCT cm.venta_id) FILTER (WHERE cm.tipo = 'VENTA')::text AS ventas
        FROM caja_movimiento cm WHERE cm.caja_sesion_id = ${abierta.id}::uuid`;
      return {
        abierta: true,
        desde: abierta.abiertaEn.toISOString(),
        efectivoEsperado: money(r?.efectivo ?? 0),
        ventasDelTurno: Number(r?.ventas ?? 0),
        url: '/caja',
      };
    },
  },
  {
    nombre: 'ventas_pendientes',
    descripcion: 'Ventas armadas en ventanilla pendientes de cobro en caja (estado PREPARACION) en la sucursal activa.',
    parametros: SIN_PARAMS,
    permisos: ['ventas:ver'],
    async ejecutar(deps, ctx) {
      if (!ctx.sucursalId) return { error: 'No hay sucursal activa.' };
      const where = { tenantId: ctx.tenantId, sucursalId: ctx.sucursalId, estado: 'PREPARACION' as const };
      const [agg, filas] = await Promise.all([
        deps.prisma.venta.aggregate({ where, _count: true, _sum: { total: true } }),
        deps.prisma.venta.findMany({
          where,
          orderBy: { creadoEn: 'asc' },
          take: 10,
          select: { id: true, numero: true, total: true, creadoEn: true },
        }),
      ]);
      return {
        pendientes: agg._count,
        monto: money(agg._sum.total ?? 0),
        ventas: filas.map((v) => ({ numero: v.numero, total: money(v.total), desde: v.creadoEn.toISOString() })),
        url: '/caja',
      };
    },
  },
  {
    nombre: 'top_productos',
    descripcion: 'Productos más vendidos por importe en los últimos N días (default 7) en la sucursal activa.',
    parametros: {
      type: 'object',
      properties: { dias: { type: 'integer', description: 'Días hacia atrás (1–90, default 7)' } },
      additionalProperties: false,
    },
    permisos: ['ventas:ver'],
    async ejecutar(deps, ctx, args) {
      if (!ctx.sucursalId) return { error: 'No hay sucursal activa.' };
      const dias = Math.min(Math.max(Number(args.dias) || 7, 1), 90);
      const desde = new Date(Date.now() - dias * 24 * 3600_000);
      const filas = await deps.prisma.$queryRaw<Array<{ producto_id: string; descripcion: string; unidades: string; importe: string }>>`
        SELECT vl.producto_id, vl.descripcion, SUM(vl.cantidad)::text AS unidades, SUM(vl.total_linea)::text AS importe
        FROM venta_linea vl JOIN venta v ON v.id = vl.venta_id
        WHERE v.tenant_id = ${ctx.tenantId}::uuid AND v.sucursal_id = ${ctx.sucursalId}::uuid
          AND v.estado = 'COBRADA' AND v.cobrada_en >= ${desde}
        GROUP BY vl.producto_id, vl.descripcion
        ORDER BY SUM(vl.total_linea) DESC
        LIMIT 10`;
      return {
        dias,
        top: filas.map((x) => ({ nombre: x.descripcion, unidades: x.unidades, importe: money(x.importe), url: `/productos/${x.producto_id}` })),
      };
    },
  },
  {
    nombre: 'buscar_cliente',
    descripcion: 'Busca clientes por nombre o RUC/cédula; devuelve datos de contacto y últimas compras.',
    parametros: {
      type: 'object',
      properties: { q: { type: 'string', description: 'Nombre o RUC/cédula' } },
      required: ['q'],
      additionalProperties: false,
    },
    permisos: ['clientes:ver'],
    async ejecutar(deps, ctx, args) {
      const q = String(args.q ?? '').trim();
      if (!q) return { error: 'Indique qué cliente buscar.' };
      const clientes = await deps.prisma.cliente.findMany({
        where: {
          tenantId: ctx.tenantId,
          activo: true,
          OR: [{ nombre: { contains: q, mode: 'insensitive' } }, { rucOCedula: { contains: q, mode: 'insensitive' } }],
        },
        take: 5,
        select: { id: true, nombre: true, rucOCedula: true, telefono: true },
      });
      if (!clientes.length) return { clientes: [] };
      const compras = await deps.prisma.venta.findMany({
        where: { tenantId: ctx.tenantId, clienteId: clientes[0].id, estado: 'COBRADA' },
        orderBy: { cobradaEn: 'desc' },
        take: 3,
        select: { numero: true, total: true, cobradaEn: true },
      });
      return {
        clientes: clientes.map((c) => ({ nombre: c.nombre, rucOCedula: c.rucOCedula, telefono: c.telefono, url: '/clientes' })),
        ultimasComprasDelPrimero: compras.map((v) => ({ numero: v.numero, total: money(v.total), fecha: v.cobradaEn?.toISOString() ?? null })),
      };
    },
  },
];

/** Solo las herramientas para las que el usuario tiene ALGÚN permiso (el modelo no ve el resto). */
export function herramientasPara(ctx: Ctx): Herramienta[] {
  return HERRAMIENTAS.filter((h) => h.permisos.some((p) => ctx.permisos.has(p)));
}
