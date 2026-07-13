"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { fmtFecha, fmtMoney } from "@/lib/format";
import { useSesion } from "@/lib/session";
import { Paginador, usePaginacion } from "@/components/paginacion";
import { Badge, Select, Spinner, TablaResponsive, Td, Th, useToast } from "@/components/ui";

interface Factura {
  id: string;
  numero: string;
  estado: string;
  cufe?: string | null;
  intentos: number;
  creadoEn: string;
  sucursal: { codigo: string };
  venta: { id: string; numero?: string | null; total: string; cliente: { nombre: string } };
}

const TONO: Record<string, "ambar" | "verde" | "azul" | "rojo" | "gris"> = {
  PENDIENTE_TRANSMISION: "ambar",
  EMITIDA: "azul",
  AUTORIZADA: "verde",
  RECHAZADA: "rojo",
  ANULADA: "gris",
};

function FacturasContenido() {
  const { puede } = useSesion();
  const { avisar } = useToast();
  const params = useSearchParams();
  const [estado, setEstado] = useState(params.get("estado") ?? "");
  const pag = usePaginacion<Factura>(`/facturas${estado ? `?estado=${estado}` : ""}`);
  const filas = pag.filas;

  const retransmitir = async (id: string) => {
    try {
      const r = await api<Factura>(`/facturas/${id}/retransmitir`, { cuerpo: {} });
      if (r.estado === "PENDIENTE_TRANSMISION") {
        avisar("aviso", "Sigue en contingencia: no hay PAC configurado (Q-002). El intento quedó registrado.");
      } else {
        avisar("ok", `Factura ${r.numero}: ${r.estado}.`);
      }
      pag.recargar();
    } catch (e) {
      avisar("error", e instanceof ApiError ? e.message : "No se pudo retransmitir.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Facturas (FEP — contingencia activa)</h1>
        <Select className="w-64" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todas</option>
          <option value="PENDIENTE_TRANSMISION">Pendientes de transmitir</option>
          <option value="AUTORIZADA">Autorizadas</option>
          <option value="RECHAZADA">Rechazadas</option>
          <option value="ANULADA">Anuladas</option>
        </Select>
      </div>

      {!filas ? (
        <Spinner />
      ) : (
        <>
        <TablaResponsive
          filas={filas}
          claveFila={(f) => f.id}
          vacio="Sin facturas."
          encabezado={
            <>
              <Th>Número</Th><Th>Fecha</Th><Th>Cliente</Th><Th className="text-right">Total</Th>
              <Th>Estado</Th><Th>CUFE</Th><Th className="w-48"> </Th>
            </>
          }
          renderFila={(f) => (
            <>
              <Td className="font-mono text-xs">{f.numero}</Td>
              <Td className="whitespace-nowrap text-xs">{fmtFecha(f.creadoEn)}</Td>
              <Td>{f.venta.cliente.nombre}</Td>
              <Td className="text-right font-medium">{fmtMoney(f.venta.total)}</Td>
              <Td><Badge tono={TONO[f.estado] ?? "gris"}>{f.estado === "PENDIENTE_TRANSMISION" ? "Contingencia" : f.estado}</Badge></Td>
              <Td className="max-w-40 truncate font-mono text-[10px] text-muted">{f.cufe ?? "—"}</Td>
              <Td className="whitespace-nowrap text-right">
                <Link className="mr-3 text-primary hover:underline" href={`/facturas/${f.id}/imprimir`} target="_blank">imprimir</Link>
                {puede("facturacion:emitir") && f.estado === "PENDIENTE_TRANSMISION" && (
                  <button className="text-primary hover:underline" onClick={() => void retransmitir(f.id)}>
                    retransmitir ({f.intentos})
                  </button>
                )}
              </Td>
            </>
          )}
          renderTarjeta={(f) => (
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-muted">{f.numero}</div>
                  <div className="font-medium">{f.venta.cliente.nombre}</div>
                  <div className="text-xs text-muted">{fmtFecha(f.creadoEn)}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{fmtMoney(f.venta.total)}</div>
                  <Badge tono={TONO[f.estado] ?? "gris"}>{f.estado === "PENDIENTE_TRANSMISION" ? "Contingencia" : f.estado}</Badge>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2 text-sm">
                <Link className="min-h-[44px] px-2 py-2.5 text-primary hover:underline" href={`/facturas/${f.id}/imprimir`} target="_blank">imprimir</Link>
                {puede("facturacion:emitir") && f.estado === "PENDIENTE_TRANSMISION" && (
                  <button className="min-h-[44px] px-2 py-2.5 text-primary hover:underline" onClick={() => void retransmitir(f.id)}>
                    retransmitir ({f.intentos})
                  </button>
                )}
              </div>
            </div>
          )}
        />
        <Paginador p={pag} nombre="factura(s)" />
        </>
      )}
      <p className="text-xs text-muted">
        Las facturas se emiten en modo contingencia (RF-FAC-005): la venta nunca se bloquea. Al contratar el PAC (Q-002) se transmite lo pendiente sin cambios en Ventas (D-012).
      </p>
    </div>
  );
}

export default function FacturasPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <FacturasContenido />
    </Suspense>
  );
}
