"use client";

import { use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtMoney, fmtQty } from "@/lib/format";
import { ProductoForm, ProductoExistente } from "@/components/producto-form";
import { Card, Spinner, Tabla, Td, Th, Vacio } from "@/components/ui";

interface Detalle extends ProductoExistente {
  stocks: Array<{ cantidad: string; costoPromedio: string; sucursal: { id: string; codigo: string; nombre: string } }>;
  compat: Array<{ id: string; marca: string; modelo: string; anioDesde?: number | null; anioHasta?: number | null }>;
}

export default function ProductoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [producto, setProducto] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Detalle>(`/productos/${id}`).then(setProducto).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <Vacio texto={error} />;
  if (!producto) return <Spinner />;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">
        <span className="mr-2 font-mono text-sm text-muted">{producto.sku}</span>
        {producto.nombre}
      </h1>

      <Card titulo="Stock por sucursal (visibilidad cruzada — D-030)">
        <Tabla>
          <thead>
            <tr><Th>Sucursal</Th><Th className="text-right">Cantidad</Th><Th className="text-right">Costo promedio (RN-009)</Th><Th className="text-right">Valorizado</Th></tr>
          </thead>
          <tbody>
            {producto.stocks.length === 0 && <tr><Td colSpan={4}><Vacio texto="Sin stock registrado." /></Td></tr>}
            {producto.stocks.map((s) => (
              <tr key={s.sucursal.id}>
                <Td>{s.sucursal.codigo} — {s.sucursal.nombre}</Td>
                <Td className="text-right font-semibold">{fmtQty(s.cantidad)}</Td>
                <Td className="text-right">{fmtMoney(s.costoPromedio)}</Td>
                <Td className="text-right">{fmtMoney(Number(s.cantidad) * Number(s.costoPromedio))}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Card>

      {producto.compat.length > 0 && (
        <Card titulo="Compatibilidad de vehículos">
          <div className="flex flex-wrap gap-2 text-sm">
            {producto.compat.map((c) => (
              <span key={c.id} className="rounded border border-border bg-page px-2 py-1">
                {c.marca} {c.modelo} {c.anioDesde ?? ""}{c.anioHasta ? `–${c.anioHasta}` : ""}
              </span>
            ))}
          </div>
        </Card>
      )}

      <ProductoForm existente={producto} />
    </div>
  );
}
