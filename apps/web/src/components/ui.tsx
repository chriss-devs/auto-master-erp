"use client";

/** Componentes base estilo shadcn/ui escritos a mano (BL-013). Densos, teclado-primero. */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export const cx = (...cls: Array<string | false | null | undefined>) => cls.filter(Boolean).join(" ");

// ── Button ────────────────────────────────────────────────────────────────────
type Variante = "primary" | "secondary" | "danger" | "ghost" | "success";
const VARIANTES: Record<Variante, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark disabled:bg-primary/50",
  secondary: "bg-white text-ink border border-border hover:bg-page",
  danger: "bg-danger text-white hover:opacity-90",
  success: "bg-success text-white hover:opacity-90",
  ghost: "text-ink hover:bg-page",
};

export function Button({
  variante = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        VARIANTES[variante],
        className,
      )}
      {...props}
    />
  );
}

// ── Inputs ────────────────────────────────────────────────────────────────────
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "w-full rounded-md border border-border bg-white px-2.5 py-1.5 text-sm placeholder:text-muted disabled:bg-page",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cx("w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cx("mb-1 block text-xs font-medium text-muted", className)} {...props}>
      {children}
    </label>
  );
}

export function Campo({ etiqueta, children, className }: { etiqueta: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label>{etiqueta}</Label>
      {children}
    </div>
  );
}

// ── Card / Badge / Kbd ───────────────────────────────────────────────────────
export function Card({ className, children, titulo, accion }: { className?: string; children: React.ReactNode; titulo?: string; accion?: React.ReactNode }) {
  return (
    <div className={cx("rounded-lg border border-border bg-surface p-4 shadow-sm", className)}>
      {(titulo || accion) && (
        <div className="mb-3 flex items-center justify-between">
          {titulo && <h3 className="text-sm font-semibold">{titulo}</h3>}
          {accion}
        </div>
      )}
      {children}
    </div>
  );
}

type Tono = "gris" | "azul" | "verde" | "ambar" | "rojo";
const TONOS: Record<Tono, string> = {
  gris: "bg-page text-muted border-border",
  azul: "bg-primary-light text-primary-dark border-primary/30",
  verde: "bg-success-bg text-success border-success/30",
  ambar: "bg-warning-bg text-warning border-warning/30",
  rojo: "bg-red-50 text-danger border-danger/30",
};

export function Badge({ tono = "gris", children, className }: { tono?: Tono; children: React.ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", TONOS[tono], className)}>
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-page px-1.5 py-0.5 text-[10px] font-semibold text-muted">{children}</kbd>;
}

// ── Tabla ─────────────────────────────────────────────────────────────────────
export function Tabla({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto rounded-lg border border-border bg-surface", className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cx("border-b border-border bg-page px-3 py-2 text-left text-xs font-semibold text-muted", className)}>{children}</th>;
}
export function Td({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cx("border-b border-border/60 px-3 py-1.5 align-middle", className)}>{children}</td>;
}

// ── Spinner / vacío ───────────────────────────────────────────────────────────
export function Spinner({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" /> {texto}
    </div>
  );
}

export function Vacio({ texto }: { texto: string }) {
  return <div className="p-6 text-center text-sm text-muted">{texto}</div>;
}

// ── Dialog ────────────────────────────────────────────────────────────────────
export function Dialogo({
  abierto,
  onCerrar,
  titulo,
  children,
  ancho = "max-w-lg",
  forzado = false,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  children: React.ReactNode;
  ancho?: string;
  forzado?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !forzado) onCerrar();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [abierto, forzado, onCerrar]);

  // Enfoque inicial SOLO al abrir (nunca en re-renders por tipeo) y nunca sobre la ✕ de cerrar
  useEffect(() => {
    if (abierto) {
      ref.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-cerrar])")?.focus();
    }
  }, [abierto]);

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]" onMouseDown={forzado ? undefined : onCerrar}>
      <div ref={ref} className={cx("w-full rounded-lg bg-surface p-4 shadow-xl", ancho)} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{titulo}</h2>
          {!forzado && (
            <button data-cerrar onClick={onCerrar} tabIndex={-1} className="rounded p-1 text-muted hover:bg-page" aria-label="Cerrar">
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Toasts ────────────────────────────────────────────────────────────────────
interface Toast {
  id: number;
  tipo: "ok" | "error" | "aviso";
  texto: string;
}
const ToastCtx = createContext<{ avisar: (tipo: Toast["tipo"], texto: string) => void }>({ avisar: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const avisar = useCallback((tipo: Toast["tipo"], texto: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tipo, texto }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tipo === "error" ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={{ avisar }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto rounded-md border px-3 py-2 text-sm shadow-lg",
              t.tipo === "ok" && "border-success/40 bg-success-bg text-success",
              t.tipo === "error" && "border-danger/40 bg-red-50 text-danger",
              t.tipo === "aviso" && "border-warning/40 bg-warning-bg text-warning",
            )}
          >
            {t.texto}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
