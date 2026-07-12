"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useSesion } from "@/lib/session";
import { cx } from "@/components/ui";

interface Mensaje {
  rol: "user" | "assistant";
  contenido: string;
}

const CLAVE_STORAGE = "am-asistente";
const SUGERENCIAS = [
  "¿Cuánto vendimos hoy?",
  "Productos bajo mínimo",
  "¿Está abierta la caja?",
];

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
        <Link
          key={k++}
          href={m[2]}
          className="font-medium text-primary underline underline-offset-2"
        >
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

/** Avatar circular reutilizado en el header y en cada mensaje del asistente (mismo glifo, sin SVG — 11 §2 lenguaje de íconos del sistema). */
function AvatarAsistente({ tamano = "md" }: { tamano?: "sm" | "md" }) {
  return (
    <span
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full bg-primary-light",
        tamano === "sm" ? "h-6 w-6 text-xs" : "h-8 w-8 text-base",
      )}
    >
      💬
    </span>
  );
}

function IndicadorEscribiendo() {
  return (
    <div className="flex items-start gap-2">
      <AvatarAsistente tamano="sm" />
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-page px-3 py-2.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
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
  const inputRef = useRef<HTMLInputElement>(null);

  // Persistir el historial de la pestaña y auto-scroll al final al cambiar los mensajes.
  useEffect(() => {
    sessionStorage.setItem(CLAVE_STORAGE, JSON.stringify(mensajes.slice(-30)));
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  // Al abrir: foco en el input y salto instantáneo al final del historial (sin animación,
  // para no obligar a scrollear manualmente si ya había mensajes de la pestaña).
  useEffect(() => {
    if (!abierto) return;
    inputRef.current?.focus();
    finRef.current?.scrollIntoView({ behavior: "auto" });
  }, [abierto]);

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
      setMensajes((prev) => [
        ...prev,
        { rol: "assistant", contenido: r.respuesta },
      ]);
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
    <div className="no-print fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3">
      {abierto && (
        <div className="flex h-[520px] w-[380px] max-w-[calc(100vw-2rem)] origin-bottom-right animate-[asistente-pop-in_150ms_ease-out] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-ink/10 max-sm:fixed max-sm:inset-2 max-sm:h-auto max-sm:w-auto">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <div className="flex items-center gap-2">
              <AvatarAsistente />
              <div className="text-sm font-semibold leading-tight">
                Asistente
                <div className="text-xs font-normal text-muted">
                  Consulta stock, ventas y más
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="rounded-md px-2 py-1 text-xs text-muted hover:bg-page hover:text-ink"
                onClick={() => {
                  setMensajes([]);
                  sessionStorage.removeItem(CLAVE_STORAGE);
                }}
              >
                Limpiar
              </button>
              <button
                aria-label="Cerrar asistente"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-page hover:text-ink"
                onClick={() => setAbierto(false)}
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
            {mensajes.length === 0 && (
              <div className="space-y-2.5">
                <p className="text-muted">
                  Pregúntame sobre stock, ventas, caja o clientes.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGERENCIAS.map((s) => (
                    <button
                      key={s}
                      onClick={() => void preguntar(s)}
                      className="rounded-full border border-border px-3 py-1 text-xs text-primary transition-shadow hover:bg-primary-light hover:shadow-sm"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mensajes.map((m, i) =>
              m.rol === "user" ? (
                <div
                  key={i}
                  className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3 py-2 text-white"
                >
                  {m.contenido}
                </div>
              ) : (
                <div key={i} className="flex items-start gap-2">
                  <AvatarAsistente tamano="sm" />
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-page px-3 py-2 text-ink">
                    {renderizarRespuesta(m.contenido)}
                  </div>
                </div>
              ),
            )}
            {pensando && <IndicadorEscribiendo />}
            <div ref={finRef} />
          </div>

          <form
            className="flex items-center gap-2 border-t border-border p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void preguntar(texto);
            }}
          >
            <input
              ref={inputRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribe tu pregunta…"
              disabled={pensando}
              className="w-full rounded-full border border-border bg-page px-3.5 py-2 text-sm placeholder:text-muted disabled:opacity-60"
            />
            <button
              type="submit"
              aria-label="Enviar pregunta"
              disabled={pensando || !texto.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-base text-white transition-opacity hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              ➤
            </button>
          </form>
        </div>
      )}

      <button
        aria-label={abierto ? "Cerrar asistente" : "Abrir asistente"}
        onClick={() => setAbierto((v) => !v)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-xl text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl"
      >
        <span
          className={cx(
            "inline-block transition-transform duration-150",
            abierto && "rotate-180",
          )}
        >
          {abierto ? "✕" : "💬"}
        </span>
      </button>
    </div>
  );
}
