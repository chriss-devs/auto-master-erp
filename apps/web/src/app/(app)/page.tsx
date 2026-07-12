"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Paginador, usePaginacion } from "@/components/paginacion";
import { fmtFecha, fmtMoney, fmtQty } from "@/lib/format";
import { useSesion } from "@/lib/session";
import { Badge, Card, Spinner, Tabla, Td, Th, Vacio, cx } from "@/components/ui";

interface FilaStockBajo {
  producto: { id: string; sku: string; nombre: string; stockMinimo: string };
  stocks: Array<{ sucursal: { id: string }; cantidad: string }>;
}

interface Resumen {
  hoy: {
    ventas: number;
    total: string;
    itbms: string;
    ticketPromedio: string;
    utilidadBruta: string;
    margenPct: string | null;
    vsAyer: { ventas: number; total: string; cambioPct: string | null };
    pagosPorMetodo: Array<{ metodo: string; monto: string; pagos: number }>;
  };
  caja: {
    abierta: boolean;
    desde: string | null;
    efectivoEnCaja: string | null;
    ventasTurno: number;
    ultimoCierre: { fecha: string; descuadre: string } | null;
  };
  porCobrar: { ventas: number; monto: string; masAntigua: string | null };
  inventario: {
    valorizado: string;
    itemsConStock: number;
    stockBajo: Array<{ id: string; sku: string; nombre: string; cantidad: string; stockMinimo: string }>;
  };
  facturasPendientesTransmision: number;
  topProductos7d: Array<{ productoId: string; descripcion: string; unidades: string; importe: string; utilidad: string }>;
  serie7d: Array<{ dia: string; total: string; ventas: string }>;
}

const METODO_LABEL: Record<string, string> = { EFECTIVO: "Efectivo", TARJETA: "Tarjeta", YAPPY: "Yappy", ACH: "ACH/Transf." };

function minutosDesde(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

export default function DashboardPage() {
  const { sucursalId, sucursal } = useSesion();
  const [datos, setDatos] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sucursalId) return;
    let vigente = true;
    api<Resumen>("/dashboard", { sucursalId })
      .then((r) => vigente && setDatos(r))
      .catch((e) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [sucursalId]);

  // Lista completa de "bajo mínimo" (paginada), en vez del top 8 recortado del resumen del dashboard
  const pagBajo = usePaginacion<FilaStockBajo>(
    `/inventario/stock?bajo_minimo=true${sucursalId ? `&sucursal=${sucursalId}` : ""}`,
    sucursalId,
    8,
  );

  if (error) return <Vacio texto={`No se pudo cargar el dashboard: ${error}`} />;
  if (!datos) return <Spinner />;

  const maxSerie = Math.max(1, ...datos.serie7d.map((d) => Number(d.total)));
  const cambio = datos.hoy.vsAyer.cambioPct !== null ? Number(datos.hoy.vsAyer.cambioPct) : null;
  const esperaMin = minutosDesde(datos.porCobrar.masAntigua);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Dashboard — {sucursal?.nombre}</h1>

      {/* Fila 1: lo vendido y lo ganado hoy */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card titulo="Ventas de hoy">
          <div className="text-2xl font-bold text-primary">{fmtMoney(datos.hoy.total)}</div>
          <div className="text-xs text-muted">{datos.hoy.ventas} venta(s) · ticket {fmtMoney(datos.hoy.ticketPromedio)}</div>
          {cambio !== null ? (
            <div className={cx("mt-1 text-xs font-semibold", cambio >= 0 ? "text-success" : "text-danger")}>
              {cambio >= 0 ? "▲" : "▼"} {Math.abs(cambio)}% vs ayer ({fmtMoney(datos.hoy.vsAyer.total)})
            </div>
          ) : (
            <div className="mt-1 text-xs text-muted">Ayer: {fmtMoney(datos.hoy.vsAyer.total)} ({datos.hoy.vsAyer.ventas})</div>
          )}
        </Card>

        <Card titulo="Utilidad bruta de hoy">
          <div className="text-2xl font-bold text-success">{fmtMoney(datos.hoy.utilidadBruta)}</div>
          <div className="text-xs text-muted">
            {datos.hoy.margenPct !== null ? `margen ${datos.hoy.margenPct}% sobre la base` : "sin ventas aún"} · ITBMS {fmtMoney(datos.hoy.itbms)}
          </div>
        </Card>

        <Card titulo="Cobros de hoy por método">
          {datos.hoy.pagosPorMetodo.length === 0 ? (
            <div className="text-sm text-muted">Sin cobros todavía.</div>
          ) : (
            <ul className="space-y-0.5 text-sm">
              {datos.hoy.pagosPorMetodo.map((p) => (
                <li key={p.metodo} className="flex justify-between">
                  <span className="text-muted">{METODO_LABEL[p.metodo] ?? p.metodo}</span>
                  <span className="font-medium">{fmtMoney(p.monto)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card titulo="Últimos 7 días">
          <div className="flex h-14 items-end gap-1">
            {datos.serie7d.length === 0 && <span className="text-xs text-muted">Sin ventas aún</span>}
            {datos.serie7d.map((d) => (
              <div key={d.dia} className="flex flex-1 flex-col items-center gap-0.5" title={`${d.dia}: ${fmtMoney(d.total)} (${d.ventas} ventas)`}>
                <div className="w-full rounded-t bg-primary/70" style={{ height: `${Math.max(6, (Number(d.total) / maxSerie) * 44)}px` }} />
                <span className="text-[9px] text-muted">{d.dia.slice(8)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Fila 2: operación que requiere acción AHORA */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card
          titulo="Caja"
          accion={<Link href="/caja" className="text-xs text-primary hover:underline">ir a caja →</Link>}
        >
          {datos.caja.abierta ? (
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <Badge tono="verde">Abierta</Badge>
                <span className="text-xs text-muted">desde {fmtFecha(datos.caja.desde)}</span>
              </div>
              <div className="flex justify-between"><span className="text-muted">Efectivo en caja</span><span className="text-lg font-bold">{fmtMoney(datos.caja.efectivoEnCaja)}</span></div>
              <div className="flex justify-between text-xs text-muted"><span>Ventas del turno</span><span>{datos.caja.ventasTurno}</span></div>
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <Badge tono="ambar">Cerrada</Badge>
              <p className="text-xs text-muted">Sin caja abierta no se puede cobrar (RN-123).</p>
            </div>
          )}
          {datos.caja.ultimoCierre && (
            <div className={cx("mt-2 rounded px-2 py-1 text-xs", Number(datos.caja.ultimoCierre.descuadre) === 0 ? "bg-success-bg text-success" : "bg-red-50 text-danger")}>
              Último cierre ({fmtFecha(datos.caja.ultimoCierre.fecha, false)}): {Number(datos.caja.ultimoCierre.descuadre) === 0 ? "cuadre perfecto" : `descuadre ${fmtMoney(datos.caja.ultimoCierre.descuadre)}`}
            </div>
          )}
        </Card>

        <Card
          titulo="Por cobrar en caja (ventas en preparación)"
          accion={<Link href="/caja" className="text-xs text-primary hover:underline">cobrar →</Link>}
        >
          {datos.porCobrar.ventas === 0 ? (
            <div className="text-sm text-muted">Nada pendiente — ventanilla al día ✔</div>
          ) : (
            <div className="space-y-1 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-primary">{datos.porCobrar.ventas}</span>
                <span className="text-lg font-semibold">{fmtMoney(datos.porCobrar.monto)}</span>
              </div>
              {esperaMin !== null && (
                <div className={cx("text-xs", esperaMin > 30 ? "font-semibold text-danger" : "text-muted")}>
                  La más antigua espera hace {esperaMin >= 60 ? `${Math.floor(esperaMin / 60)} h ${esperaMin % 60} min` : `${esperaMin} min`}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card titulo="Pendientes e inventario">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <Link href="/facturas?estado=PENDIENTE_TRANSMISION" className="text-primary hover:underline">Facturas por transmitir (contingencia)</Link>
              <Badge tono={datos.facturasPendientesTransmision > 0 ? "ambar" : "gris"}>{datos.facturasPendientesTransmision}</Badge>
            </li>
            <li className="flex items-center justify-between">
              <Link href="/inventario?bajo=1" className="text-primary hover:underline">Productos bajo mínimo</Link>
              <Badge tono={(pagBajo.filas?.length ?? datos.inventario.stockBajo.length) > 0 ? "rojo" : "gris"}>
                {pagBajo.filas?.length ?? datos.inventario.stockBajo.length}
              </Badge>
            </li>
            <li className="flex items-center justify-between text-muted">
              <span>Inventario valorizado (costo)</span>
              <span className="font-medium text-ink">{fmtMoney(datos.inventario.valorizado)}</span>
            </li>
          </ul>
        </Card>
      </div>

      {/* Fila 3: detalle accionable */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card titulo="Stock bajo mínimo — reponer">
          {!pagBajo.filas ? (
            <Spinner />
          ) : pagBajo.filas.length === 0 ? (
            <Vacio texto="Sin alertas de stock." />
          ) : (
            <>
              <div className="max-h-64 overflow-y-auto">
                <Tabla>
                  <thead>
                    <tr><Th>Código</Th><Th>Producto</Th><Th className="text-right">Stock</Th><Th className="text-right">Mínimo</Th></tr>
                  </thead>
                  <tbody>
                    {pagBajo.filas.map((f) => {
                      const cantidad = f.stocks.find((s) => s.sucursal.id === sucursalId)?.cantidad ?? "0";
                      return (
                        <tr key={f.producto.id}>
                          <Td className="font-mono text-xs">{f.producto.sku}</Td>
                          <Td><Link className="text-primary hover:underline" href={`/productos/${f.producto.id}`}>{f.producto.nombre}</Link></Td>
                          <Td className="text-right font-semibold text-danger">{fmtQty(cantidad)}</Td>
                          <Td className="text-right text-muted">{fmtQty(f.producto.stockMinimo)}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Tabla>
              </div>
              <div className="mt-2">
                <Paginador p={pagBajo} nombre="producto(s) bajo mínimo" />
              </div>
            </>
          )}
        </Card>

        <Card titulo="Más vendidos (7 días) — con utilidad">
          {datos.topProductos7d.length === 0 ? (
            <Vacio texto="Aún no hay ventas registradas." />
          ) : (
            <Tabla>
              <thead>
                <tr><Th>Producto</Th><Th className="text-right">Unid.</Th><Th className="text-right">Vendido</Th><Th className="text-right">Utilidad</Th></tr>
              </thead>
              <tbody>
                {datos.topProductos7d.map((t) => (
                  <tr key={t.productoId}>
                    <Td>{t.descripcion}</Td>
                    <Td className="text-right">{fmtQty(t.unidades)}</Td>
                    <Td className="text-right font-medium">{fmtMoney(t.importe)}</Td>
                    <Td className="text-right font-medium text-success">{fmtMoney(t.utilidad)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Card>
      </div>
    </div>
  );
}
