"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input, cx } from "@/components/ui";

interface Props {
  /** Descuento crudo actual: "" (sin descuento), "10%" o "2.50". */
  valor: string;
  onCambiar: (valor: string) => void;
  presets: number[];
  /** Texto del botón cuando no hay descuento aplicado. */
  etiqueta?: string;
  className?: string;
}

/** Botón que abre un panel con pastillas de % preconfigurados + input personalizado (monto o %). */
export function DescuentoPopover({ valor, onCambiar, presets, etiqueta = "Descuento", className }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [personalizado, setPersonalizado] = useState(valor);
  const cajaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const onClickFuera = (e: MouseEvent) => {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, [abierto]);

  const elegir = (v: string) => {
    onCambiar(v);
    setAbierto(false);
  };

  const alternar = () => {
    if (!abierto) setPersonalizado(valor); // semilla el input personalizado con el valor vigente al abrir
    setAbierto((v) => !v);
  };

  return (
    <div ref={cajaRef} className={cx("relative inline-block", className)}>
      <button
        type="button"
        onClick={alternar}
        className={cx(
          "rounded-full border px-2.5 py-1 text-xs font-medium",
          valor.trim() ? "border-primary bg-primary-light text-primary" : "border-border text-muted hover:bg-page",
        )}
      >
        {valor.trim() || etiqueta}
      </button>

      {abierto && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-border bg-surface p-2.5 text-left shadow-lg">
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
        </div>
      )}
    </div>
  );
}
