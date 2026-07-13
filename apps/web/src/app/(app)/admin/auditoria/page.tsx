"use client";

import { useState } from "react";
import { fmtFecha } from "@/lib/format";
import { Paginador, usePaginacion } from "@/components/paginacion";
import { Badge, Input, Spinner, TablaResponsive, Td, Th } from "@/components/ui";

interface Evento {
  id: string;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  usuarioId?: string | null;
  estadoAnterior?: unknown;
  estadoNuevo?: unknown;
  ip?: string | null;
  creadoEn: string;
}

export default function AuditoriaPage() {
  const [entidad, setEntidad] = useState("");
  const [accion, setAccion] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);

  const qs = new URLSearchParams();
  if (entidad) qs.set("entidad", entidad);
  if (accion) qs.set("accion", accion);
  const pag = usePaginacion<Evento>(`/auditoria${qs.size ? `?${qs}` : ""}`);
  const filas = pag.filas;

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">Auditoría (inmutable — RN-182)</h1>
      <div className="flex gap-2">
        <Input placeholder="Entidad (venta, producto, usuario…)" value={entidad} onChange={(e) => setEntidad(e.target.value)} className="max-w-56" />
        <Input placeholder="Acción (cobrar, login…)" value={accion} onChange={(e) => setAccion(e.target.value)} className="max-w-56" />
      </div>

      {!filas ? (
        <Spinner />
      ) : (
        <>
          <TablaResponsive
            filas={filas}
            claveFila={(e) => e.id}
            vacio="Sin eventos para esos filtros."
            encabezado={<><Th>Fecha</Th><Th>Acción</Th><Th>Entidad</Th><Th>Entidad ID</Th><Th>IP</Th><Th className="w-20"> </Th></>}
            renderFila={(e) => (
              <FilaEventoTabla e={e} abierto={abierto === e.id} onToggle={() => setAbierto(abierto === e.id ? null : e.id)} />
            )}
            renderTarjeta={(e) => (
              <div>
                <div className="flex items-start justify-between gap-2">
                  <Badge tono={e.accion.includes("fallido") || e.accion.includes("cancelar") ? "rojo" : "azul"}>{e.accion}</Badge>
                  <span className="text-xs text-muted">{fmtFecha(e.creadoEn)}</span>
                </div>
                <div className="mt-1 text-sm">{e.entidad} <span className="font-mono text-[10px] text-muted">{e.entidadId ?? "—"}</span></div>
                <div className="text-xs text-muted">IP: {e.ip ?? "—"}</div>
                <div className="mt-2 grid gap-2 border-t border-border pt-2 text-xs">
                  <div>
                    <div className="mb-1 font-semibold text-muted">Estado anterior</div>
                    <pre className="overflow-x-auto rounded bg-page p-2">{JSON.stringify(e.estadoAnterior ?? null, null, 2)}</pre>
                  </div>
                  <div>
                    <div className="mb-1 font-semibold text-muted">Estado nuevo</div>
                    <pre className="overflow-x-auto rounded bg-page p-2">{JSON.stringify(e.estadoNuevo ?? null, null, 2)}</pre>
                  </div>
                </div>
              </div>
            )}
          />
          <Paginador p={pag} nombre="evento(s)" />
        </>
      )}
    </div>
  );
}

function FilaEventoTabla({ e, abierto, onToggle }: { e: Evento; abierto: boolean; onToggle: () => void }) {
  return (
    <>
      <Td className="whitespace-nowrap text-xs">{fmtFecha(e.creadoEn)}</Td>
      <Td><Badge tono={e.accion.includes("fallido") || e.accion.includes("cancelar") ? "rojo" : "azul"}>{e.accion}</Badge></Td>
      <Td>{e.entidad}</Td>
      <Td className="max-w-40 truncate font-mono text-[10px] text-muted">{e.entidadId ?? "—"}</Td>
      <Td className="text-xs text-muted">{e.ip ?? "—"}</Td>
      <Td>
        <button className="text-primary hover:underline" onClick={onToggle}>{abierto ? "ocultar" : "detalle"}</button>
        {abierto && (
          <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
            <div>
              <div className="mb-1 font-semibold text-muted">Estado anterior</div>
              <pre className="overflow-x-auto rounded bg-page p-2">{JSON.stringify(e.estadoAnterior ?? null, null, 2)}</pre>
            </div>
            <div>
              <div className="mb-1 font-semibold text-muted">Estado nuevo</div>
              <pre className="overflow-x-auto rounded bg-page p-2">{JSON.stringify(e.estadoNuevo ?? null, null, 2)}</pre>
            </div>
          </div>
        )}
      </Td>
    </>
  );
}
