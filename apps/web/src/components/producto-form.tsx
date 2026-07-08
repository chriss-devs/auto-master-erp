"use client";

/** Formulario de producto: EAV por categoría (D-003), códigos múltiples (RN-021),
 *  ITBMS por producto (RN-024/042), venta fraccionada (D-027), stock inicial. */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useSesion } from "@/lib/session";
import { Badge, Button, Campo, Card, Dialogo, Input, Label, Select, useToast } from "@/components/ui";

interface AtributoDef {
  id: string;
  clave: string;
  nombre: string;
  tipo: "TEXTO" | "NUMERO" | "BOOLEANO" | "LISTA";
  unidad?: string | null;
  opciones: string[];
  requerido: boolean;
}
interface Categoria {
  id: string;
  nombre: string;
  padreId: string | null;
  atributos: AtributoDef[];
}
interface Aux {
  categorias: Categoria[];
  marcas: Array<{ id: string; nombre: string }>;
  unidades: Array<{ id: string; codigo: string; nombre: string; permiteDecimales: boolean }>;
}

export interface ProductoExistente {
  id: string;
  sku: string;
  nombre: string;
  descripcion?: string | null;
  tipo: string;
  estado: string;
  categoriaId?: string | null;
  marcaId?: string | null;
  unidadMedidaId: string;
  precioBase: string;
  tasaItbms: string;
  ventaFraccionada: boolean;
  stockMinimo: string;
  codigos: Array<{ tipo: string; valor: string }>;
  atributos: Array<{ atributoDefId: string; valorTexto?: string | null; valorNumero?: string | null; valorBool?: boolean | null }>;
}

const TASAS = [
  { v: "0.07", t: "7% (general)" },
  { v: "0", t: "0% (exento)" },
  { v: "0.10", t: "10%" },
  { v: "0.15", t: "15%" },
];
const TIPOS_CODIGO = ["BARRA", "OEM", "PARTE", "PROVEEDOR", "OTRO"];

export function ProductoForm({ existente }: { existente?: ProductoExistente }) {
  const router = useRouter();
  const { me, puede } = useSesion();
  const { avisar } = useToast();
  const [aux, setAux] = useState<Aux | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [sku, setSku] = useState(existente?.sku ?? "");
  const [nombre, setNombre] = useState(existente?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(existente?.descripcion ?? "");
  const [categoriaId, setCategoriaId] = useState(existente?.categoriaId ?? "");
  const [marcaId, setMarcaId] = useState(existente?.marcaId ?? "");
  const [unidadMedidaId, setUnidadMedidaId] = useState(existente?.unidadMedidaId ?? "");
  const [precioBase, setPrecioBase] = useState(existente?.precioBase ?? "");
  const [tasaItbms, setTasaItbms] = useState(existente?.tasaItbms ?? "0.07");
  const [ventaFraccionada, setVentaFraccionada] = useState(existente?.ventaFraccionada ?? false);
  const [stockMinimo, setStockMinimo] = useState(existente?.stockMinimo ?? "0");
  const [codigos, setCodigos] = useState<Array<{ tipo: string; valor: string }>>(
    existente?.codigos.filter((c) => c.tipo !== "INTERNO") ?? [],
  );
  const [valores, setValores] = useState<Record<string, string | boolean>>(() => {
    const v: Record<string, string | boolean> = {};
    for (const a of existente?.atributos ?? []) {
      v[a.atributoDefId] = a.valorBool ?? a.valorNumero ?? a.valorTexto ?? "";
    }
    return v;
  });
  const [stockInicial, setStockInicial] = useState<Record<string, { cantidad: string; costo: string }>>({});

  const cargarAux = useCallback((): Promise<Aux | null> => {
    return Promise.all([
      api<Categoria[]>("/categorias"),
      api<Aux["marcas"]>("/marcas"),
      api<Aux["unidades"]>("/unidades"),
    ])
      .then(([categorias, marcas, unidades]) => {
        const a: Aux = { categorias, marcas, unidades };
        setAux(a);
        return a;
      })
      .catch(() => {
        avisar("error", "No se pudo cargar el catálogo auxiliar.");
        return null;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void cargarAux();
  }, [cargarAux]);

  // Alta rápida de categoría y marca sin salir del formulario
  const [nuevaCat, setNuevaCat] = useState<{ nombre: string; tipo: string; padreId: string } | null>(null);
  const [nuevaMarca, setNuevaMarca] = useState<string | null>(null);

  const crearCategoria = async () => {
    if (!nuevaCat?.nombre.trim()) return;
    try {
      const c = await api<{ id: string }>("/categorias", {
        cuerpo: { nombre: nuevaCat.nombre.trim(), tipo: nuevaCat.tipo, ...(nuevaCat.padreId ? { padreId: nuevaCat.padreId } : {}) },
      });
      await cargarAux();
      setCategoriaId(c.id);
      setNuevaCat(null);
      avisar("ok", "Categoría creada. Puede definirle atributos en el propio formulario cuando los necesite.");
    } catch (e) {
      avisar("error", e instanceof ApiError ? e.message : "No se pudo crear la categoría.");
    }
  };

  const crearMarca = async () => {
    if (!nuevaMarca?.trim()) return;
    try {
      const m = await api<{ id: string }>("/marcas", { cuerpo: { nombre: nuevaMarca.trim() } });
      await cargarAux();
      setMarcaId(m.id);
      setNuevaMarca(null);
      avisar("ok", "Marca creada.");
    } catch (e) {
      avisar("error", e instanceof ApiError ? e.message : "No se pudo crear la marca.");
    }
  };

  const categoria = useMemo(() => aux?.categorias.find((c) => c.id === categoriaId), [aux, categoriaId]);
  // Unidad efectiva: la elegida, o UND por defecto al crear (derivada, sin setState en effect)
  const unidadEfectiva = unidadMedidaId || aux?.unidades.find((u) => u.codigo === "UND")?.id || aux?.unidades[0]?.id || "";

  const guardar = async () => {
    setOcupado(true);
    try {
      const atributos = (categoria?.atributos ?? [])
        .map((def) => {
          const v = valores[def.id];
          if (v === undefined || v === "") return null;
          return { atributoDefId: def.id, valor: def.tipo === "NUMERO" ? Number(v) : def.tipo === "BOOLEANO" ? v === true || v === "true" : v };
        })
        .filter(Boolean);

      const cuerpo = {
        nombre: nombre.trim(),
        descripcion: descripcion || undefined,
        categoriaId: categoriaId || undefined,
        marcaId: marcaId || undefined,
        unidadMedidaId: unidadEfectiva,
        precioBase: Number(precioBase).toFixed(2),
        tasaItbms,
        ventaFraccionada,
        stockMinimo: stockMinimo || "0",
        codigos: codigos.filter((c) => c.valor.trim()),
        atributos,
      };

      if (existente) {
        await api(`/productos/${existente.id}`, { metodo: "PATCH", cuerpo });
        avisar("ok", "Producto actualizado.");
      } else {
        const stock = Object.entries(stockInicial)
          .filter(([, v]) => Number(v.cantidad) > 0)
          .map(([sucursalId, v]) => ({ sucursalId, cantidad: v.cantidad, costoUnitario: Number(v.costo || 0).toFixed(4) }));
        const creado = await api<{ id: string }>("/productos", {
          cuerpo: { ...cuerpo, sku: sku.trim(), ...(stock.length ? { stockInicial: stock } : {}) },
        });
        avisar("ok", "Producto creado.");
        router.replace(`/productos/${creado.id}`);
        return;
      }
      router.refresh();
    } catch (e) {
      avisar("error", e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  };

  const cambiarEstado = async () => {
    if (!existente) return;
    const nuevo = existente.estado === "ACTIVO" ? "DESCONTINUADO" : "ACTIVO";
    try {
      await api(`/productos/${existente.id}`, { metodo: "PATCH", cuerpo: { estado: nuevo } });
      avisar("ok", nuevo === "DESCONTINUADO" ? "Producto descontinuado (RN-023: no se borra)." : "Producto reactivado.");
      window.location.reload();
    } catch (e) {
      avisar("error", e instanceof ApiError ? e.message : "No se pudo cambiar el estado.");
    }
  };

  if (!aux) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Card titulo="Datos generales">
          <div className="grid gap-3 md:grid-cols-2">
            <Campo etiqueta="Código interno / SKU (D-028 — inmutable)">
              <Input value={sku} onChange={(e) => setSku(e.target.value)} disabled={!!existente} placeholder="FER-0009 / AUT-0007" required />
            </Campo>
            <Campo etiqueta="Nombre">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </Campo>
            <div>
              <div className="flex items-center justify-between">
                <Label>Categoría (define los atributos)</Label>
                {puede("productos:crear") && (
                  <button type="button" className="mb-1 text-xs text-primary hover:underline"
                    onClick={() => setNuevaCat({ nombre: "", tipo: "GENERAL", padreId: "" })}>
                    + nueva
                  </button>
                )}
              </div>
              <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">— Sin categoría —</option>
                {aux.categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.padreId ? "· " : ""}{c.nombre}</option>
                ))}
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Marca</Label>
                {puede("productos:crear") && (
                  <button type="button" className="mb-1 text-xs text-primary hover:underline" onClick={() => setNuevaMarca("")}>
                    + nueva
                  </button>
                )}
              </div>
              <Select value={marcaId} onChange={(e) => setMarcaId(e.target.value)}>
                <option value="">— Sin marca —</option>
                {aux.marcas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </Select>
            </div>
            <Campo etiqueta="Unidad de medida">
              <Select value={unidadEfectiva} onChange={(e) => setUnidadMedidaId(e.target.value)}>
                {aux.unidades.map((u) => <option key={u.id} value={u.id}>{u.codigo} — {u.nombre}</option>)}
              </Select>
            </Campo>
            <Campo etiqueta="Descripción">
              <Input value={descripcion ?? ""} onChange={(e) => setDescripcion(e.target.value)} />
            </Campo>
          </div>
        </Card>

        {categoria && categoria.atributos.length > 0 && (
          <Card titulo={`Atributos de ${categoria.nombre} (EAV — D-003)`}>
            <div className="grid gap-3 md:grid-cols-2">
              {categoria.atributos.map((def) => (
                <Campo key={def.id} etiqueta={`${def.nombre}${def.unidad ? ` (${def.unidad})` : ""}${def.requerido ? " *" : ""}`}>
                  {def.tipo === "LISTA" ? (
                    <Select value={String(valores[def.id] ?? "")} onChange={(e) => setValores((v) => ({ ...v, [def.id]: e.target.value }))}>
                      <option value="">—</option>
                      {def.opciones.map((o) => <option key={o} value={o}>{o}</option>)}
                    </Select>
                  ) : def.tipo === "BOOLEANO" ? (
                    <Select value={String(valores[def.id] ?? "")} onChange={(e) => setValores((v) => ({ ...v, [def.id]: e.target.value }))}>
                      <option value="">—</option>
                      <option value="true">Sí</option>
                      <option value="false">No</option>
                    </Select>
                  ) : (
                    <Input
                      inputMode={def.tipo === "NUMERO" ? "decimal" : undefined}
                      value={String(valores[def.id] ?? "")}
                      onChange={(e) => setValores((v) => ({ ...v, [def.id]: e.target.value }))}
                    />
                  )}
                </Campo>
              ))}
            </div>
          </Card>
        )}

        <Card titulo="Códigos adicionales (RN-021: barras, OEM, número de parte…)">
          <div className="space-y-2">
            {codigos.map((c, i) => (
              <div key={i} className="grid grid-cols-[140px_1fr_32px] gap-2">
                <Select value={c.tipo} onChange={(e) => setCodigos((cs) => cs.map((x, j) => (j === i ? { ...x, tipo: e.target.value } : x)))}>
                  {TIPOS_CODIGO.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
                <Input value={c.valor} onChange={(e) => setCodigos((cs) => cs.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} />
                <button className="text-danger" onClick={() => setCodigos((cs) => cs.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <Button variante="secondary" onClick={() => setCodigos((cs) => [...cs, { tipo: "BARRA", valor: "" }])}>+ código</Button>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card titulo="Precio e impuesto">
          <div className="space-y-3">
            <Campo etiqueta="Precio de venta (B/.)">
              <Input inputMode="decimal" value={precioBase} onChange={(e) => setPrecioBase(e.target.value)} required />
            </Campo>
            <Campo etiqueta="ITBMS (RN-024/042)">
              <Select value={tasaItbms} onChange={(e) => setTasaItbms(e.target.value)}>
                {TASAS.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
              </Select>
            </Campo>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={ventaFraccionada} onChange={(e) => setVentaFraccionada(e.target.checked)} />
              Venta fraccionada / decimales (D-027)
            </label>
            <Campo etiqueta="Stock mínimo (alerta)">
              <Input inputMode="decimal" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} />
            </Campo>
          </div>
        </Card>

        {!existente && (
          <Card titulo="Stock inicial por sucursal (opcional)">
            <div className="space-y-2">
              {(me?.sucursales ?? []).map((s) => (
                <div key={s.id} className="grid grid-cols-[70px_1fr_1fr] items-center gap-2 text-sm">
                  <span className="font-medium">{s.codigo}</span>
                  <Input inputMode="decimal" placeholder="Cantidad" value={stockInicial[s.id]?.cantidad ?? ""} onChange={(e) => setStockInicial((x) => ({ ...x, [s.id]: { cantidad: e.target.value, costo: x[s.id]?.costo ?? "" } }))} />
                  <Input inputMode="decimal" placeholder="Costo unit." value={stockInicial[s.id]?.costo ?? ""} onChange={(e) => setStockInicial((x) => ({ ...x, [s.id]: { cantidad: x[s.id]?.cantidad ?? "", costo: e.target.value } }))} />
                </div>
              ))}
              <p className="text-xs text-muted">Genera movimiento ENTRADA_INICIAL inmutable (RN-005/006).</p>
            </div>
          </Card>
        )}

        <div className="space-y-2">
          <Button className="w-full" onClick={() => void guardar()} disabled={ocupado || !nombre.trim() || !precioBase || (!existente && !sku.trim())}>
            {ocupado ? "Guardando…" : existente ? "Guardar cambios" : "Crear producto"}
          </Button>
          {existente && puede("productos:descontinuar") && (
            <Button variante={existente.estado === "ACTIVO" ? "danger" : "success"} className="w-full" onClick={() => void cambiarEstado()}>
              {existente.estado === "ACTIVO" ? "Descontinuar (RN-023)" : "Reactivar"}
            </Button>
          )}
          {existente && (
            <p className="text-center text-xs text-muted">
              Estado: {existente.estado === "ACTIVO" ? <Badge tono="verde">Activo</Badge> : <Badge tono="rojo">Descontinuado</Badge>}
            </p>
          )}
        </div>
      </div>

      {nuevaCat && (
        <Dialogo abierto onCerrar={() => setNuevaCat(null)} titulo="Categoría nueva">
          <div className="space-y-3">
            <Campo etiqueta="Nombre">
              <Input autoFocus value={nuevaCat.nombre} onChange={(e) => setNuevaCat({ ...nuevaCat, nombre: e.target.value })} />
            </Campo>
            <Campo etiqueta="Tipo / área (RN-020)">
              <Select value={nuevaCat.tipo} onChange={(e) => setNuevaCat({ ...nuevaCat, tipo: e.target.value })}>
                <option value="FERRETERIA">Ferretería</option>
                <option value="AUTOPARTE">Autoparte</option>
                <option value="GENERAL">General</option>
              </Select>
            </Campo>
            <Campo etiqueta="Categoría padre (opcional)">
              <Select value={nuevaCat.padreId} onChange={(e) => setNuevaCat({ ...nuevaCat, padreId: e.target.value })}>
                <option value="">— Raíz —</option>
                {aux.categorias.filter((c) => !c.padreId).map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </Select>
            </Campo>
            <Button className="w-full" onClick={() => void crearCategoria()} disabled={!nuevaCat.nombre.trim()}>
              Crear y seleccionar
            </Button>
          </div>
        </Dialogo>
      )}

      {nuevaMarca !== null && (
        <Dialogo abierto onCerrar={() => setNuevaMarca(null)} titulo="Marca nueva">
          <div className="space-y-3">
            <Campo etiqueta="Nombre de la marca">
              <Input autoFocus value={nuevaMarca} onChange={(e) => setNuevaMarca(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void crearMarca(); }} />
            </Campo>
            <Button className="w-full" onClick={() => void crearMarca()} disabled={!nuevaMarca.trim()}>
              Crear y seleccionar
            </Button>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
