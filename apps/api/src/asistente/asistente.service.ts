import { Injectable } from '@nestjs/common';
import { ProductosService } from '../catalogo/productos.service';
import { Ctx } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';
import { herramientasPara, Herramienta, ToolDeps } from './asistente.tools';
import { DeepseekClient, MensajeLLM, ToolDefLLM } from './deepseek.client';

const MAX_RONDAS = 5;
const MAX_MENSAJES = 10;
const MAX_CHARS = 2000;

export interface ChatBody {
  mensajes?: unknown;
}

/** Solo user/assistant con contenido string; recorta tamaño. El system y los tool results son SIEMPRE del servidor (spec). */
export function sanitizarHistorial(body: ChatBody): MensajeLLM[] {
  if (!Array.isArray(body?.mensajes)) return [];
  const limpios: MensajeLLM[] = [];
  for (const m of body.mensajes as Array<{ rol?: unknown; contenido?: unknown }>) {
    if ((m?.rol === 'user' || m?.rol === 'assistant') && typeof m?.contenido === 'string' && m.contenido.length) {
      limpios.push({ role: m.rol, content: m.contenido.slice(0, MAX_CHARS) });
    }
  }
  return limpios.slice(-MAX_MENSAJES);
}

function systemPrompt(ctx: Ctx): string {
  const ahora = new Date().toLocaleString('es-PA', { timeZone: 'America/Panama', dateStyle: 'full', timeStyle: 'short' });
  return [
    'Eres el Asistente del ERP de Auto Master Colón (ferretería y autopartes en Colón, Panamá).',
    `Usuario: ${ctx.nombre}. Fecha y hora local: ${ahora}. Moneda: balboa (B/.), equivale a USD.`,
    'Respondes SOLO con datos obtenidos de las herramientas; si una herramienta devuelve {error} o no tienes herramienta para algo, dilo claramente y no inventes cifras.',
    'Respuestas breves y en español. Formato permitido: **negritas** y enlaces internos [etiqueta](/ruta) usando las url que devuelven las herramientas. Nada de tablas ni otro markdown.',
    'Cantidades y montos: exactamente los valores devueltos por las herramientas (montos con B/.).',
  ].join('\n');
}

@Injectable()
export class AsistenteService {
  constructor(
    private readonly deepseek: DeepseekClient,
    private readonly prisma: PrismaService,
    private readonly productos: ProductosService,
  ) {}

  async chat(ctx: Ctx, body: ChatBody): Promise<{ respuesta: string }> {
    const permitidas = herramientasPara(ctx);
    const toolDefs: ToolDefLLM[] = permitidas.map((h) => ({
      type: 'function',
      function: { name: h.nombre, description: h.descripcion, parameters: h.parametros },
    }));
    const deps: ToolDeps = { prisma: this.prisma, productos: this.productos };
    const mensajes: MensajeLLM[] = [{ role: 'system', content: systemPrompt(ctx) }, ...sanitizarHistorial(body)];

    for (let ronda = 0; ronda < MAX_RONDAS; ronda++) {
      const msg = await this.deepseek.completar(mensajes, toolDefs);
      if (!msg.tool_calls?.length) return { respuesta: msg.content ?? '' };
      mensajes.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls) {
        const resultado = await this.ejecutarToolCall(permitidas, deps, ctx, tc.function.name, tc.function.arguments);
        mensajes.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(resultado) });
      }
    }
    return { respuesta: 'No pude completar la consulta; intenta con una pregunta más específica.' };
  }

  /** Re-verificación de permiso al ejecutar (defensa en profundidad) y errores como {error} para el modelo. */
  private async ejecutarToolCall(
    permitidas: Herramienta[],
    deps: ToolDeps,
    ctx: Ctx,
    nombre: string,
    argsJson: string,
  ): Promise<unknown> {
    const h = permitidas.find((x) => x.nombre === nombre);
    if (!h) return { error: 'Herramienta no disponible para este usuario.' };
    if (!h.permisos.some((p) => ctx.permisos.has(p))) return { error: 'Sin permiso para esta consulta.' };
    let args: Record<string, unknown>;
    try {
      args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
    } catch {
      return { error: 'Argumentos inválidos.' };
    }
    try {
      return await h.ejecutar(deps, ctx, args);
    } catch (e) {
      return { error: `La consulta falló: ${e instanceof Error ? e.message.slice(0, 200) : 'error interno'}` };
    }
  }
}
