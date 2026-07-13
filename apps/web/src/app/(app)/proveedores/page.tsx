"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useSesion } from "@/lib/session";
import { Paginador, usePaginacion } from "@/components/paginacion";
import { Button, Campo, Dialogo, Input, Spinner, TablaResponsive, Td, Th, useToast } from "@/components/ui";

interface Proveedor {
  id: string;
  nombre: string;
  ruc?: string | null;
  dv?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
}

export default function ProveedoresPage() {
  const { puede } = useSesion();
  const [q, setQ] = useState("");
  const pag = usePaginacion<Proveedor>(`/proveedores${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  const filas = pag.filas;
  const [editando, setEditando] = useState<Proveedor | "nuevo" | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Proveedores</h1>
        {puede("proveedores:gestionar") && <Button onClick={() => setEditando("nuevo")}>+ Proveedor</Button>}
      </div>
      <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />

      {!filas ? (
        <Spinner />
      ) : (
        <>
        <TablaResponsive
          filas={filas}
          claveFila={(p) => p.id}
          vacio="Sin proveedores."
          encabezado={<><Th>Nombre</Th><Th>RUC</Th><Th>Teléfono</Th><Th>Correo</Th><Th className="w-20"> </Th></>}
          renderFila={(p) => (
            <>
              <Td className="font-medium">{p.nombre}</Td>
              <Td className="font-mono text-xs">{p.ruc ?? "—"}</Td>
              <Td>{p.telefono ?? "—"}</Td>
              <Td>{p.email ?? "—"}</Td>
              <Td>
                {puede("proveedores:gestionar") && (
                  <button className="text-primary hover:underline" onClick={() => setEditando(p)}>editar</button>
                )}
              </Td>
            </>
          )}
          renderTarjeta={(p) => (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">{p.nombre}</div>
                <div className="mt-1 text-xs text-muted">
                  {p.ruc ?? "sin RUC"} · {p.telefono ?? "sin teléfono"}
                </div>
                {p.email && <div className="text-xs text-muted">{p.email}</div>}
              </div>
              {puede("proveedores:gestionar") && (
                <button className="min-h-[44px] shrink-0 px-2 text-sm text-primary hover:underline" onClick={() => setEditando(p)}>editar</button>
              )}
            </div>
          )}
        />
        <Paginador p={pag} nombre="proveedor(es)" />
        </>
      )}

      {editando && (
        <ProveedorDialog
          proveedor={editando === "nuevo" ? null : editando}
          onCerrar={(rec) => {
            setEditando(null);
            if (rec) pag.recargar();
          }}
        />
      )}
    </div>
  );
}

function ProveedorDialog({ proveedor, onCerrar }: { proveedor: Proveedor | null; onCerrar: (rec: boolean) => void }) {
  const { avisar } = useToast();
  const [f, setF] = useState({
    nombre: proveedor?.nombre ?? "",
    ruc: proveedor?.ruc ?? "",
    dv: proveedor?.dv ?? "",
    telefono: proveedor?.telefono ?? "",
    email: proveedor?.email ?? "",
    direccion: proveedor?.direccion ?? "",
  });
  const [ocupado, setOcupado] = useState(false);

  const guardar = async () => {
    setOcupado(true);
    const cuerpo = {
      nombre: f.nombre.trim(),
      ruc: f.ruc || undefined,
      dv: f.dv || undefined,
      telefono: f.telefono || undefined,
      email: f.email || undefined,
      direccion: f.direccion || undefined,
    };
    try {
      if (proveedor) await api(`/proveedores/${proveedor.id}`, { metodo: "PATCH", cuerpo });
      else await api("/proveedores", { cuerpo });
      avisar("ok", "Proveedor guardado.");
      onCerrar(true);
    } catch (e) {
      avisar("error", e instanceof ApiError ? e.message : "No se pudo guardar.");
      setOcupado(false);
    }
  };

  return (
    <Dialogo abierto onCerrar={() => onCerrar(false)} titulo={proveedor ? "Editar proveedor" : "Proveedor nuevo"}>
      <div className="grid gap-3 md:grid-cols-2">
        <Campo etiqueta="Nombre" className="md:col-span-2"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoFocus /></Campo>
        <Campo etiqueta="RUC"><Input value={f.ruc} onChange={(e) => setF({ ...f, ruc: e.target.value })} /></Campo>
        <Campo etiqueta="DV"><Input value={f.dv} onChange={(e) => setF({ ...f, dv: e.target.value })} /></Campo>
        <Campo etiqueta="Teléfono"><Input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></Campo>
        <Campo etiqueta="Correo"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
        <Campo etiqueta="Dirección" className="md:col-span-2"><Input value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} /></Campo>
      </div>
      <Button className="mt-4 w-full" onClick={() => void guardar()} disabled={ocupado || !f.nombre.trim()}>Guardar</Button>
    </Dialogo>
  );
}
