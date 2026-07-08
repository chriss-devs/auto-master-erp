"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { useSesion } from "@/lib/session";
import { Badge, Button, Campo, Dialogo, Input, Select, Spinner, Tabla, Td, Th, Vacio, useToast } from "@/components/ui";

interface Cliente {
  id: string;
  tipo: string;
  nombre: string;
  rucOCedula?: string | null;
  dv?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  activo: boolean;
}

interface PrecioEspecial {
  id: string;
  precio: string;
  producto: { id: string; sku: string; nombre: string; precioBase: string };
}

export default function ClientesPage() {
  const { puede } = useSesion();
  const [q, setQ] = useState("");
  const [filas, setFilas] = useState<Cliente[] | null>(null);
  const [editando, setEditando] = useState<Cliente | "nuevo" | null>(null);
  const [detalle, setDetalle] = useState<(Cliente & { preciosEspeciales: PrecioEspecial[] }) | null>(null);

  const cargar = useCallback(() => {
    api<{ datos: Cliente[] }>(`/clientes?limit=50${q ? `&q=${encodeURIComponent(q)}` : ""}`)
      .then((r) => setFilas(r.datos))
      .catch(() => setFilas([]));
  }, [q]);

  useEffect(() => {
    const t = setTimeout(cargar, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [cargar, q]);

  const verDetalle = (c: Cliente) => {
    api<typeof detalle>(`/clientes/${c.id}`).then(setDetalle).catch(() => {});
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Clientes</h1>
        {puede("clientes:gestionar") && <Button onClick={() => setEditando("nuevo")}>+ Cliente</Button>}
      </div>
      <Input placeholder="Buscar por nombre o RUC/cédula…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />

      {!filas ? (
        <Spinner />
      ) : (
        <Tabla>
          <thead>
            <tr><Th>Nombre</Th><Th>Tipo</Th><Th>RUC/Cédula</Th><Th>Teléfono</Th><Th className="w-40"> </Th></tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr key={c.id} className="hover:bg-page">
                <Td className="font-medium">{c.nombre}</Td>
                <Td>{c.tipo === "CONSUMIDOR_FINAL" ? <Badge tono="azul">Consumidor final</Badge> : c.tipo === "JURIDICO" ? "Jurídico" : "Natural"}</Td>
                <Td className="font-mono text-xs">{c.rucOCedula ?? "—"}{c.dv ? ` DV ${c.dv}` : ""}</Td>
                <Td>{c.telefono ?? "—"}</Td>
                <Td className="text-right">
                  <button className="mr-3 text-primary hover:underline" onClick={() => verDetalle(c)}>precios</button>
                  {puede("clientes:gestionar") && c.tipo !== "CONSUMIDOR_FINAL" && (
                    <button className="text-primary hover:underline" onClick={() => setEditando(c)}>editar</button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}

      {editando && (
        <ClienteDialog
          cliente={editando === "nuevo" ? null : editando}
          onCerrar={(rec) => {
            setEditando(null);
            if (rec) cargar();
          }}
        />
      )}

      {detalle && (
        <PreciosEspecialesDialog
          cliente={detalle}
          onCerrar={() => setDetalle(null)}
          onCambio={() => verDetalle(detalle)}
        />
      )}
    </div>
  );
}

function ClienteDialog({ cliente, onCerrar }: { cliente: Cliente | null; onCerrar: (rec: boolean) => void }) {
  const { avisar } = useToast();
  const [f, setF] = useState({
    nombre: cliente?.nombre ?? "",
    tipo: cliente?.tipo ?? "NATURAL",
    rucOCedula: cliente?.rucOCedula ?? "",
    dv: cliente?.dv ?? "",
    telefono: cliente?.telefono ?? "",
    email: cliente?.email ?? "",
    direccion: cliente?.direccion ?? "",
  });
  const [ocupado, setOcupado] = useState(false);

  const guardar = async () => {
    setOcupado(true);
    const cuerpo = {
      nombre: f.nombre.trim(),
      tipo: f.tipo,
      rucOCedula: f.rucOCedula || undefined,
      dv: f.dv || undefined,
      telefono: f.telefono || undefined,
      email: f.email || undefined,
      direccion: f.direccion || undefined,
    };
    try {
      if (cliente) await api(`/clientes/${cliente.id}`, { metodo: "PATCH", cuerpo });
      else await api("/clientes", { cuerpo });
      avisar("ok", "Cliente guardado.");
      onCerrar(true);
    } catch (e) {
      avisar("error", e instanceof ApiError ? e.message : "No se pudo guardar.");
      setOcupado(false);
    }
  };

  return (
    <Dialogo abierto onCerrar={() => onCerrar(false)} titulo={cliente ? "Editar cliente" : "Cliente nuevo"}>
      <div className="grid gap-3 md:grid-cols-2">
        <Campo etiqueta="Nombre" className="md:col-span-2"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoFocus /></Campo>
        <Campo etiqueta="Tipo">
          <Select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            <option value="NATURAL">Natural</option>
            <option value="JURIDICO">Jurídico</option>
          </Select>
        </Campo>
        <Campo etiqueta="Teléfono"><Input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></Campo>
        <Campo etiqueta="RUC / Cédula"><Input value={f.rucOCedula} onChange={(e) => setF({ ...f, rucOCedula: e.target.value })} /></Campo>
        <Campo etiqueta="DV"><Input value={f.dv} onChange={(e) => setF({ ...f, dv: e.target.value })} /></Campo>
        <Campo etiqueta="Correo" className="md:col-span-2"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
        <Campo etiqueta="Dirección" className="md:col-span-2"><Input value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} /></Campo>
      </div>
      <Button className="mt-4 w-full" onClick={() => void guardar()} disabled={ocupado || !f.nombre.trim()}>Guardar</Button>
    </Dialogo>
  );
}

function PreciosEspecialesDialog({
  cliente,
  onCerrar,
  onCambio,
}: {
  cliente: Cliente & { preciosEspeciales: PrecioEspecial[] };
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const { puede } = useSesion();
  const { avisar } = useToast();
  const [q, setQ] = useState("");
  const [opciones, setOpciones] = useState<Array<{ id: string; sku: string; nombre: string; precioBase: string }>>([]);
  const [precio, setPrecio] = useState("");
  const [productoId, setProductoId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!q.trim()) {
        setOpciones([]);
        return;
      }
      api<{ datos: typeof opciones }>(`/productos/buscar?q=${encodeURIComponent(q)}&limit=6`).then((r) => setOpciones(r.datos)).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const agregar = async () => {
    if (!productoId) return;
    try {
      await api(`/clientes/${cliente.id}/precios-especiales`, { cuerpo: { productoId, precio: Number(precio).toFixed(2) } });
      avisar("ok", "Precio especial guardado (D-024).");
      setQ(""); setPrecio(""); setProductoId(null);
      onCambio();
    } catch (e) {
      avisar("error", e instanceof ApiError ? e.message : "No se pudo guardar.");
    }
  };

  const quitar = async (peId: string) => {
    try {
      await api(`/clientes/${cliente.id}/precios-especiales/${peId}`, { metodo: "DELETE" });
      onCambio();
    } catch (e) {
      avisar("error", e instanceof ApiError ? e.message : "No se pudo quitar.");
    }
  };

  return (
    <Dialogo abierto onCerrar={onCerrar} titulo={`Precios especiales — ${cliente.nombre}`} ancho="max-w-2xl">
      {cliente.preciosEspeciales.length === 0 ? (
        <Vacio texto="Este cliente no tiene precios especiales." />
      ) : (
        <Tabla className="mb-3">
          <thead><tr><Th>Producto</Th><Th className="text-right">Precio lista</Th><Th className="text-right">Precio especial</Th><Th className="w-16"> </Th></tr></thead>
          <tbody>
            {cliente.preciosEspeciales.map((pe) => (
              <tr key={pe.id}>
                <Td><span className="mr-2 font-mono text-xs text-muted">{pe.producto.sku}</span>{pe.producto.nombre}</Td>
                <Td className="text-right text-muted">{fmtMoney(pe.producto.precioBase)}</Td>
                <Td className="text-right font-semibold text-primary">{fmtMoney(pe.precio)}</Td>
                <Td>
                  {puede("clientes:gestionar") && (
                    <button className="text-danger hover:underline" onClick={() => void quitar(pe.id)}>quitar</button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}

      {puede("clientes:gestionar") && cliente.tipo !== "CONSUMIDOR_FINAL" && (
        <div className="rounded-md border border-border p-3">
          <h4 className="mb-2 text-sm font-semibold">Agregar precio especial</h4>
          <div className="relative mb-2">
            <Input placeholder="Buscar producto…" value={q} onChange={(e) => { setQ(e.target.value); setProductoId(null); }} />
            {opciones.length > 0 && !productoId && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-surface shadow-lg">
                {opciones.map((p) => (
                  <button key={p.id} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-page"
                    onClick={() => { setProductoId(p.id); setQ(`${p.sku} — ${p.nombre}`); setPrecio(p.precioBase); setOpciones([]); }}>
                    <span className="mr-2 font-mono text-xs text-muted">{p.sku}</span>{p.nombre}
                    <span className="float-right">{fmtMoney(p.precioBase)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Input inputMode="decimal" placeholder="Precio especial" value={precio} onChange={(e) => setPrecio(e.target.value)} className="w-40" />
            <Button onClick={() => void agregar()} disabled={!productoId || Number(precio) <= 0}>Guardar</Button>
          </div>
        </div>
      )}
    </Dialogo>
  );
}
