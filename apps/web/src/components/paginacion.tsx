"use client";

/**
 * Paginación por cursor reutilizable (08 §2) para catálogos grandes (10k+ productos).
 * `usePaginacion(url)` re-consulta (con debounce) cuando cambian la URL base (filtros)
 * o el tamaño de página; `<Paginador>` pinta la barra "Ver N · ‹ Anterior · Siguiente ›".
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Select } from "@/components/ui";

export interface Paginado<T> {
  filas: T[] | null;
  pagina: number;
  porPagina: number;
  setPorPagina: (n: number) => void;
  nextCursor: string | null;
  irSiguiente: () => void;
  irAnterior: () => void;
  recargar: () => void;
}

export function usePaginacion<T>(url: string, sucursalId?: string | null, porPaginaInicial = 50): Paginado<T> {
  const [porPagina, setPorPagina] = useState(porPaginaInicial);
  const [filas, setFilas] = useState<T[] | null>(null);
  const [cursores, setCursores] = useState<Array<string | null>>([null]);
  const [pagina, setPagina] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const pedir = useCallback(
    (idx: number, curs: Array<string | null>) => {
      const sep = url.includes("?") ? "&" : "?";
      const cursor = curs[idx];
      api<{ datos: T[]; next_cursor: string | null }>(
        `${url}${sep}limit=${porPagina}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        sucursalId ? { sucursalId } : {},
      )
        .then((r) => {
          setFilas(r.datos);
          setNextCursor(r.next_cursor);
        })
        .catch(() => {
          setFilas([]);
          setNextCursor(null);
        });
    },
    [url, porPagina, sucursalId],
  );

  // Cambio de filtros (url) o tamaño → página 1, con debounce para búsquedas as-you-type
  useEffect(() => {
    const t = setTimeout(() => {
      setCursores([null]);
      setPagina(0);
      pedir(0, [null]);
    }, 250);
    return () => clearTimeout(t);
  }, [pedir]);

  const irSiguiente = () => {
    if (!nextCursor) return;
    const nuevos = [...cursores.slice(0, pagina + 1), nextCursor];
    setCursores(nuevos);
    setPagina(pagina + 1);
    setFilas(null);
    pedir(pagina + 1, nuevos);
  };
  const irAnterior = () => {
    if (pagina === 0) return;
    setPagina(pagina - 1);
    setFilas(null);
    pedir(pagina - 1, cursores);
  };
  const recargar = () => pedir(pagina, cursores);

  return { filas, pagina, porPagina, setPorPagina, nextCursor, irSiguiente, irAnterior, recargar };
}

export function Paginador<T>({ p, nombre = "registro(s)" }: { p: Paginado<T>; nombre?: string }) {
  if (!p.filas || (p.filas.length === 0 && p.pagina === 0)) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-muted">
        Página {p.pagina + 1} · {p.filas.length} {nombre}
        {p.nextCursor ? " · hay más" : " · fin de la lista"}
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-muted">
          Ver
          <Select className="w-20" value={String(p.porPagina)} onChange={(e) => p.setPorPagina(Number(e.target.value))}>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </Select>
        </label>
        <Button variante="secondary" onClick={p.irAnterior} disabled={p.pagina === 0}>‹ Anterior</Button>
        <Button variante="secondary" onClick={p.irSiguiente} disabled={!p.nextCursor}>Siguiente ›</Button>
      </div>
    </div>
  );
}
