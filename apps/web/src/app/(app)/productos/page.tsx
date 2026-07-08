"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtMoney, fmtQty, pct } from "@/lib/format";
import { useSesion } from "@/lib/session";
import { Badge, Button, Input, Spinner, Tabla, Td, Th, Vacio } from "@/components/ui";

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
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  const cargar = (reset = true, cur?: string | null) => {
    api<{ datos: Fila[]; next_cursor: string | null }>(`/productos?limit=30${q ? `&q=${encodeURIComponent(q)}` : ""}${cur ? `&cursor=${cur}` : ""}`)
      .then((r) => {
        setFilas((f) => (reset || !f ? r.datos : [...f, ...r.datos]));
        setCursor(r.next_cursor);
      })
      .catch(() => setFilas([]));
  };

  useEffect(() => {
    const t = setTimeout(() => cargar(true), q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

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
      ) : filas.length === 0 ? (
        <Vacio texto="Sin productos." />
      ) : (
        <>
          <Tabla>
            <thead>
              <tr>
                <Th>Código</Th><Th>Nombre</Th><Th>Categoría</Th><Th>Marca</Th>
                {sucursales.map((s) => <Th key={s.id} className="text-right">Stock {s.codigo}</Th>)}
                <Th className="text-right">Precio</Th><Th>ITBMS</Th><Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <tr key={p.id} className="hover:bg-page">
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
                </tr>
              ))}
            </tbody>
          </Tabla>
          {cursor && (
            <div className="text-center">
              <Button variante="secondary" onClick={() => cargar(false, cursor)}>Cargar más</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
