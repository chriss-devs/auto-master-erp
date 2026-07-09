"use client";

import { useState } from "react";
import { fmtFecha } from "@/lib/format";
import { Paginador, usePaginacion } from "@/components/paginacion";
import { Badge, Input, Spinner, Tabla, Td, Th, Vacio } from "@/components/ui";

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
      ) : filas.length === 0 ? (
        <Vacio texto="Sin eventos para esos filtros." />
      ) : (
        <>
          <Tabla>
            <thead>
              <tr><Th>Fecha</Th><Th>Acción</Th><Th>Entidad</Th><Th>Entidad ID</Th><Th>IP</Th><Th className="w-20"> </Th></tr>
            </thead>
            <tbody>
              {filas.map((e) => (
                <FilaEvento key={e.id} e={e} abierto={abierto === e.id} onToggle={() => setAbierto(abierto === e.id ? null : e.id)} />
              ))}
            </tbody>
          </Tabla>
          <Paginador p={pag} nombre="evento(s)" />
        </>
      )}
    </div>
  );
}

function FilaEvento({ e, abierto, onToggle }: { e: Evento; abierto: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="hover:bg-page">
        <Td className="whitespace-nowrap text-xs">{fmtFecha(e.creadoEn)}</Td>
        <Td><Badge tono={e.accion.includes("fallido") || e.accion.includes("cancelar") ? "rojo" : "azul"}>{e.accion}</Badge></Td>
        <Td>{e.entidad}</Td>
        <Td className="max-w-40 truncate font-mono text-[10px] text-muted">{e.entidadId ?? "—"}</Td>
        <Td className="text-xs text-muted">{e.ip ?? "—"}</Td>
        <Td><button className="text-primary hover:underline" onClick={onToggle}>{abierto ? "ocultar" : "detalle"}</button></Td>
      </tr>
      {abierto && (
        <tr>
          <Td colSpan={6} className="bg-page">
            <div className="grid gap-2 p-2 text-xs md:grid-cols-2">
              <div>
                <div className="mb-1 font-semibold text-muted">Estado anterior</div>
                <pre className="overflow-x-auto rounded bg-white p-2">{JSON.stringify(e.estadoAnterior ?? null, null, 2)}</pre>
              </div>
              <div>
                <div className="mb-1 font-semibold text-muted">Estado nuevo</div>
                <pre className="overflow-x-auto rounded bg-white p-2">{JSON.stringify(e.estadoNuevo ?? null, null, 2)}</pre>
              </div>
            </div>
          </Td>
        </tr>
      )}
    </>
  );
}
