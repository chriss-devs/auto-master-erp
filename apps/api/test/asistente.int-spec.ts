/**
 * Integración del asistente (spec 2026-07-11) contra BD real y un DeepSeek FALSO por HTTP:
 *  - 401 sin sesión
 *  - round-trip completo: pregunta → tool_call buscar_producto → datos reales → respuesta final
 *  - el vendedor NO ve estado_caja en las tools presentadas (filtrado RBAC)
 * Requiere DATABASE_URL/DIRECT_URL como ventas.int-spec.ts.
 */
import 'reflect-metadata';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createApp } from '../src/bootstrap';

jest.setTimeout(120_000);

const PASS = { admin: 'AutoMaster#2026', vendedor: 'Vendedor#2026' };

describe('Asistente: chat con tool calling', () => {
  let app: NestExpressApplication;
  let httpApi: ReturnType<typeof request>;
  let fake: http.Server;
  const cookies: Record<string, string> = {};
  let sucursalId: string;
  let productoId: string;
  const sku = `ASIS-${Date.now()}`;
  const peticionesLLM: any[] = [];

  beforeAll(async () => {
    // Fake DeepSeek: 1.ª llamada pide buscar_producto; 2.ª responde con el resultado
    fake = http.createServer((req, res) => {
      let cuerpo = '';
      req.on('data', (c) => (cuerpo += c));
      req.on('end', () => {
        const body = JSON.parse(cuerpo);
        peticionesLLM.push(body);
        const esSegunda = body.messages.some((m: any) => m.role === 'tool');
        const message = esSegunda
          ? { role: 'assistant', content: `Hay stock del producto ${sku}. [Ver producto](/productos/${productoId})` }
          : {
              role: 'assistant',
              content: null,
              tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'buscar_producto', arguments: JSON.stringify({ q: sku }) } }],
            };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message }] }));
      });
    });
    await new Promise<void>((ok) => fake.listen(0, '127.0.0.1', ok));
    process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
    process.env.DEEPSEEK_API_KEY = 'sk-fake-para-tests';
    process.env.COOKIE_SECURE = 'false';

    app = await createApp();
    await app.init();
    httpApi = request(app.getHttpServer());

    for (const u of ['admin', 'vendedor'] as const) {
      const res = await httpApi.post('/api/v1/auth/login').send({ usuario: u, password: PASS[u] }).expect(201);
      cookies[u] = res.headers['set-cookie'][0].split(';')[0];
    }
    const me = await httpApi.get('/api/v1/auth/me').set('Cookie', cookies.admin).expect(200);
    sucursalId = me.body.sucursales.find((s: { codigo: string }) => s.codigo === '0001').id;

    const unidades = await httpApi.get('/api/v1/unidades').set('Cookie', cookies.admin).set('X-Sucursal-Id', sucursalId).expect(200);
    const prod = await httpApi
      .post('/api/v1/productos')
      .set('Cookie', cookies.admin)
      .set('X-Sucursal-Id', sucursalId)
      .send({
        sku,
        nombre: `Producto asistente ${sku}`,
        unidadMedidaId: unidades.body.find((u: { codigo: string }) => u.codigo === 'UND').id,
        precioBase: '9.99',
        tasaItbms: '0.07',
        stockInicial: [{ sucursalId, cantidad: '7', costoUnitario: '3.00' }],
      })
      .expect(201);
    productoId = prod.body.id;
  });

  afterAll(async () => {
    if (productoId) {
      await httpApi.patch(`/api/v1/productos/${productoId}`).set('Cookie', cookies.admin).set('X-Sucursal-Id', sucursalId).send({ estado: 'DESCONTINUADO' });
    }
    await app?.close();
    await new Promise<void>((ok) => fake.close(() => ok()));
    delete process.env.DEEPSEEK_BASE_URL;
    delete process.env.DEEPSEEK_API_KEY;
  });

  it('401 sin sesión', async () => {
    await httpApi.post('/api/v1/asistente/chat').send({ mensajes: [] }).expect(401);
  });

  it('round-trip: el vendedor pregunta por stock y recibe respuesta con enlace', async () => {
    const res = await httpApi
      .post('/api/v1/asistente/chat')
      .set('Cookie', cookies.vendedor)
      .set('X-Sucursal-Id', sucursalId)
      .send({ mensajes: [{ rol: 'user', contenido: `¿cuánto stock hay de ${sku}?` }] })
      .expect(201);
    expect(res.body.respuesta).toContain(`/productos/${productoId}`);

    // El fake recibió el resultado REAL de la herramienta (7 unidades del stock inicial)
    const segunda = peticionesLLM.find((p) => p.messages.some((m: any) => m.role === 'tool'));
    const toolContent = JSON.parse(segunda.messages.find((m: any) => m.role === 'tool').content);
    expect(JSON.stringify(toolContent)).toContain('7');

    // Filtrado RBAC: al vendedor no se le presentó estado_caja
    const nombresTools = peticionesLLM[0].tools.map((t: any) => t.function.name);
    expect(nombresTools).toContain('buscar_producto');
    expect(nombresTools).not.toContain('estado_caja');

    // El servidor puso su propio system prompt (no vino del cliente)
    expect(peticionesLLM[0].messages[0].role).toBe('system');
  });
});
