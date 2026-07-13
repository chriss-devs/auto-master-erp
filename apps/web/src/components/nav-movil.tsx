"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faBars, faXmark } from "@fortawesome/free-solid-svg-icons";
import { cx } from "@/components/ui";

export interface ItemNav {
  ruta: string;
  texto: string;
  permiso: string;
  icono: IconDefinition;
}

export function BarraInferior({ items, activo }: { items: ItemNav[]; activo: (ruta: string) => boolean }) {
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      {items.map((n) => (
        <Link
          key={n.ruta}
          href={n.ruta}
          className={cx(
            "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px]",
            activo(n.ruta) ? "text-primary" : "text-muted",
          )}
        >
          <FontAwesomeIcon icon={n.icono} className="text-base" />
          {n.texto}
        </Link>
      ))}
    </nav>
  );
}

export function BotonMenu({ onAbrir }: { onAbrir: () => void }) {
  return (
    <button
      onClick={onAbrir}
      className="flex h-11 w-11 items-center justify-center rounded-md text-ink hover:bg-page lg:hidden"
      aria-label="Abrir menú"
    >
      <FontAwesomeIcon icon={faBars} />
    </button>
  );
}

export function DrawerMenu({
  abierto,
  onCerrar,
  items,
  activo,
  usuario,
  roles,
  onCambiarClave,
  onSalir,
}: {
  abierto: boolean;
  onCerrar: () => void;
  items: ItemNav[];
  activo: (ruta: string) => boolean;
  usuario: string;
  roles: string;
  onCambiarClave: () => void;
  onSalir: () => void;
}) {
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />
      <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-white">AM</div>
            <div className="text-sm font-bold">Auto Master</div>
          </div>
          <button
            onClick={onCerrar}
            className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-page"
            aria-label="Cerrar menú"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {items.map((n) => (
            <Link
              key={n.ruta}
              href={n.ruta}
              onClick={onCerrar}
              className={cx(
                "flex min-h-[48px] items-center gap-3 rounded-md px-3 text-sm",
                activo(n.ruta) ? "bg-primary-light font-semibold text-primary-dark" : "text-ink hover:bg-page",
              )}
            >
              <FontAwesomeIcon icon={n.icono} className="w-4 text-center" />
              {n.texto}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-3 text-xs text-muted">
          <div className="mb-1 font-medium text-ink">{usuario}</div>
          <div className="mb-2">{roles}</div>
          <button
            onClick={() => { onCerrar(); onCambiarClave(); }}
            className="mr-3 min-h-[44px] text-primary hover:underline"
          >
            Contraseña
          </button>
          <button onClick={() => { onCerrar(); onSalir(); }} className="min-h-[44px] text-danger hover:underline">
            Salir
          </button>
        </div>
      </div>
    </div>
  );
}
