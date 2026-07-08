"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useSesion } from "@/lib/session";
import { Button, Campo, Dialogo, Input, Spinner, Tabla, Td, Th, Vacio, useToast } from "@/components/ui";

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
  const [filas, setFilas] = useState<Proveedor[] | null>(null);
  const [editando, setEditando] = useState<Proveedor | "nuevo" | null>(null);

  const cargar = useCallback(() => {
    api<{ datos: Proveedor[] }>(`/proveedores?limit=50${q ? `&q=${encodeURIComponent(q)}` : ""}`)
      .then((r) => setFilas(r.datos))
      .catch(() => setFilas([]));
  }, [q]);

  useEffect(() => {
    const t = setTimeout(cargar, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [cargar, q]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Proveedores</h1>
        {puede("proveedores:gestionar") && <Button onClick={() => setEditando("nuevo")}>+ Proveedor</Button>}
      </div>
      <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />

      {!filas ? (
        <Spinner />
      ) : filas.length === 0 ? (
        <Vacio texto="Sin proveedores." />
      ) : (
        <Tabla>
          <thead><tr><Th>Nombre</Th><Th>RUC</Th><Th>Teléfono</Th><Th>Correo</Th><Th className="w-20"> </Th></tr></thead>
          <tbody>
            {filas.map((p) => (
              <tr key={p.id} className="hover:bg-page">
                <Td className="font-medium">{p.nombre}</Td>
                <Td className="font-mono text-xs">{p.ruc ?? "—"}</Td>
                <Td>{p.telefono ?? "—"}</Td>
                <Td>{p.email ?? "—"}</Td>
                <Td>
                  {puede("proveedores:gestionar") && (
                    <button className="text-primary hover:underline" onClick={() => setEditando(p)}>editar</button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}

      {editando && (
        <ProveedorDialog
          proveedor={editando === "nuevo" ? null : editando}
          onCerrar={(rec) => {
            setEditando(null);
            if (rec) cargar();
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
