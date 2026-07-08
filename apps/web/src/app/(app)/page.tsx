"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtMoney, fmtQty } from "@/lib/format";
import { useSesion } from "@/lib/session";
import { Badge, Card, Spinner, Tabla, Td, Th, Vacio } from "@/components/ui";

interface Resumen {
  hoy: { ventas: number; total: string; itbms: string; ticketPromedio: string };
  accionables: {
    ventasEnPreparacion: number;
    cajaAbierta: { id: string; desde: string } | null;
    facturasPendientesTransmision: number;
    stockBajo: Array<{ id: string; sku: string; nombre: string; cantidad: string; stockMinimo: string }>;
  };
  topProductos7d: Array<{ productoId: string; descripcion: string; unidades: string; importe: string }>;
  serie7d: Array<{ dia: string; total: string; ventas: string }>;
}

export default function DashboardPage() {
  const { sucursalId, sucursal } = useSesion();
  const [datos, setDatos] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sucursalId) return;
    let vigente = true;
    api<Resumen>("/dashboard", { sucursalId })
      .then((r) => vigente && setDatos(r))
      .catch((e) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [sucursalId]);

  if (error) return <Vacio texto={`No se pudo cargar el dashboard: ${error}`} />;
  if (!datos) return <Spinner />;

  const maxSerie = Math.max(1, ...datos.serie7d.map((d) => Number(d.total)));

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Dashboard — {sucursal?.nombre}</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card titulo="Ventas de hoy">
          <div className="text-2xl font-bold">{datos.hoy.ventas}</div>
          <div className="text-xs text-muted">transacciones cobradas</div>
        </Card>
        <Card titulo="Total de hoy">
          <div className="text-2xl font-bold text-primary">{fmtMoney(datos.hoy.total)}</div>
          <div className="text-xs text-muted">ITBMS: {fmtMoney(datos.hoy.itbms)}</div>
        </Card>
        <Card titulo="Ticket promedio">
          <div className="text-2xl font-bold">{fmtMoney(datos.hoy.ticketPromedio)}</div>
        </Card>
        <Card titulo="Últimos 7 días">
          <div className="flex h-12 items-end gap-1">
            {datos.serie7d.length === 0 && <span className="text-xs text-muted">Sin ventas aún</span>}
            {datos.serie7d.map((d) => (
              <div
                key={d.dia}
                title={`${d.dia}: ${fmtMoney(d.total)} (${d.ventas} ventas)`}
                className="flex-1 rounded-t bg-primary/70"
                style={{ height: `${Math.max(8, (Number(d.total) / maxSerie) * 100)}%` }}
              />
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card titulo="Requiere acción">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <Link href="/caja" className="text-primary hover:underline">Ventas en preparación</Link>
              <Badge tono={datos.accionables.ventasEnPreparacion > 0 ? "azul" : "gris"}>{datos.accionables.ventasEnPreparacion}</Badge>
            </li>
            <li className="flex items-center justify-between">
              <Link href="/caja" className="text-primary hover:underline">Caja</Link>
              {datos.accionables.cajaAbierta ? <Badge tono="verde">Abierta</Badge> : <Badge tono="ambar">Cerrada</Badge>}
            </li>
            <li className="flex items-center justify-between">
              <Link href="/facturas?estado=PENDIENTE_TRANSMISION" className="text-primary hover:underline">
                Facturas por transmitir (contingencia)
              </Link>
              <Badge tono={datos.accionables.facturasPendientesTransmision > 0 ? "ambar" : "gris"}>
                {datos.accionables.facturasPendientesTransmision}
              </Badge>
            </li>
          </ul>
        </Card>

        <Card titulo="Stock bajo mínimo" className="lg:col-span-2">
          {datos.accionables.stockBajo.length === 0 ? (
            <Vacio texto="Sin alertas de stock." />
          ) : (
            <Tabla>
              <thead>
                <tr><Th>Código</Th><Th>Producto</Th><Th className="text-right">Stock</Th><Th className="text-right">Mínimo</Th></tr>
              </thead>
              <tbody>
                {datos.accionables.stockBajo.map((p) => (
                  <tr key={p.id}>
                    <Td className="font-mono text-xs">{p.sku}</Td>
                    <Td><Link className="text-primary hover:underline" href={`/productos/${p.id}`}>{p.nombre}</Link></Td>
                    <Td className="text-right font-semibold text-danger">{fmtQty(p.cantidad)}</Td>
                    <Td className="text-right text-muted">{fmtQty(p.stockMinimo)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Card>
      </div>

      <Card titulo="Más vendidos (7 días)">
        {datos.topProductos7d.length === 0 ? (
          <Vacio texto="Aún no hay ventas registradas." />
        ) : (
          <Tabla>
            <thead>
              <tr><Th>Producto</Th><Th className="text-right">Unidades</Th><Th className="text-right">Importe</Th></tr>
            </thead>
            <tbody>
              {datos.topProductos7d.map((t) => (
                <tr key={t.productoId}>
                  <Td>{t.descripcion}</Td>
                  <Td className="text-right">{fmtQty(t.unidades)}</Td>
                  <Td className="text-right font-medium">{fmtMoney(t.importe)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Card>
    </div>
  );
}
