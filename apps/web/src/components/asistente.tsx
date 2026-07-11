"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useSesion } from "@/lib/session";
import { Button, Input, cx } from "@/components/ui";

interface Mensaje {
  rol: "user" | "assistant";
  contenido: string;
}

const CLAVE_STORAGE = "am-asistente";
const SUGERENCIAS = ["¿Cuánto vendimos hoy?", "Productos bajo mínimo", "¿Está abierta la caja?"];

/** Render seguro (spec): SOLO **negritas** y enlaces internos [etiqueta](/ruta). Nada de HTML/markdown crudo. */
export function renderizarRespuesta(texto: string): React.ReactNode {
  const partes: React.ReactNode[] = [];
  // Un solo regex global: enlace interno o negrita; el resto, texto plano.
  // La url debe empezar con "/" y NO con "//" ni "/\" (evita URLs protocol-relative o con
  // backslash que el navegador resuelve como externas — el enlace solo puede ser interno).
  const re = /\[([^\]]+)\]\((\/(?![/\\])[^\s)]*)\)|\*\*([^*]+)\*\*/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    if (m[1] !== undefined) {
      partes.push(
        <Link key={k++} href={m[2]} className="font-medium text-primary underline">
          {m[1]}
        </Link>,
      );
    } else {
      partes.push(<strong key={k++}>{m[3]}</strong>);
    }
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return <>{partes}</>;
}

export function AsistenteWidget() {
  const { me, sucursalId } = useSesion();
  const [abierto, setAbierto] = useState(false);
  // Historial de la pestaña restaurado del sessionStorage en el inicializador (spec: sin BD;
  // lazy init en vez de effect para no disparar renders en cascada). SSR-safe con typeof window.
  const [mensajes, setMensajes] = useState<Mensaje[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const crudo = sessionStorage.getItem(CLAVE_STORAGE);
      return crudo ? (JSON.parse(crudo) as Mensaje[]) : [];
    } catch {
      return []; // historial corrupto: empezar vacío
    }
  });
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  // Persistir el historial de la pestaña y auto-scroll al final al cambiar los mensajes.
  useEffect(() => {
    sessionStorage.setItem(CLAVE_STORAGE, JSON.stringify(mensajes.slice(-30)));
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  if (!me) return null;

  const preguntar = async (pregunta: string) => {
    const q = pregunta.trim();
    if (!q || pensando) return;
    const historial = [...mensajes, { rol: "user" as const, contenido: q }];
    setMensajes(historial);
    setTexto("");
    setPensando(true);
    try {
      const r = await api<{ respuesta: string }>("/asistente/chat", {
        cuerpo: { mensajes: historial.slice(-10) },
        sucursalId,
      });
      setMensajes((prev) => [...prev, { rol: "assistant", contenido: r.respuesta }]);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.codigo === "ASISTENTE_NO_CONFIGURADO"
          ? "El asistente no está configurado. Avísale al administrador."
          : "No pude procesar tu pregunta, intenta de nuevo.";
      setMensajes((prev) => [...prev, { rol: "assistant", contenido: msg }]);
    } finally {
      setPensando(false);
    }
  };

  return (
    <div className="no-print fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {abierto && (
        <div className="flex h-[520px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl max-sm:fixed max-sm:inset-2 max-sm:h-auto max-sm:w-auto">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="text-sm font-semibold">Asistente</div>
            <div className="flex items-center gap-3">
              <button
                className="text-xs text-muted hover:text-ink"
                onClick={() => {
                  setMensajes([]);
                  sessionStorage.removeItem(CLAVE_STORAGE);
                }}
              >
                Limpiar
              </button>
              <button aria-label="Cerrar asistente" className="text-muted hover:text-ink" onClick={() => setAbierto(false)}>
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            {mensajes.length === 0 && (
              <div className="space-y-2">
                <p className="text-muted">Pregúntame sobre stock, ventas, caja o clientes.</p>
                {SUGERENCIAS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void preguntar(s)}
                    className="block rounded-full border border-border px-3 py-1 text-xs text-primary hover:bg-primary-light"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {mensajes.map((m, i) => (
              <div
                key={i}
                className={cx(
                  "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2",
                  m.rol === "user" ? "ml-auto bg-primary text-white" : "bg-page text-ink",
                )}
              >
                {m.rol === "assistant" ? renderizarRespuesta(m.contenido) : m.contenido}
              </div>
            ))}
            {pensando && <div className="text-xs text-muted">Pensando…</div>}
            <div ref={finRef} />
          </div>

          <form
            className="flex gap-2 border-t border-border p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void preguntar(texto);
            }}
          >
            <Input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribe tu pregunta…"
              disabled={pensando}
              autoFocus
            />
            <Button type="submit" disabled={pensando || !texto.trim()}>
              Enviar
            </Button>
          </form>
        </div>
      )}

      <button
        aria-label="Abrir asistente"
        onClick={() => setAbierto((v) => !v)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-xl text-white shadow-lg hover:opacity-90"
      >
        💬
      </button>
    </div>
  );
}
