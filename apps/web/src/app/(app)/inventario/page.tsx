"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { fmtFecha, fmtMoney, fmtQty } from "@/lib/format";
import { useSesion } from "@/lib/session";
import { Badge, Button, Campo, Dialogo, Input, Select, Spinner, Tabla, Td, Th, Vacio, useToast } from "@/components/ui";

interface FilaStock {
  producto: { id: string; sku: string; nombre: string; unidad: string; stockMinimo: string };
  stocks: Array<{ sucursal: { id: string; codigo: string; nombre: string }; cantidad: string; costoPromedio: string }>;
}

interface Mov {
  id: string;
  tipo: string;
  cantidad: string;
  costoUnitario: string;
  saldoResultante: string;
  motivo?: string | null;
  creadoEn: string;
  sucursal: { codigo: string };
}

function InventarioContenido() {
  const { me, sucursalId, puede } = useSesion();
  const { avisar } = useToast();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [soloBajo, setSoloBajo] = useState(params.get("bajo") === "1");
  const [filas, setFilas] = useState<FilaStock[] | null>(null);
  const [ajuste, setAjuste] = useState<FilaStock | null>(null);
  const [kardex, setKardex] = useState<{ producto: FilaStock["producto"]; movs: Mov[] } | null>(null);

  const cargar = useCallback(() => {
    api<{ datos: FilaStock[] }>(`/inventario/stock?limit=50${q ? `&q=${encodeURIComponent(q)}` : ""}${soloBajo ? "&bajo_minimo=true" : ""}`)
      .then((r) => setFilas(r.datos))
      .catch(() => setFilas([]));
  }, [q, soloBajo]);

  useEffect(() => {
    const t = setTimeout(cargar, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [cargar, q]);

  const verKardex = async (p: FilaStock["producto"]) => {
    try {
      const r = await api<{ datos: Mov[] }>(`/inventario/productos/${p.id}/kardex?limit=30`);
      setKardex({ producto: p, movs: r.datos });
    } catch {
      avisar("error", "No se pudo cargar el kardex.");
    }
  };

  const sucursales = me?.sucursales ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Inventario — stock por sucursal</h1>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={soloBajo} onChange={(e) => setSoloBajo(e.target.checked)} /> Solo bajo mínimo
        </label>
      </div>
      <Input placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />

      {!filas ? (
        <Spinner />
      ) : filas.length === 0 ? (
        <Vacio texto="Sin resultados." />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Código</Th><Th>Producto</Th>
              {sucursales.map((s) => <Th key={s.id} className="text-right">{s.codigo} {s.nombre}</Th>)}
              <Th className="text-right">Mínimo</Th><Th className="w-44"> </Th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const total = f.stocks.reduce((a, s) => a + Number(s.cantidad), 0);
              const bajo = Number(f.producto.stockMinimo) > 0 && total <= Number(f.producto.stockMinimo);
              return (
                <tr key={f.producto.id} className="hover:bg-page">
                  <Td className="font-mono text-xs">{f.producto.sku}</Td>
                  <Td>
                    {f.producto.nombre} {bajo && <Badge tono="rojo" className="ml-1">bajo</Badge>}
                  </Td>
                  {sucursales.map((s) => {
                    const st = f.stocks.find((x) => x.sucursal.id === s.id);
                    return (
                      <Td key={s.id} className="text-right">
                        {fmtQty(st?.cantidad ?? 0)} <span className="text-xs text-muted">@ {fmtMoney(st?.costoPromedio ?? 0)}</span>
                      </Td>
                    );
                  })}
                  <Td className="text-right text-muted">{fmtQty(f.producto.stockMinimo)}</Td>
                  <Td className="text-right">
                    <button className="mr-3 text-primary hover:underline" onClick={() => void verKardex(f.producto)}>kardex</button>
                    {puede("inventario:ajustar") && (
                      <button className="text-primary hover:underline" onClick={() => setAjuste(f)}>ajustar</button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}

      {ajuste && (
        <AjusteDialog
          fila={ajuste}
          sucursalId={sucursalId}
          onCerrar={(rec) => {
            setAjuste(null);
            if (rec) cargar();
          }}
        />
      )}

      <Dialogo abierto={!!kardex} onCerrar={() => setKardex(null)} titulo={`Kardex — ${kardex?.producto.nombre ?? ""}`} ancho="max-w-3xl">
        <Tabla>
          <thead>
            <tr><Th>Fecha</Th><Th>Suc.</Th><Th>Tipo</Th><Th className="text-right">Cantidad</Th><Th className="text-right">Costo</Th><Th className="text-right">Saldo</Th><Th>Motivo</Th></tr>
          </thead>
          <tbody>
            {kardex?.movs.map((m) => (
              <tr key={m.id}>
                <Td className="whitespace-nowrap text-xs">{fmtFecha(m.creadoEn)}</Td>
                <Td>{m.sucursal.codigo}</Td>
                <Td><Badge tono={m.tipo.startsWith("ENTRADA") || m.tipo === "DEVOLUCION_ENTRADA" || m.tipo === "AJUSTE_ENTRADA" ? "verde" : "rojo"}>{m.tipo}</Badge></Td>
                <Td className="text-right">{fmtQty(m.cantidad)}</Td>
                <Td className="text-right">{fmtMoney(m.costoUnitario)}</Td>
                <Td className="text-right font-medium">{fmtQty(m.saldoResultante)}</Td>
                <Td className="text-xs text-muted">{m.motivo ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
        <p className="mt-2 text-xs text-muted">Histórico append-only e inmutable (RN-005/006): las correcciones son movimientos nuevos.</p>
      </Dialogo>
    </div>
  );
}

export default function InventarioPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <InventarioContenido />
    </Suspense>
  );
}

function AjusteDialog({ fila, sucursalId, onCerrar }: { fila: FilaStock; sucursalId: string | null; onCerrar: (recargar: boolean) => void }) {
  const { me } = useSesion();
  const { avisar } = useToast();
  const [sucursal, setSucursal] = useState(sucursalId ?? me?.sucursales[0]?.id ?? "");
  const [direccion, setDireccion] = useState<"ENTRADA" | "SALIDA">("ENTRADA");
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const guardar = async () => {
    setOcupado(true);
    try {
      await api("/inventario/ajustes", {
        cuerpo: {
          productoId: fila.producto.id,
          sucursalId: sucursal,
          direccion,
          cantidad,
          ...(direccion === "ENTRADA" && costo ? { costoUnitario: Number(costo).toFixed(4) } : {}),
          motivo,
        },
        sucursalId: sucursal,
      });
      avisar("ok", "Ajuste registrado con movimiento inmutable.");
      onCerrar(true);
    } catch (e) {
      avisar("error", e instanceof ApiError ? e.message : "No se pudo ajustar.");
      setOcupado(false);
    }
  };

  return (
    <Dialogo abierto onCerrar={() => onCerrar(false)} titulo={`Ajuste — ${fila.producto.nombre}`}>
      <div className="space-y-3">
        <Campo etiqueta="Sucursal">
          <Select value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
            {(me?.sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.codigo} — {s.nombre}</option>)}
          </Select>
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Dirección">
            <Select value={direccion} onChange={(e) => setDireccion(e.target.value as "ENTRADA" | "SALIDA")}>
              <option value="ENTRADA">Entrada (+)</option>
              <option value="SALIDA">Salida (−)</option>
            </Select>
          </Campo>
          <Campo etiqueta={`Cantidad (${fila.producto.unidad})`}>
            <Input inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </Campo>
        </div>
        {direccion === "ENTRADA" && (
          <Campo etiqueta="Costo unitario (recalcula promedio — RN-009)">
            <Input inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Vacío = usa promedio actual" />
          </Campo>
        )}
        <Campo etiqueta="Motivo (obligatorio, queda en auditoría)">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Conteo físico, merma, corrección…" />
        </Campo>
        <Button className="w-full" onClick={() => void guardar()} disabled={ocupado || !motivo.trim() || Number(cantidad) <= 0}>
          Registrar ajuste
        </Button>
      </div>
    </Dialogo>
  );
}
