"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTag } from "@fortawesome/free-solid-svg-icons";
import { Button, Input, cx } from "@/components/ui";

const ANCHO_PANEL = 224; // w-56

interface Props {
  /** Descuento crudo actual: "" (sin descuento), "10%" o "2.50". */
  valor: string;
  onCambiar: (valor: string) => void;
  presets: number[];
  /** Texto junto al ícono cuando no hay descuento aplicado (vacío = solo ícono). */
  etiqueta?: string;
  /** Para botones sin texto visible (ej. "Descuento general"). */
  ariaLabel?: string;
  className?: string;
}

/**
 * Botón (ícono + valor) que abre un panel con pastillas de % preconfigurados + input
 * personalizado. El panel se renderiza en un portal sobre <body> y se posiciona con
 * `position: fixed` a partir del rect del botón — así nunca queda recortado por el
 * `overflow-x-auto` de una tabla (D-013 tablas densas) ni fuerza scroll horizontal.
 */
export function DescuentoPopover({ valor, onCambiar, presets, etiqueta = "", ariaLabel, className }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [personalizado, setPersonalizado] = useState(valor);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrarSiFuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setAbierto(false);
    };
    const cerrarAlScrollear = () => setAbierto(false);
    document.addEventListener("mousedown", cerrarSiFuera);
    window.addEventListener("scroll", cerrarAlScrollear, true);
    return () => {
      document.removeEventListener("mousedown", cerrarSiFuera);
      window.removeEventListener("scroll", cerrarAlScrollear, true);
    };
  }, [abierto]);

  const elegir = (v: string) => {
    onCambiar(v);
    setAbierto(false);
  };

  const alternar = () => {
    if (!abierto && btnRef.current) {
      setPersonalizado(valor); // semilla el input personalizado con el valor vigente al abrir
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: Math.min(r.right - ANCHO_PANEL, window.innerWidth - ANCHO_PANEL - 8) });
    }
    setAbierto((v) => !v);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={alternar}
        aria-label={ariaLabel}
        title={ariaLabel}
        className={cx(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
          valor.trim() ? "border-primary bg-primary-light text-primary" : "border-border text-muted hover:bg-page",
          className,
        )}
      >
        <FontAwesomeIcon icon={faTag} className="text-[11px]" />
        {(valor.trim() || etiqueta) && <span>{valor.trim() || etiqueta}</span>}
      </button>

      {abierto &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: pos.top, left: pos.left, width: ANCHO_PANEL }}
            className="fixed z-50 rounded-md border border-border bg-surface p-2.5 text-left shadow-lg"
          >
            <div className="mb-2 flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => elegir(`${p}%`)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-primary-light hover:text-primary"
                >
                  {p}%
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input
                className="text-sm"
                placeholder="0.00 ó 5%"
                value={personalizado}
                onChange={(e) => setPersonalizado(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && elegir(personalizado)}
                autoFocus
              />
              <Button className="shrink-0 px-2.5" onClick={() => elegir(personalizado)}>
                Aplicar
              </Button>
            </div>
            {valor.trim() && (
              <button type="button" className="mt-2 text-xs text-danger hover:underline" onClick={() => elegir("")}>
                Quitar descuento
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
