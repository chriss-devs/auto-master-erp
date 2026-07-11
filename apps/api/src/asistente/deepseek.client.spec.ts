import { DeepseekClient } from './deepseek.client';

describe('DeepseekClient', () => {
  const fetchOriginal = global.fetch;
  beforeEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
  });
  afterEach(() => {
    global.fetch = fetchOriginal;
    delete process.env.DEEPSEEK_API_KEY;
  });

  it('sin DEEPSEEK_API_KEY lanza ASISTENTE_NO_CONFIGURADO (422)', async () => {
    const c = new DeepseekClient();
    await expect(c.completar([], [])).rejects.toMatchObject({ codigo: 'ASISTENTE_NO_CONFIGURADO' });
  });

  it('envía model/messages/tools y devuelve choices[0].message', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    let capturado: any;
    global.fetch = jest.fn(async (url: any, init: any) => {
      capturado = { url: String(url), body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'hola' } }] }), { status: 200 });
    }) as any;
    const c = new DeepseekClient();
    const msg = await c.completar([{ role: 'user', content: 'q' }], []);
    expect(msg.content).toBe('hola');
    expect(capturado.url).toBe('https://api.deepseek.com/chat/completions');
    expect(capturado.body.model).toBe('deepseek-chat');
    expect(capturado.body.max_tokens).toBe(1000);
  });

  it('status != 200 lanza error interno con detalle', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    global.fetch = jest.fn(async () => new Response('rate limited', { status: 429 })) as any;
    const c = new DeepseekClient();
    await expect(c.completar([{ role: 'user', content: 'q' }], [])).rejects.toThrow(/DeepSeek/);
  });
});
