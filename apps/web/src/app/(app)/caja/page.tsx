"use client";

/** Caja — Paso 2 (D-020): cobrar/facturar/entregar + apertura/cierre con cuadre (RN-120/123). */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, nuevaIdempotencyKey } from "@/lib/api";
import { fmtFecha, fmtMoney, fmtQty } from "@/lib/format";
import { useSesion } from "@/lib/session";
import { Badge, Button, Campo, Card, Dialogo, Input, Kbd, Select, Spinner, Tabla, Td, Th, Vacio, cx, useToast } from "@/components/ui";

const METODOS = ["EFECTIVO", "TARJETA", "YAPPY", "ACH"] as const;
type Metodo = (typeof METODOS)[number];

interface EstadoCaja {
  abierta: boolean;
  sesion?: { id: string; abiertaEn: string; montoInicial: string };
  esperado?: Record<string, string>;
  totalVentas?: string;
  cantidadVentas?: number;
}

interface VentaPrep {
  id: string;
  total: string;
  subtotal: string;
  descuentoTotal: string;
  itbmsTotal: string;
  creadoEn: string;
  notas?: string | null;
  cliente: { nombre: string };
  lineas: Array<{ id: string; descripcion: string; cantidad: string; precioUnitario: string; totalLinea: string }>;
}

interface Pago {
  metodo: Metodo;
  monto: string;
  referencia: string;
}

export default function CajaPage() {
  const { sucursalId, puede } = useSesion();
  const { avisar } = useToast();

  const [estado, setEstado] = useState<EstadoCaja | null>(null);
  const [prep, setPrep] = useState<VentaPrep[]>([]);
  const [venta, setVenta] = useState<VentaPrep | null>(null);
  const [pagos, setPagos] = useState<Pago[]>([{ metodo: "EFECTIVO", monto: "", referencia: "" }]);
  const [recibido, setRecibido] = useState("");
  const [cobrando, setCobrando] = useState(false);
  const [resultado, setResultado] = useState<{ numero: string; vuelto: string; facturaId?: string; facturaNumero?: string } | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const [montoInicial, setMontoInicial] = useState("");
  const [movAbierto, setMovAbierto] = useState(false);
  const [cierreAbierto, setCierreAbierto] = useState(false);

  const cargar = useCallback(() => {
    if (!sucursalId) return;
    api<EstadoCaja>("/caja/estado", { sucursalId }).then(setEstado).catch(() => setEstado(null));
    api<{ datos: VentaPrep[] }>("/ventas?estado=PREPARACION&limit=20", { sucursalId })
      .then((r) => setPrep(r.datos))
      .catch(() => {});
  }, [sucursalId]);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 12000);
    return () => clearInterval(t);
  }, [cargar]);

  const seleccionar = (v: VentaPrep) => {
    setVenta(v);
    setPagos([{ metodo: "EFECTIVO", monto: v.total, referencia: "" }]);
    setRecibido("");
    setResultado(null);
  };

  const sumaPagos = useMemo(() => pagos.reduce((a, p) => a + Number(p.monto || 0), 0), [pagos]);
  const montoEfectivo = useMemo(() => pagos.filter((p) => p.metodo === "EFECTIVO").reduce((a, p) => a + Number(p.monto || 0), 0), [pagos]);
  const vueltoVivo = Math.max(0, Number(recibido || 0) - montoEfectivo);
  const faltante = venta ? Number(venta.total) - sumaPagos : 0;

  const cobrar = async () => {
    if (!venta) return;
    setCobrando(true);
    try {
      const r = await api<{
        numero: string;
        vuelto: string | null;
        factura?: { id: string; numero: string } | null;
      }>(`/ventas/${venta.id}/cobrar`, {
        cuerpo: {
          pagos: pagos.filter((p) => Number(p.monto) > 0).map((p) => ({
            metodo: p.metodo,
            monto: Number(p.monto).toFixed(2),
            ...(p.referencia ? { referencia: p.referencia } : {}),
          })),
          ...(montoEfectivo > 0 && recibido ? { efectivoRecibido: Number(recibido).toFixed(2) } : {}),
          idempotencyKey: nuevaIdempotencyKey(),
        },
        sucursalId,
      });
      setResultado({ numero: r.numero, vuelto: r.vuelto ?? "0", facturaId: r.factura?.id, facturaNumero: r.factura?.numero });
      setVenta(null);
      cargar();
    } catch (e) {
      if (e instanceof ApiError && e.codigo === "STOCK_INSUFICIENTE") {
        const d = (e.detalles?.[0] ?? {}) as { disponible?: string; solicitado?: string };
        avisar("error", `${e.message} Disponible: ${fmtQty(d.disponible ?? "0")}, pedido: ${fmtQty(d.solicitado ?? "?")}. Ajuste la venta o el inventario.`);
      } else {
        avisar("error", e instanceof ApiError ? e.message : "No se pudo cobrar.");
      }
    } finally {
      setCobrando(false);
    }
  };

  // F9 cobra cuando hay venta seleccionada
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "F9" && venta && !cobrando) {
        e.preventDefault();
        void cobrar();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venta, pagos, recibido, cobrando]);

  const abrirCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    setAbriendo(true);
    try {
      await api("/caja/sesiones", { cuerpo: { montoInicial: Number(montoInicial || 0).toFixed(2) }, sucursalId });
      avisar("ok", "Caja abierta.");
      setMontoInicial("");
      cargar();
    } catch (err) {
      avisar("error", err instanceof ApiError ? err.message : "No se pudo abrir la caja.");
    } finally {
      setAbriendo(false);
    }
  };

  if (!estado) return <Spinner texto="Cargando caja…" />;

  if (!estado.abierta) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-lg font-bold">Caja</h1>
        <Card titulo="Apertura de caja (RN-123: obligatoria para cobrar)">
          <form onSubmit={abrirCaja} className="space-y-3">
            <Campo etiqueta="Monto inicial en efectivo (B/.)">
              <Input autoFocus inputMode="decimal" value={montoInicial} onChange={(e) => setMontoInicial(e.target.value)} placeholder="100.00" required />
            </Campo>
            <Button type="submit" className="w-full" disabled={abriendo}>Abrir caja</Button>
          </form>
        </Card>
        {resultado && <ResultadoCobro r={resultado} onCerrar={() => setResultado(null)} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Caja — cobrar y entregar</h1>
        <div className="flex items-center gap-2 text-sm">
          <Badge tono="verde">Abierta desde {fmtFecha(estado.sesion!.abiertaEn)}</Badge>
          <Button variante="secondary" onClick={() => setMovAbierto(true)}>Ingreso/Egreso</Button>
          {puede("caja:cerrar") && (
            <Button variante="danger" onClick={() => setCierreAbierto(true)}>Cerrar caja</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
        {METODOS.map((m) => (
          <Card key={m} className="py-3">
            <div className="text-xs text-muted">{m === "ACH" ? "Transferencia/ACH" : m.charAt(0) + m.slice(1).toLowerCase()}</div>
            <div className="text-lg font-bold">{fmtMoney(estado.esperado?.[m] ?? 0)}</div>
          </Card>
        ))}
        <Card className="py-3">
          <div className="text-xs text-muted">Ventas del turno</div>
          <div className="text-lg font-bold text-primary">{estado.cantidadVentas ?? 0} · {fmtMoney(estado.totalVentas ?? 0)}</div>
        </Card>
      </div>

      <div className="grid gap-4 pb-24 lg:grid-cols-[340px_1fr] lg:pb-0">
        <Card titulo="Ventas en preparación">
          {prep.length === 0 ? (
            <Vacio texto="Nada pendiente de cobro." />
          ) : (
            <ul className="space-y-2">
              {prep.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => seleccionar(v)}
                    className={cx(
                      "w-full rounded-md border px-3 py-2 text-left text-sm",
                      venta?.id === v.id ? "border-primary bg-primary-light" : "border-border hover:bg-page",
                    )}
                  >
                    <div className="flex justify-between font-medium">
                      <span className="truncate">{v.cliente.nombre}</span>
                      <span>{fmtMoney(v.total)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted">
                      <span>{v.lineas.length} línea(s)</span>
                      <span>{fmtFecha(v.creadoEn)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card titulo={venta ? `Cobro — ${venta.cliente.nombre}` : "Cobro"}>
          {!venta ? (
            <Vacio texto="Seleccione una venta en preparación para cobrarla." />
          ) : (
            <div className="space-y-3">
              <Tabla>
                <thead>
                  <tr><Th>Descripción</Th><Th className="text-right">Cant.</Th><Th className="text-right">Precio</Th><Th className="text-right">Total</Th></tr>
                </thead>
                <tbody>
                  {venta.lineas.map((l) => (
                    <tr key={l.id}>
                      <Td>{l.descripcion}</Td>
                      <Td className="text-right">{fmtQty(l.cantidad)}</Td>
                      <Td className="text-right">{fmtMoney(l.precioUnitario)}</Td>
                      <Td className="text-right">{fmtMoney(l.totalLinea)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>

              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="text-sm text-muted">
                  Subtotal {fmtMoney(venta.subtotal)} · Desc. −{fmtMoney(venta.descuentoTotal)} · ITBMS {fmtMoney(venta.itbmsTotal)}
                </div>
                <div className="text-2xl font-black text-primary">Total: {fmtMoney(venta.total)}</div>
              </div>

              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Pagos (mixto permitido — D-029)</h4>
                  <Button variante="secondary" onClick={() => setPagos((p) => [...p, { metodo: "TARJETA", monto: faltante > 0 ? faltante.toFixed(2) : "", referencia: "" }])}>
                    + método
                  </Button>
                </div>
                {pagos.map((p, i) => (
                  <div key={i} className="grid grid-cols-2 items-end gap-2 border-b border-border pb-2 last:border-0 last:pb-0 sm:grid-cols-[130px_1fr_1fr_32px] sm:items-center sm:border-0 sm:pb-0">
                    <Select className="col-span-2 sm:col-span-1" value={p.metodo} onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, metodo: e.target.value as Metodo } : x)))}>
                      {METODOS.map((m) => <option key={m} value={m}>{m === "ACH" ? "ACH/Transf." : m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
                    </Select>
                    <Input inputMode="decimal" placeholder="Monto" value={p.monto} onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))} />
                    <Input placeholder={p.metodo === "TARJETA" ? "Voucher datáfono" : p.metodo === "EFECTIVO" ? "—" : "Referencia"} disabled={p.metodo === "EFECTIVO"} value={p.referencia} onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, referencia: e.target.value } : x)))} />
                    <button className="flex h-11 w-11 items-center justify-center text-danger sm:h-auto sm:w-auto" onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))} disabled={pagos.length === 1}>✕</button>
                  </div>
                ))}
                <div className={cx("text-right text-sm font-medium", Math.abs(faltante) < 0.005 ? "text-success" : "text-danger")}>
                  {Math.abs(faltante) < 0.005 ? "Pagos completos" : faltante > 0 ? `Faltan ${fmtMoney(faltante)}` : `Sobran ${fmtMoney(-faltante)} (ajuste: solo el efectivo da vuelto)`}
                </div>

                {montoEfectivo > 0 && (
                  <div className="flex items-center justify-between gap-3 rounded bg-page px-3 py-2">
                    <Campo etiqueta="Efectivo recibido" className="w-40">
                      <Input inputMode="decimal" value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder={montoEfectivo.toFixed(2)} />
                    </Campo>
                    <div className="text-right">
                      <div className="text-xs text-muted">Vuelto</div>
                      <div className="text-xl font-bold text-success">{fmtMoney(vueltoVivo)}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="hidden lg:block">
                <Button className="w-full py-2.5 text-base" disabled={cobrando || Math.abs(faltante) >= 0.005} onClick={() => void cobrar()}>
                  {cobrando ? "Cobrando…" : "Cobrar y facturar"} <Kbd>F9</Kbd>
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {venta && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface p-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
          <Button className="w-full py-2.5 text-base" disabled={cobrando || Math.abs(faltante) >= 0.005} onClick={() => void cobrar()}>
            {cobrando ? "Cobrando…" : "Cobrar y facturar"} <Kbd>F9</Kbd>
          </Button>
        </div>
      )}

      {resultado && <ResultadoCobro r={resultado} onCerrar={() => setResultado(null)} />}
      <MovimientoCaja abierto={movAbierto} onCerrar={() => { setMovAbierto(false); cargar(); }} />
      <CierreCaja abierto={cierreAbierto} sesionId={estado.sesion!.id} esperado={estado.esperado ?? {}} onCerrar={() => { setCierreAbierto(false); cargar(); }} />
    </div>
  );
}

function ResultadoCobro({ r, onCerrar }: { r: { numero: string; vuelto: string; facturaId?: string; facturaNumero?: string }; onCerrar: () => void }) {
  return (
    <Dialogo abierto onCerrar={onCerrar} titulo={`Venta ${r.numero} cobrada`}>
      <div className="space-y-3 text-center">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Vuelto</div>
          <div className="text-4xl font-black text-success">{fmtMoney(r.vuelto)}</div>
        </div>
        {r.facturaId ? (
          <p className="text-sm">
            Factura <span className="font-mono font-medium">{r.facturaNumero}</span>{" "}
            <Badge tono="ambar">contingencia — pendiente de transmitir</Badge>
          </p>
        ) : (
          <p className="text-sm text-warning">La factura no pudo generarse; puede emitirse luego desde Facturas.</p>
        )}
        <div className="flex justify-center gap-2">
          {r.facturaId && (
            <Link href={`/facturas/${r.facturaId}/imprimir`} target="_blank">
              <Button variante="secondary">Imprimir factura (carta)</Button>
            </Link>
          )}
          <Button onClick={onCerrar} autoFocus>Siguiente cliente</Button>
        </div>
      </div>
    </Dialogo>
  );
}

function MovimientoCaja({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { sucursalId } = useSesion();
  const { avisar } = useToast();
  const [tipo, setTipo] = useState<"INGRESO" | "EGRESO" | "RETIRO">("EGRESO");
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");

  const guardar = async () => {
    try {
      await api("/caja/movimientos", { cuerpo: { tipo, monto: Number(monto).toFixed(2), motivo }, sucursalId });
      avisar("ok", "Movimiento registrado.");
      setMonto(""); setMotivo("");
      onCerrar();
    } catch (e) {
      avisar("error", e instanceof ApiError ? e.message : "No se pudo registrar.");
    }
  };

  return (
    <Dialogo abierto={abierto} onCerrar={onCerrar} titulo="Movimiento de caja (efectivo)">
      <div className="space-y-3">
        <Campo etiqueta="Tipo">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="INGRESO">Ingreso</option>
            <option value="EGRESO">Egreso / gasto menor</option>
            <option value="RETIRO">Retiro a bóveda</option>
          </Select>
        </Campo>
        <Campo etiqueta="Monto (B/.)"><Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} /></Campo>
        <Campo etiqueta="Motivo (obligatorio)"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
        <Button className="w-full" onClick={() => void guardar()} disabled={!motivo.trim() || Number(monto) <= 0}>Registrar</Button>
      </div>
    </Dialogo>
  );
}

function CierreCaja({ abierto, sesionId, esperado, onCerrar }: { abierto: boolean; sesionId: string; esperado: Record<string, string>; onCerrar: () => void }) {
  const { sucursalId } = useSesion();
  const { avisar } = useToast();
  const [contado, setContado] = useState<Record<string, string>>({});
  const [notas, setNotas] = useState("");
  const [resultado, setResultado] = useState<{ cuadre: Record<string, { esperado: string; contado: string; diferencia: string }>; descuadreTotal: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cerrar = async () => {
    setOcupado(true);
    try {
      const r = await api<typeof resultado>(`/caja/sesiones/${sesionId}/cerrar`, {
        cuerpo: {
          contado: Object.fromEntries(METODOS.map((m) => [m, Number(contado[m] || 0).toFixed(2)])),
          ...(notas ? { notas } : {}),
        },
        sucursalId,
      });
      setResultado(r);
    } catch (e) {
      avisar("error", e instanceof ApiError ? e.message : "No se pudo cerrar la caja.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Dialogo abierto={abierto} onCerrar={() => { setResultado(null); onCerrar(); }} titulo="Cierre de caja — cuadre por método (RN-120)">
      {!resultado ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">Cuente el efectivo y los comprobantes por método, y registre lo contado.</p>
          {METODOS.map((m) => (
            <div key={m} className="grid grid-cols-[110px_1fr_1fr] items-center gap-2 text-sm">
              <span className="font-medium">{m === "ACH" ? "ACH/Transf." : m.charAt(0) + m.slice(1).toLowerCase()}</span>
              <span className="text-muted">Esperado: {fmtMoney(esperado[m] ?? 0)}</span>
              <Input inputMode="decimal" placeholder="Contado" value={contado[m] ?? ""} onChange={(e) => setContado((c) => ({ ...c, [m]: e.target.value }))} />
            </div>
          ))}
          <Campo etiqueta="Notas (opcional)"><Input value={notas} onChange={(e) => setNotas(e.target.value)} /></Campo>
          <Button className="w-full" variante="danger" onClick={() => void cerrar()} disabled={ocupado}>Cerrar caja</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Tabla>
            <thead><tr><Th>Método</Th><Th className="text-right">Esperado</Th><Th className="text-right">Contado</Th><Th className="text-right">Diferencia</Th></tr></thead>
            <tbody>
              {Object.entries(resultado.cuadre).map(([m, c]) => (
                <tr key={m}>
                  <Td>{m}</Td>
                  <Td className="text-right">{fmtMoney(c.esperado)}</Td>
                  <Td className="text-right">{fmtMoney(c.contado)}</Td>
                  <Td className={cx("text-right font-semibold", Number(c.diferencia) === 0 ? "text-success" : "text-danger")}>{fmtMoney(c.diferencia)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <div className={cx("rounded px-3 py-2 text-center font-semibold", Number(resultado.descuadreTotal) === 0 ? "bg-success-bg text-success" : "bg-red-50 text-danger")}>
            {Number(resultado.descuadreTotal) === 0 ? "Cuadre perfecto ✔" : `Descuadre total: ${fmtMoney(resultado.descuadreTotal)} (queda registrado en auditoría)`}
          </div>
          <Button className="w-full" onClick={() => { setResultado(null); onCerrar(); }}>Entendido</Button>
        </div>
      )}
    </Dialogo>
  );
}
