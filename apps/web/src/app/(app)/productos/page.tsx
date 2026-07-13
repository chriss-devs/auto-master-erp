"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtMoney, fmtQty, pct } from "@/lib/format";
import { useSesion } from "@/lib/session";
import { Paginador, usePaginacion } from "@/components/paginacion";
import { Badge, Button, Input, Spinner, TablaResponsive, Td, Th } from "@/components/ui";

interface Fila {
  id: string;
  sku: string;
  nombre: string;
  estado: string;
  precioBase: string;
  tasaItbms: string;
  marca?: { nombre: string } | null;
  categoria?: { nombre: string } | null;
  unidadMedida: { codigo: string };
  stocks: Array<{ cantidad: string; sucursal: { id: string; codigo: string } }>;
}

export default function ProductosPage() {
  const { puede, me } = useSesion();
  const [q, setQ] = useState("");
  const pag = usePaginacion<Fila>(`/productos${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  const filas = pag.filas;

  const sucursales = me?.sucursales ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Productos</h1>
        {puede("productos:crear") && (
          <Link href="/productos/nuevo"><Button>+ Producto nuevo</Button></Link>
        )}
      </div>
      <Input placeholder="Buscar por nombre, SKU o código…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />

      {!filas ? (
        <Spinner />
      ) : (
        <>
          <TablaResponsive
            filas={filas}
            claveFila={(p) => p.id}
            vacio="Sin productos."
            encabezado={
              <>
                <Th>Código</Th><Th>Nombre</Th><Th>Categoría</Th><Th>Marca</Th>
                {sucursales.map((s) => <Th key={s.id} className="text-right">Stock {s.codigo}</Th>)}
                <Th className="text-right">Precio</Th><Th>ITBMS</Th><Th>Estado</Th>
              </>
            }
            renderFila={(p) => (
              <>
                <Td className="font-mono text-xs">{p.sku}</Td>
                <Td><Link href={`/productos/${p.id}`} className="font-medium text-primary hover:underline">{p.nombre}</Link></Td>
                <Td className="text-muted">{p.categoria?.nombre ?? "—"}</Td>
                <Td className="text-muted">{p.marca?.nombre ?? "—"}</Td>
                {sucursales.map((s) => {
                  const st = p.stocks.find((x) => x.sucursal.id === s.id);
                  return <Td key={s.id} className="text-right">{fmtQty(st?.cantidad ?? 0)}</Td>;
                })}
                <Td className="text-right font-medium">{fmtMoney(p.precioBase)}</Td>
                <Td>{pct(p.tasaItbms)}</Td>
                <Td>{p.estado === "ACTIVO" ? <Badge tono="verde">Activo</Badge> : <Badge tono="rojo">Descontinuado</Badge>}</Td>
              </>
            )}
            renderTarjeta={(p) => (
              <Link href={`/productos/${p.id}`} className="block">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-muted">{p.sku}</div>
                    <div className="font-medium text-primary">{p.nombre}</div>
                    <div className="mt-0.5 text-xs text-muted">{p.categoria?.nombre ?? "—"} · {p.marca?.nombre ?? "—"}</div>
                  </div>
                  {p.estado === "ACTIVO" ? <Badge tono="verde">Activo</Badge> : <Badge tono="rojo">Descontinuado</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  {sucursales.map((s) => {
                    const st = p.stocks.find((x) => x.sucursal.id === s.id);
                    return <span key={s.id}>{s.codigo}: <span className="font-medium text-ink">{fmtQty(st?.cantidad ?? 0)}</span></span>;
                  })}
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-muted">ITBMS {pct(p.tasaItbms)}</span>
                  <span className="font-semibold">{fmtMoney(p.precioBase)}</span>
                </div>
              </Link>
            )}
          />
          <Paginador p={pag} nombre="producto(s)" />
        </>
      )}
    </div>
  );
}
