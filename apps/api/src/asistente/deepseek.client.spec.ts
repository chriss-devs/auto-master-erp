import { DeepseekClient } from './deepseek.client';

describe('DeepseekClient', () => {
  const fetchOriginal = global.fetch;
  beforeEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
  });
  afterEach(() => {
    global.fetch = fetchOriginal;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_BASE_URL;
    delete process.env.DEEPSEEK_MODEL;
  });

  it('sin DEEPSEEK_API_KEY lanza ASISTENTE_NO_CONFIGURADO (422)', async () => {
    const c = new DeepseekClient();
    await expect(c.completar([], [])).rejects.toMatchObject({ codigo: 'ASISTENTE_NO_CONFIGURADO' });
  });

  it('envía model/messages/tools y devuelve choices[0].message', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    let capturado: any;
    global.fetch = jest.fn(async (url: any, init: any) => {
      capturado = { url: String(url), headers: init.headers, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'hola' } }] }), { status: 200 });
    }) as any;
    const c = new DeepseekClient();
    const msg = await c.completar([{ role: 'user', content: 'q' }], []);
    expect(msg.content).toBe('hola');
    expect(capturado.url).toBe('https://api.deepseek.com/chat/completions');
    expect(capturado.body.model).toBe('deepseek-chat');
    expect(capturado.body.max_tokens).toBe(1000);
    expect(capturado.headers.Authorization).toBe('Bearer sk-test');
    expect('tools' in capturado.body).toBe(false); // tools omitido cuando el array está vacío
  });

  it('status != 200 lanza error interno con detalle', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    global.fetch = jest.fn(async () => new Response('rate limited', { status: 429 })) as any;
    const c = new DeepseekClient();
    const p = c.completar([{ role: 'user', content: 'q' }], []);
    await expect(p).rejects.toThrow(/DeepSeek/);
    await expect(c.completar([{ role: 'user', content: 'q' }], [])).rejects.toThrow(/429/);
  });

  it('incluye tools en el body y respeta DEEPSEEK_BASE_URL/DEEPSEEK_MODEL', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    process.env.DEEPSEEK_BASE_URL = 'http://localhost:9999';
    process.env.DEEPSEEK_MODEL = 'deepseek-reasoner';
    let capturado: any;
    global.fetch = jest.fn(async (url: any, init: any) => {
      capturado = { url: String(url), body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }), { status: 200 });
    }) as any;
    const tools = [{ type: 'function' as const, function: { name: 'x', description: 'd', parameters: { type: 'object' } } }];
    const c = new DeepseekClient();
    await c.completar([{ role: 'user', content: 'q' }], tools);
    expect(capturado.url).toBe('http://localhost:9999/chat/completions');
    expect(capturado.body.model).toBe('deepseek-reasoner');
    expect(capturado.body.tools).toEqual(tools);
  });

  it('respuesta 200 sin choices lanza error', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })) as any;
    const c = new DeepseekClient();
    await expect(c.completar([{ role: 'user', content: 'q' }], [])).rejects.toThrow(/choices/);
  });
});
