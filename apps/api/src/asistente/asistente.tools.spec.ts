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

describe('ejecución con deps simuladas', () => {
  it('buscar_producto mapea resultado compacto con url', async () => {
    const h = HERRAMIENTAS.find((x) => x.nombre === 'buscar_producto')!;
    const productos = {
      buscar: jest.fn(async () => ({
        datos: [{
          id: 'p1', sku: 'ABC', nombre: 'Filtro aceite', precioBase: '8.50',
          marca: { nombre: 'FRAM' },
          stocks: [
            { sucursalId: 'suc1', cantidad: { toString: () => '12' }, sucursal: { id: 'suc1', codigo: '0001', nombre: 'Colón centro' } },
            { sucursalId: 'sucX', cantidad: { toString: () => '9' }, sucursal: { id: 'sucX', codigo: '0009', nombre: 'Otra empresa' } },
          ],
        }],
      })),
    };
    const r: any = await h.ejecutar({ prisma: {} as any, productos: productos as any }, ctxCon(['productos:ver']), { q: 'filtro' });
    expect(r.productos[0].url).toBe('/productos/p1');
    expect(r.productos[0].precio).toBe('8.50');
    // Solo sucursales visibles del usuario (suc1, suc2) — sucX se excluye
    expect(r.productos[0].stock).toEqual([{ sucursal: 'Colón centro', cantidad: '12' }]);
  });

  it('ventas_del_dia rechaza fecha inválida con {error}', async () => {
    const h = HERRAMIENTAS.find((x) => x.nombre === 'ventas_del_dia')!;
    const r: any = await h.ejecutar({ prisma: {} as any, productos: {} as any }, ctxCon(['ventas:ver']), { fecha: 'ayer' });
    expect(r.error).toMatch(/fecha/i);
  });
});
