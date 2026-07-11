import { Injectable } from '@nestjs/common';
import { err } from '../common/errores';

export interface ToolCallLLM {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface MensajeLLM {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCallLLM[];
  tool_call_id?: string;
}

export interface ToolDefLLM {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** Cliente mínimo de DeepSeek (API compatible OpenAI) vía fetch nativo — sin SDKs (spec v1). */
@Injectable()
export class DeepseekClient {
  async completar(mensajes: MensajeLLM[], tools: ToolDefLLM[]): Promise<MensajeLLM> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw err.regla('ASISTENTE_NO_CONFIGURADO', 'El asistente no está configurado.');
    const base = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
        messages: mensajes,
        ...(tools.length ? { tools } : {}),
        temperature: 0.2,
        max_tokens: 1000,
      }),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      throw new Error(`DeepSeek respondió ${res.status}: ${detalle.slice(0, 300)}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: MensajeLLM }> };
    const msg = json.choices?.[0]?.message;
    if (!msg) throw new Error('DeepSeek: respuesta sin choices[0].message');
    return msg;
  }
}
