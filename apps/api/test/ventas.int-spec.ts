/**
 * Pruebas de integración de las reglas críticas (13 §4, BL-015) contra BD real:
 *  - RBAC 403 (09 §3.3)
 *  - No vender sin stock (RN-007) y sin efectos parciales (atomicidad)
 *  - Cobro atómico: stock + movimiento + caja + factura + auditoría (RF-VEN-002)
 *  - Idempotencia del cobro (08 §8)
 *  - Cuadre de caja por método (RN-120)
 * Requiere DATABASE_URL/DIRECT_URL (CI: Postgres service + db push + seed).
 */
import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createApp } from '../src/bootstrap';

jest.setTimeout(120_000);

const PASS = { admin: 'AutoMaster#2026', vendedor: 'Vendedor#2026', caja: 'Caja#2026' };

describe('Flujo crítico: venta en dos pasos (D-020)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;
  const cookies: Record<string, string> = {};
  let sucursalId: string;
  let productoId: string;
  const sku = `TEST-${Date.now()}`;

  const login = async (usuario: keyof typeof PASS) => {
    const res = await http.post('/api/v1/auth/login').send({ usuario, password: PASS[usuario] }).expect(201);
    const setCookie = res.headers['set-cookie']?.[0];
    expect(setCookie).toContain('am_session=');
    cookies[usuario] = setCookie.split(';')[0];
  };
  const as = (u: keyof typeof PASS) => ({ Cookie: cookies[u], 'X-Sucursal-Id': sucursalId });

  beforeAll(async () => {
    process.env.COOKIE_SECURE = 'false';
    app = await createApp();
    await app.init();
    http = request(app.getHttpServer());

    await login('admin');
    await login('vendedor');
    await login('caja');

    const me = await http.get('/api/v1/auth/me').set('Cookie', cookies.admin).expect(200);
    const suc = me.body.sucursales.find((s: { codigo: string }) => s.codigo === '0001');
    expect(suc).toBeDefined();
    sucursalId = suc.id;

    // Producto de prueba con stock inicial 5 @ costo 2.00 (ENTRADA_INICIAL)
    const unidades = await http.get('/api/v1/unidades').set(as('admin')).expect(200);
    const und = unidades.body.find((u: { codigo: string }) => u.codigo === 'UND');
    const prod = await http
      .post('/api/v1/productos')
      .set(as('admin'))
      .send({
        sku,
        nombre: `Producto prueba ${sku}`,
        unidadMedidaId: und.id,
        precioBase: '10.00',
        tasaItbms: '0.07',
        stockInicial: [{ sucursalId, cantidad: '5', costoUnitario: '2.00' }],
      })
      .expect(201);
    productoId = prod.body.id;

    // Asegurar caja cerrada antes de empezar (reejecuciones locales)
    const estado = await http.get('/api/v1/caja/estado').set(as('caja')).expect(200);
    if (estado.body.abierta) {
      await http.post(`/api/v1/caja/sesiones/${estado.body.sesion.id}/cerrar`).set(as('caja')).send({ contado: {} }).expect(201);
    }
  });

  afterAll(async () => {
    if (productoId) {
      await http.patch(`/api/v1/productos/${productoId}`).set(as('admin')).send({ estado: 'DESCONTINUADO' });
    }
    await app.close();
  });

  const stockActual = async (): Promise<string> => {
    const res = await http.get(`/api/v1/productos/${productoId}`).set(as('admin')).expect(200);
    const st = res.body.stocks.find((s: { sucursal: { id: string } }) => s.sucursal.id === sucursalId);
    return st ? String(st.cantidad) : '0';
  };

  it('RBAC: el vendedor no puede abrir caja ni crear productos (403, 09 §3.3)', async () => {
    const r1 = await http.post('/api/v1/caja/sesiones').set(as('vendedor')).send({ montoInicial: '50.00' }).expect(403);
    expect(r1.body.error.codigo).toBe('SIN_PERMISO');
    const r2 = await http.post('/api/v1/productos').set(as('vendedor')).send({}).expect(403);
    expect(r2.body.error.codigo).toBe('SIN_PERMISO');
  });

  it('sin sesión → 401 con formato de error uniforme (08 §4)', async () => {
    const r = await http.get('/api/v1/productos').expect(401);
    expect(r.body.error.codigo).toBe('NO_AUTENTICADO');
    expect(r.body.error.trace_id).toBeDefined();
  });

  it('no se puede cobrar sin caja abierta (RN-123/D-039)', async () => {
    const venta = await http
      .post('/api/v1/ventas')
      .set(as('vendedor'))
      .send({ lineas: [{ productoId, cantidad: '1' }] })
      .expect(201);
    const r = await http
      .post(`/api/v1/ventas/${venta.body.venta.id}/cobrar`)
      .set(as('caja'))
      .send({ pagos: [{ metodo: 'EFECTIVO', monto: '10.70' }], efectivoRecibido: '10.70', idempotencyKey: `k-nocaja-${sku}` })
      .expect(422);
    expect(r.body.error.codigo).toBe('CAJA_NO_ABIERTA');
    await http.post(`/api/v1/ventas/${venta.body.venta.id}/cancelar`).set(as('vendedor')).send({ motivo: 'prueba' }).expect(201);
  });

  it('la caja abre con monto inicial (RF-CAJ-001)', async () => {
    const r = await http.post('/api/v1/caja/sesiones').set(as('caja')).send({ montoInicial: '100.00' }).expect(201);
    expect(r.body.estado).toBe('ABIERTA');
  });

  it('RN-007: no vender sin stock — 409 y CERO efectos', async () => {
    const antes = await stockActual();
    const venta = await http
      .post('/api/v1/ventas')
      .set(as('vendedor'))
      .send({ lineas: [{ productoId, cantidad: '999' }] })
      .expect(201);
    expect(venta.body.advertencias?.[0]?.codigo).toBe('STOCK_INSUFICIENTE_ADVERTENCIA');

    const r = await http
      .post(`/api/v1/ventas/${venta.body.venta.id}/cobrar`)
      .set(as('caja'))
      .send({ pagos: [{ metodo: 'EFECTIVO', monto: venta.body.venta.total }], efectivoRecibido: '99999.00', idempotencyKey: `k-sinstock-${sku}` })
      .expect(409);
    expect(r.body.error.codigo).toBe('STOCK_INSUFICIENTE');

    // Atomicidad: nada cambió
    expect(await stockActual()).toBe(antes);
    const v = await http.get(`/api/v1/ventas/${venta.body.venta.id}`).set(as('caja')).expect(200);
    expect(v.body.estado).toBe('PREPARACION');
    expect(v.body.numero).toBeNull();
    const kardex = await http.get(`/api/v1/inventario/productos/${productoId}/kardex`).set(as('admin')).expect(200);
    expect(kardex.body.datos.filter((m: { tipo: string }) => m.tipo === 'SALIDA_VENTA')).toHaveLength(0);
    await http.post(`/api/v1/ventas/${venta.body.venta.id}/cancelar`).set(as('vendedor')).send({ motivo: 'prueba' }).expect(201);
  });

  let ventaId: string;
  let numeroVenta: string;
  const KEY = `k-cobro-${Date.now()}`;

  it('paso 1: el vendedor arma la venta (PREPARACION) con ITBMS correcto', async () => {
    const r = await http
      .post('/api/v1/ventas')
      .set(as('vendedor'))
      .send({ lineas: [{ productoId, cantidad: '2' }], notas: 'ventanilla' })
      .expect(201);
    const v = r.body.venta;
    expect(v.estado).toBe('PREPARACION');
    expect(v.subtotal).toBe('20');
    expect(v.itbmsTotal).toBe('1.4');
    expect(v.total).toBe('21.4');
    ventaId = v.id;
  });

  it('el vendedor NO puede cobrar (403) — separación vendedor/caja (D-020)', async () => {
    const r = await http
      .post(`/api/v1/ventas/${ventaId}/cobrar`)
      .set(as('vendedor'))
      .send({ pagos: [{ metodo: 'EFECTIVO', monto: '21.40' }], idempotencyKey: KEY })
      .expect(403);
    expect(r.body.error.codigo).toBe('SIN_PERMISO');
  });

  it('paso 2: la caja cobra — atómico: stock+movimiento+caja+factura+auditoría (RF-VEN-002)', async () => {
    const r = await http
      .post(`/api/v1/ventas/${ventaId}/cobrar`)
      .set(as('caja'))
      .send({ pagos: [{ metodo: 'EFECTIVO', monto: '21.40' }], efectivoRecibido: '25.00', idempotencyKey: KEY })
      .expect(201);
    const v = r.body;
    expect(v.estado).toBe('COBRADA');
    expect(v.numero).toMatch(/^V-0001-\d{8}$/);
    expect(v.vuelto).toBe('3.6');
    numeroVenta = v.numero;

    // Factura en contingencia con CUFE simulado (BL-009)
    expect(v.factura).toBeTruthy();
    expect(v.factura.estado).toBe('PENDIENTE_TRANSMISION');
    expect(v.factura.numero).toMatch(/^F-0001-\d{8}$/);
    expect(v.factura.cufe).toMatch(/^FE-SIM-/);

    // Stock descontado 5 → 3 con movimiento inmutable ligado a la venta
    expect(await stockActual()).toBe('3');
    const kardex = await http.get(`/api/v1/inventario/productos/${productoId}/kardex`).set(as('admin')).expect(200);
    const salida = kardex.body.datos.find((m: { tipo: string; refId: string }) => m.tipo === 'SALIDA_VENTA' && m.refId === ventaId);
    expect(salida).toBeDefined();
    expect(String(salida.cantidad)).toBe('2');
    expect(String(salida.costoUnitario)).toBe('2'); // costo promedio vigente (RN-009)

    // Caja: esperado EFECTIVO = 100 (apertura) + 21.40
    const caja = await http.get('/api/v1/caja/estado').set(as('caja')).expect(200);
    expect(caja.body.esperado.EFECTIVO).toBe('121.40');

    // Auditoría inmutable del cobro (RN-182)
    const aud = await http.get(`/api/v1/auditoria?entidad=venta&entidadId=${ventaId}`).set(as('admin')).expect(200);
    const cobro = aud.body.datos.find((a: { accion: string }) => a.accion === 'venta.cobrar');
    expect(cobro).toBeDefined();
  });

  it('idempotencia: reintento con la MISMA clave no duplica efectos (08 §8)', async () => {
    const r = await http
      .post(`/api/v1/ventas/${ventaId}/cobrar`)
      .set(as('caja'))
      .send({ pagos: [{ metodo: 'EFECTIVO', monto: '21.40' }], efectivoRecibido: '25.00', idempotencyKey: KEY })
      .expect(201);
    expect(r.body.numero).toBe(numeroVenta);
    expect(await stockActual()).toBe('3'); // sin doble descuento
    const caja = await http.get('/api/v1/caja/estado').set(as('caja')).expect(200);
    expect(caja.body.esperado.EFECTIVO).toBe('121.40'); // sin doble registro en caja
  });

  it('reintento con OTRA clave → 409 YA_COBRADA', async () => {
    const r = await http
      .post(`/api/v1/ventas/${ventaId}/cobrar`)
      .set(as('caja'))
      .send({ pagos: [{ metodo: 'EFECTIVO', monto: '21.40' }], idempotencyKey: `${KEY}-otra` })
      .expect(409);
    expect(r.body.error.codigo).toBe('YA_COBRADA');
  });

  it('cierre de caja con cuadre por método (RN-120/123)', async () => {
    const estado = await http.get('/api/v1/caja/estado').set(as('caja')).expect(200);
    const r = await http
      .post(`/api/v1/caja/sesiones/${estado.body.sesion.id}/cerrar`)
      .set(as('caja'))
      .send({ contado: { EFECTIVO: '121.40', TARJETA: '0', YAPPY: '0', ACH: '0' } })
      .expect(201);
    expect(r.body.cuadre.EFECTIVO.diferencia).toBe('0.00');
    expect(r.body.descuadreTotal).toBe('0.00');
    expect(r.body.sesion.estado).toBe('CERRADA');
  });
});
