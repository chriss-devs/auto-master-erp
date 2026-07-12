"use client";

/** POS ventanilla — Paso 1 (D-020): el vendedor arma la venta y la envía a caja. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, nuevaIdempotencyKey } from "@/lib/api";
import { fmtMoney, fmtQty, montoDescuento } from "@/lib/format";
import { useSesion } from "@/lib/session";
import { DescuentoPopover } from "@/components/descuento-popover";
import { Badge, Button, Campo, Card, Dialogo, Input, Kbd, Tabla, Td, Th, Vacio, cx, useToast } from "@/components/ui";

const PRESETS_DEFAULT = [5, 10, 15, 20];

interface ProductoBusqueda {
  id: string;
  sku: string;
  nombre: string;
  precioBase: string;
  tasaItbms: string;
  ventaFraccionada: boolean;
  marca?: { nombre: string } | null;
  unidadMedida: { codigo: string };
  stocks: Array<{ cantidad: string; sucursal: { id: string; codigo: string } }>;
}

interface Linea {
  producto: ProductoBusqueda;
  cantidad: string;
  descuento: string;
}

interface Cliente {
  id: string;
  nombre: string;
  tipo: string;
}

export default function VenderPage() {
  const { sucursalId } = useSesion();
  const { avisar } = useToast();
  const buscarRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ProductoBusqueda[]>([]);
  const [sel, setSel] = useState(0);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pedirAutorizacion, setPedirAutorizacion] = useState(false);
  const [autUsuario, setAutUsuario] = useState("");
  const [autPassword, setAutPassword] = useState("");
  const [enPreparacion, setEnPreparacion] = useState<Array<{ id: string; total: string; creadoEn: string; cliente: { nombre: string } }>>([]);
  const [presets, setPresets] = useState<number[]>(PRESETS_DEFAULT);

  // Presets de descuento ajustables en Admin > Configuración; si falla, se usa el default local.
  useEffect(() => {
    api<{ presets: number[] }>("/ventas/config-descuentos")
      .then((r) => r.presets?.length && setPresets(r.presets))
      .catch(() => {});
  }, []);

  // Búsqueda as-you-type con debounce (RNF-001, BL-012)
  useEffect(() => {
    const t = setTimeout(() => {
      if (!q.trim() || !sucursalId) {
        setResultados([]);
        return;
      }
      api<{ datos: ProductoBusqueda[] }>(`/productos/buscar?q=${encodeURIComponent(q)}&limit=8`, { sucursalId })
        .then((r) => {
          setResultados(r.datos);
          setSel(0);
        })
        .catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [q, sucursalId]);

  const cargarPreparacion = useCallback(() => {
    if (!sucursalId) return;
    api<{ datos: typeof enPreparacion }>(`/ventas?estado=PREPARACION&limit=10`, { sucursalId })
      .then((r) => setEnPreparacion(r.datos))
      .catch(() => {});
  }, [sucursalId]);

  useEffect(() => {
    buscarRef.current?.focus();
    cargarPreparacion();
  }, [cargarPreparacion]);

  const agregar = (p: ProductoBusqueda) => {
    setLineas((ls) => {
      const i = ls.findIndex((l) => l.producto.id === p.id);
      if (i >= 0) {
        const c = [...ls];
        c[i] = { ...c[i], cantidad: String(Number(c[i].cantidad) + 1) };
        return c;
      }
      return [...ls, { producto: p, cantidad: "1", descuento: "" }];
    });
    setQ("");
    setResultados([]);
    buscarRef.current?.focus();
  };

  /** Precio unitario efectivo (precio de lista − descuento vigente ÷ cantidad), para la columna "Precio". */
  const precioEfectivo = (l: Linea): number => {
    const cantidad = Number(l.cantidad || 0);
    if (cantidad <= 0) return Number(l.producto.precioBase);
    const bruto = Math.round(Number(l.producto.precioBase) * cantidad * 100) / 100;
    const desc = Math.min(montoDescuento(l.descuento, bruto), bruto);
    return (bruto - desc) / cantidad;
  };

  /** Precio editado a mano ⇒ se traduce a un descuento en monto equivalente (nunca sube del precio de lista). */
  const cambiarPrecio = (i: number, precioNuevo: number) => {
    if (!isFinite(precioNuevo)) return;
    setLineas((ls) =>
      ls.map((x, j) => {
        if (j !== i) return x;
        const cantidad = Number(x.cantidad || 0);
        const precioLista = Number(x.producto.precioBase);
        if (cantidad <= 0) return x;
        const clamped = Math.min(Math.max(precioNuevo, 0), precioLista);
        const bruto = Math.round(precioLista * cantidad * 100) / 100;
        const descuentoMonto = Math.round((bruto - clamped * cantidad) * 100) / 100;
        return { ...x, descuento: descuentoMonto > 0 ? descuentoMonto.toFixed(2) : "" };
      }),
    );
  };

  const totales = useMemo(() => {
    let subtotal = 0, descuento = 0, itbms = 0;
    for (const l of lineas) {
      const bruto = Math.round(Number(l.producto.precioBase) * Number(l.cantidad || 0) * 100) / 100;
      const desc = Math.min(montoDescuento(l.descuento, bruto), bruto);
      const base = bruto - desc;
      subtotal += bruto;
      descuento += desc;
      itbms += Math.round(base * Number(l.producto.tasaItbms) * 100) / 100;
    }
    return { subtotal, descuento, itbms, total: subtotal - descuento + itbms };
  }, [lineas]);

  const enviar = async (autorizacion?: { usuario: string; password: string }) => {
    if (!lineas.length) return avisar("aviso", "Agregue al menos un producto.");
    setEnviando(true);
    try {
      const r = await api<{ venta: { id: string; total: string }; advertencias: Array<{ producto: string; disponible: string }> }>(
        "/ventas",
        {
          cuerpo: {
            clienteId: cliente?.id,
            lineas: lineas.map((l) => {
              const bruto = Math.round(Number(l.producto.precioBase) * Number(l.cantidad || 0) * 100) / 100;
              const desc = montoDescuento(l.descuento, bruto);
              return {
                productoId: l.producto.id,
                cantidad: l.cantidad,
                ...(desc > 0 ? { descuento: desc.toFixed(2) } : {}),
              };
            }),
            notas: notas || undefined,
            idempotencyKey: nuevaIdempotencyKey(),
            ...(autorizacion ? { autorizacion } : {}),
          },
          sucursalId,
        },
      );
      for (const a of r.advertencias ?? []) {
        avisar("aviso", `Stock insuficiente de "${a.producto}" (disponible ${fmtQty(a.disponible)}): la caja no podrá cobrar hasta ajustar.`);
      }
      avisar("ok", `Venta enviada a caja — ${fmtMoney(r.venta.total)}`);
      setLineas([]);
      setCliente(null);
      setNotas("");
      setPedirAutorizacion(false);
      setAutUsuario("");
      setAutPassword("");
      cargarPreparacion();
      buscarRef.current?.focus();
    } catch (e) {
      if (e instanceof ApiError && e.codigo === "DESCUENTO_REQUIERE_AUTORIZACION") {
        setPedirAutorizacion(true);
        avisar("aviso", e.message);
      } else {
        avisar("error", e instanceof ApiError ? e.message : "No se pudo crear la venta.");
      }
    } finally {
      setEnviando(false);
    }
  };

  const cancelarPreparacion = async (id: string) => {
    try {
      await api(`/ventas/${id}/cancelar`, { cuerpo: { motivo: "Cancelada por el vendedor" }, sucursalId });
      cargarPreparacion();
    } catch (e) {
      avisar("error", e instanceof ApiError ? e.message : "No se pudo cancelar.");
    }
  };

  // F9 envía a caja
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "F9") {
        e.preventDefault();
        void enviar();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas, cliente, notas, sucursalId]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">Vender — armar venta</h1>
          <div className="text-xs text-muted">
            <Kbd>F2</Kbd> buscar · <Kbd>Enter</Kbd> agregar · <Kbd>F9</Kbd> enviar a caja
          </div>
        </div>

        <div className="relative">
          <Input
            ref={buscarRef}
            placeholder="Buscar por código interno, código de barras, OEM o nombre… (ej. FER-0001, filtro aceite)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, resultados.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter" && resultados[sel]) { e.preventDefault(); agregar(resultados[sel]); }
              if (e.key === "Escape") setResultados([]);
            }}
            className="py-2.5 text-base"
          />
          {resultados.length > 0 && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-lg">
              {resultados.map((p, i) => {
                const stockAqui = p.stocks.find((s) => s.sucursal.id === sucursalId);
                const otras = p.stocks.filter((s) => s.sucursal.id !== sucursalId);
                return (
                  <button
                    key={p.id}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => agregar(p)}
                    className={cx("flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm", i === sel ? "bg-primary-light" : "hover:bg-page")}
                  >
                    <span className="min-w-0">
                      <span className="mr-2 font-mono text-xs text-muted">{p.sku}</span>
                      <span className="font-medium">{p.nombre}</span>
                      {p.marca && <span className="ml-2 text-xs text-muted">{p.marca.nombre}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs">
                      <Badge tono={Number(stockAqui?.cantidad ?? 0) > 0 ? "verde" : "rojo"}>
                        Aquí: {fmtQty(stockAqui?.cantidad ?? 0)}
                      </Badge>
                      {otras.map((o) => (
                        <Badge key={o.sucursal.id} tono="gris">{o.sucursal.codigo}: {fmtQty(o.cantidad)}</Badge>
                      ))}
                      <span className="font-semibold">{fmtMoney(p.precioBase)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Tabla>
          <thead>
            <tr>
              <Th>Producto</Th><Th className="w-24 text-right">Cantidad</Th><Th className="w-28 text-right">Precio</Th>
              <Th className="w-28 text-right">Descuento</Th><Th className="w-28 text-right">Importe</Th><Th className="w-10"> </Th>
            </tr>
          </thead>
          <tbody>
            {lineas.length === 0 && (
              <tr><Td colSpan={6}><Vacio texto="Busque un producto y presione Enter para agregarlo." /></Td></tr>
            )}
            {lineas.map((l, i) => {
              const bruto = Math.round(Number(l.producto.precioBase) * Number(l.cantidad || 0) * 100) / 100;
              const descAplicado = Math.min(montoDescuento(l.descuento, bruto), bruto);
              return (
                <tr key={l.producto.id}>
                  <Td>
                    <div className="font-medium">{l.producto.nombre}</div>
                    <div className="font-mono text-xs text-muted">{l.producto.sku} · {l.producto.unidadMedida.codigo}</div>
                  </Td>
                  <Td>
                    <Input
                      className="text-right"
                      inputMode="decimal"
                      value={l.cantidad}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, cantidad: v } : x)));
                      }}
                    />
                  </Td>
                  <Td>
                    <InputPrecio key={`${l.descuento}|${l.cantidad}`} valor={precioEfectivo(l)} onCommit={(n) => cambiarPrecio(i, n)} />
                  </Td>
                  <Td className="text-right">
                    <DescuentoPopover
                      valor={l.descuento}
                      presets={presets}
                      ariaLabel="Descuento de la línea"
                      onCambiar={(v) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, descuento: v } : x)))}
                    />
                    {l.descuento.trim().endsWith("%") && descAplicado > 0 && (
                      <div className="mt-0.5 text-right text-[10px] text-muted">= {fmtMoney(descAplicado)}</div>
                    )}
                  </Td>
                  <Td className="text-right font-medium">{fmtMoney(bruto - descAplicado)}</Td>
                  <Td>
                    <button className="text-danger hover:underline" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}>✕</button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>

        <div className="grid gap-3 md:grid-cols-2">
          <SelectorCliente cliente={cliente} onCliente={setCliente} />
          <Campo etiqueta="Notas (opcional)">
            <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Referencia de la venta" />
          </Campo>
        </div>
      </div>

      <div className="space-y-3">
        <Card titulo="Totales">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{fmtMoney(totales.subtotal)}</dd></div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 text-muted">
                Descuento
                <DescuentoPopover
                  valor=""
                  ariaLabel="Descuento general (aplica a toda la venta)"
                  presets={presets}
                  onCambiar={(v) => {
                    if (!v || !lineas.length) return;
                    setLineas((ls) => ls.map((x) => ({ ...x, descuento: v })));
                  }}
                />
              </dt>
              <dd className="text-accent">−{fmtMoney(totales.descuento)}</dd>
            </div>
            <div className="flex justify-between"><dt className="text-muted">ITBMS</dt><dd>{fmtMoney(totales.itbms)}</dd></div>
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-lg font-bold">
              <dt>Total</dt><dd className="text-primary">{fmtMoney(totales.total)}</dd>
            </div>
          </dl>
          <Button className="mt-3 w-full py-2.5 text-base" disabled={enviando || lineas.length === 0} onClick={() => void enviar()}>
            {enviando ? "Enviando…" : "Enviar a caja (F9)"}
          </Button>
          <p className="mt-2 text-center text-xs text-muted">La caja cobra, factura y entrega (D-020).</p>
        </Card>

        <Card titulo="En preparación (esta sucursal)">
          {enPreparacion.length === 0 ? (
            <Vacio texto="No hay ventas esperando cobro." />
          ) : (
            <ul className="space-y-2 text-sm">
              {enPreparacion.map((v) => (
                <li key={v.id} className="flex items-center justify-between rounded border border-border px-2 py-1.5">
                  <span className="min-w-0 truncate">{v.cliente.nombre}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-medium">{fmtMoney(v.total)}</span>
                    <button className="text-xs text-danger hover:underline" onClick={() => void cancelarPreparacion(v.id)}>cancelar</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Dialogo abierto={pedirAutorizacion} onCerrar={() => setPedirAutorizacion(false)} titulo="Autorización de descuento (RN-160)">
        <p className="mb-3 text-sm text-muted">El descuento supera el umbral permitido. Un supervisor debe autorizar con sus credenciales.</p>
        <div className="space-y-3">
          <Campo etiqueta="Usuario del supervisor"><Input value={autUsuario} onChange={(e) => setAutUsuario(e.target.value)} /></Campo>
          <Campo etiqueta="Contraseña"><Input type="password" value={autPassword} onChange={(e) => setAutPassword(e.target.value)} /></Campo>
          <Button className="w-full" disabled={enviando} onClick={() => void enviar({ usuario: autUsuario, password: autPassword })}>
            Autorizar y enviar a caja
          </Button>
        </div>
      </Dialogo>
    </div>
  );
}

function SelectorCliente({ cliente, onCliente }: { cliente: Cliente | null; onCliente: (c: Cliente | null) => void }) {
  const { avisar } = useToast();
  const [q, setQ] = useState("");
  const [opciones, setOpciones] = useState<Cliente[]>([]);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ruc, setRuc] = useState("");
  const [telefono, setTelefono] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      if (!q.trim()) {
        setOpciones([]);
        return;
      }
      api<{ datos: Cliente[] }>(`/clientes?q=${encodeURIComponent(q)}&limit=6`).then((r) => setOpciones(r.datos)).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const crear = async () => {
    try {
      const c = await api<Cliente>("/clientes", { cuerpo: { nombre, rucOCedula: ruc || undefined, telefono: telefono || undefined, tipo: "NATURAL" } });
      onCliente(c);
      setCreando(false);
      setNombre(""); setRuc(""); setTelefono("");
      avisar("ok", "Cliente creado.");
    } catch (e) {
      avisar("error", e instanceof ApiError ? e.message : "No se pudo crear el cliente.");
    }
  };

  return (
    <div className="relative">
      <Label_>Cliente</Label_>
      {cliente ? (
        <div className="flex items-center justify-between rounded-md border border-border bg-white px-2.5 py-1.5 text-sm">
          <span className="truncate font-medium">{cliente.nombre}</span>
          <button className="text-xs text-danger hover:underline" onClick={() => onCliente(null)}>quitar</button>
        </div>
      ) : (
        <>
          <Input placeholder="Consumidor Final (escriba para buscar o crear)" value={q} onChange={(e) => setQ(e.target.value)} />
          {(opciones.length > 0 || q.trim()) && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-lg">
              {opciones.map((c) => (
                <button key={c.id} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-page" onClick={() => { onCliente(c); setQ(""); setOpciones([]); }}>
                  {c.nombre} {c.tipo === "CONSUMIDOR_FINAL" && <span className="text-xs text-muted">(consumidor final)</span>}
                </button>
              ))}
              {q.trim() && (
                <button className="block w-full border-t border-border px-3 py-1.5 text-left text-sm text-primary hover:bg-page" onClick={() => { setNombre(q); setCreando(true); }}>
                  + Crear cliente “{q}”
                </button>
              )}
            </div>
          )}
        </>
      )}

      <Dialogo abierto={creando} onCerrar={() => setCreando(false)} titulo="Cliente nuevo (alta rápida)">
        <div className="space-y-3">
          <Campo etiqueta="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus /></Campo>
          <Campo etiqueta="RUC / Cédula (opcional)"><Input value={ruc} onChange={(e) => setRuc(e.target.value)} /></Campo>
          <Campo etiqueta="Teléfono (opcional)"><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></Campo>
          <Button className="w-full" onClick={() => void crear()} disabled={!nombre.trim()}>Crear y seleccionar</Button>
        </div>
      </Dialogo>
    </div>
  );
}

function Label_({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-xs font-medium text-muted">{children}</span>;
}

/**
 * Precio unitario editable: texto local mientras se escribe, se confirma (y se traduce a
 * descuento) al salir del campo. El padre lo remonta con una `key` cuando cantidad/descuento
 * cambian por una causa externa (preset, edición de cantidad) — "resetear estado con key",
 * en vez de sincronizar con un efecto.
 */
function InputPrecio({ valor, onCommit }: { valor: number; onCommit: (n: number) => void }) {
  const [texto, setTexto] = useState(() => valor.toFixed(2));

  return (
    <Input
      className="text-right"
      inputMode="decimal"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => onCommit(Number(texto.replace(",", ".")))}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
