import type { Ctx } from '../common/decorators';
import { HERRAMIENTAS, herramientasPara } from './asistente.tools';

const ctxCon = (permisos: string[]): Ctx => ({
  usuarioId: 'u1', usuario: 'test', nombre: 'Test', tenantId: 't1', sesionId: 's1',
  permisos: new Set(permisos), rolCodigos: [], sucursalIds: ['suc1', 'suc2'],
  sucursalActivaId: 'suc1', sucursalId: 'suc1', debeCambiarClave: false,
});

describe('herramientasPara (filtrado RBAC — spec: el modelo no ve lo que no puede)', () => {
  it('vendedor sin caja no recibe estado_caja', () => {
    const nombres = herramientasPara(ctxCon(['productos:ver', 'ventas:ver'])).map((h) => h.nombre);
    expect(nombres).toContain('buscar_producto');
    expect(nombres).toContain('ventas_del_dia');
    expect(nombres).not.toContain('estado_caja');
    expect(nombres).not.toContain('buscar_cliente');
  });

  it('estado_caja acepta caja:operar O caja:ver_todas', () => {
    expect(herramientasPara(ctxCon(['caja:operar'])).map((h) => h.nombre)).toContain('estado_caja');
    expect(herramientasPara(ctxCon(['caja:ver_todas'])).map((h) => h.nombre)).toContain('estado_caja');
  });

  it('sin permisos ⇒ cero herramientas', () => {
    expect(herramientasPara(ctxCon([]))).toHaveLength(0);
  });

  it('las 8 herramientas del spec existen con schema y descripción', () => {
    const nombres = HERRAMIENTAS.map((h) => h.nombre).sort();
    expect(nombres).toEqual([
      'buscar_cliente', 'buscar_producto', 'estado_caja', 'productos_bajo_minimo',
      'stock_de_producto', 'top_productos', 'ventas_del_dia', 'ventas_pendientes',
    ]);
    for (const h of HERRAMIENTAS) {
      expect(h.descripcion.length).toBeGreaterThan(10);
      expect(h.parametros).toHaveProperty('type', 'object');
      expect(h.permisos.length).toBeGreaterThan(0);
    }
  });
});

const sucursalesVisibles = [
  { id: 'suc1', codigo: '0001', nombre: 'Colón centro' },
  { id: 'suc2', codigo: '0002', nombre: 'Colón norte' },
];
const prismaSucursales = { sucursal: { findMany: jest.fn(async () => sucursalesVisibles) } };

describe('ejecución con deps simuladas', () => {
  it('buscar_producto responde con UNA sola sucursal (la activa por defecto)', async () => {
    const h = HERRAMIENTAS.find((x) => x.nombre === 'buscar_producto')!;
    const productos = {
      buscar: jest.fn(async () => ({
        datos: [{
          id: 'p1', sku: 'ABC', nombre: 'Filtro aceite', precioBase: '8.50',
          marca: { nombre: 'FRAM' },
          stocks: [
            { sucursalId: 'suc1', cantidad: { toString: () => '12' } },
            { sucursalId: 'suc2', cantidad: { toString: () => '9' } },
          ],
        }],
      })),
    };
    const r: any = await h.ejecutar({ prisma: prismaSucursales as any, productos: productos as any }, ctxCon(['productos:ver']), { q: 'filtro' });
    expect(r.productos[0].url).toBe('/productos/p1');
    expect(r.productos[0].precio).toBe('8.50');
    // Sucursal activa (suc1) por defecto, no una lista combinada de sucursales
    expect(r.sucursal).toBe('Colón centro');
    expect(r.productos[0].stock).toBe('12');
  });

  it('buscar_producto acepta pedir otra sucursal por código, sin combinarlas', async () => {
    const h = HERRAMIENTAS.find((x) => x.nombre === 'buscar_producto')!;
    const productos = {
      buscar: jest.fn(async () => ({
        datos: [{
          id: 'p1', sku: 'ABC', nombre: 'Filtro aceite', precioBase: '8.50', marca: null,
          stocks: [
            { sucursalId: 'suc1', cantidad: { toString: () => '12' } },
            { sucursalId: 'suc2', cantidad: { toString: () => '9' } },
          ],
        }],
      })),
    };
    const r: any = await h.ejecutar({ prisma: prismaSucursales as any, productos: productos as any }, ctxCon(['productos:ver']), { q: 'filtro', sucursal: '0002' });
    expect(r.sucursal).toBe('Colón norte');
    expect(r.productos[0].stock).toBe('9');
  });

  it('ventas_del_dia rechaza fecha inválida con {error}', async () => {
    const h = HERRAMIENTAS.find((x) => x.nombre === 'ventas_del_dia')!;
    const r: any = await h.ejecutar({ prisma: {} as any, productos: {} as any }, ctxCon(['ventas:ver']), { fecha: 'ayer' });
    expect(r.error).toMatch(/fecha/i);
  });

  it('buscar_cliente con ventas:ver acota compras a UNA sola sucursal (la activa, no cruza/combina)', async () => {
    const h = HERRAMIENTAS.find((x) => x.nombre === 'buscar_cliente')!;
    const ventaFindMany = jest.fn(async (_args: any) => [
      { numero: 'V-0001-0007', total: '25.00', cobradaEn: new Date('2026-07-01T15:00:00Z') },
    ]);
    const prisma = {
      ...prismaSucursales,
      cliente: { findMany: jest.fn(async () => [{ id: 'c1', nombre: 'Juan', rucOCedula: '8-1', telefono: '60000000' }]) },
      venta: { findMany: ventaFindMany },
    };
    const r: any = await h.ejecutar({ prisma: prisma as any, productos: {} as any }, ctxCon(['clientes:ver', 'ventas:ver']), { q: 'Juan' });
    // La consulta de compras DEBE filtrar por UNA sola sucursalId (la activa), no una lista
    expect(ventaFindMany).toHaveBeenCalledTimes(1);
    expect(ventaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          clienteId: 'c1',
          estado: 'COBRADA',
          sucursalId: 'suc1',
        }),
      }),
    );
    expect(r.sucursal).toBe('Colón centro');
    expect(r.ultimasComprasDelPrimero[0].total).toBe('25.00');
  });

  it('buscar_cliente SIN ventas:ver no expone compras (dato de ventas) ni consulta ventas', async () => {
    const h = HERRAMIENTAS.find((x) => x.nombre === 'buscar_cliente')!;
    const ventaFindMany = jest.fn();
    const prisma = {
      ...prismaSucursales,
      cliente: { findMany: jest.fn(async () => [{ id: 'c1', nombre: 'Juan', rucOCedula: '8-1', telefono: '60000000' }]) },
      venta: { findMany: ventaFindMany },
    };
    const r: any = await h.ejecutar({ prisma: prisma as any, productos: {} as any }, ctxCon(['clientes:ver']), { q: 'Juan' });
    expect(r.clientes).toHaveLength(1);
    expect(r).not.toHaveProperty('ultimasComprasDelPrimero');
    expect(ventaFindMany).not.toHaveBeenCalled();
  });
});
