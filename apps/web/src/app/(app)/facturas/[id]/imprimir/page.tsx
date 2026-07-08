"use client";

/** Representación impresa de la factura — tamaño carta (Q-023/BL-009). */
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtFecha, fmtMoney, fmtQty, pct } from "@/lib/format";
import { Button, Spinner, Vacio } from "@/components/ui";

interface Impresion {
  id: string;
  numero: string;
  estado: string;
  cufe?: string | null;
  emitidaEn?: string | null;
  contingencia: boolean;
  snapshot: {
    emisor: { nombre: string; ruc?: string | null; dv?: string | null; direccion?: string | null };
    receptor: { nombre: string; rucOCedula?: string | null; dv?: string | null; tipo: string };
    sucursal: { codigo: string; nombre: string; direccion?: string | null; telefono?: string | null };
    lineas: Array<{ descripcion: string; cantidad: string; precioUnitario: string; descuento: string; baseGravable: string; tasaItbms: string; itbms: string; total: string }>;
    totales: { subtotal: string; descuentoTotal: string; itbmsTotal: string; total: string };
    pagos: Array<{ metodo: string; monto: string; referencia?: string | null }>;
    ventaNumero?: string | null;
    fechaEmision: string;
    puntoEmision: string;
  };
}

export default function ImprimirFacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [f, setF] = useState<Impresion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Impresion>(`/facturas/${id}/impresion`).then(setF).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <Vacio texto={error} />;
  if (!f) return <Spinner />;
  const s = f.snapshot;

  return (
    <div className="mx-auto max-w-[8.5in] bg-white p-[0.6in] text-[13px] leading-snug text-black print:p-0">
      <div className="no-print mb-4 flex justify-end gap-2">
        <Button onClick={() => window.print()}>Imprimir (carta)</Button>
      </div>

      {f.contingencia && (
        <div className="mb-3 border-2 border-amber-500 bg-amber-50 p-2 text-center text-xs font-semibold uppercase tracking-wide text-amber-800">
          Documento en contingencia — pendiente de transmisión a la DGI (RF-FAC-005)
        </div>
      )}

      <header className="mb-4 flex items-start justify-between border-b-2 border-blue-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-blue-800 text-lg font-black text-white">AM</div>
            <div>
              <h1 className="text-xl font-black text-blue-900">{s.emisor.nombre}</h1>
              <p className="text-xs text-gray-600">
                {s.emisor.ruc ? `RUC ${s.emisor.ruc}${s.emisor.dv ? ` DV ${s.emisor.dv}` : ""}` : ""}
              </p>
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-600">
            {s.sucursal.nombre} ({s.sucursal.codigo}) · {s.sucursal.direccion ?? ""} {s.sucursal.telefono ? `· Tel. ${s.sucursal.telefono}` : ""}
          </p>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-bold text-red-700">FACTURA</h2>
          <p className="font-mono text-sm font-semibold">{f.numero}</p>
          <p className="text-xs text-gray-600">Punto de emisión: {s.puntoEmision}</p>
          <p className="text-xs text-gray-600">{fmtFecha(s.fechaEmision)}</p>
          {s.ventaNumero && <p className="text-xs text-gray-600">Venta: {s.ventaNumero}</p>}
        </div>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-4 text-xs">
        <div>
          <h3 className="mb-1 font-bold uppercase text-gray-500">Cliente</h3>
          <p className="font-semibold">{s.receptor.nombre}</p>
          {s.receptor.rucOCedula && <p>RUC/Cédula: {s.receptor.rucOCedula}{s.receptor.dv ? ` DV ${s.receptor.dv}` : ""}</p>}
        </div>
        <div>
          <h3 className="mb-1 font-bold uppercase text-gray-500">CUFE</h3>
          <p className="break-all font-mono text-[10px]">{f.cufe ?? "Se asignará al transmitir"}</p>
        </div>
      </section>

      <table className="mb-4 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-gray-800 text-left">
            <th className="py-1 pr-2">Descripción</th>
            <th className="py-1 text-right">Cant.</th>
            <th className="py-1 text-right">Precio</th>
            <th className="py-1 text-right">Desc.</th>
            <th className="py-1 text-right">Base</th>
            <th className="py-1 text-right">ITBMS</th>
            <th className="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {s.lineas.map((l, i) => (
            <tr key={i} className="border-b border-gray-200">
              <td className="py-1 pr-2">{l.descripcion}</td>
              <td className="py-1 text-right">{fmtQty(l.cantidad)}</td>
              <td className="py-1 text-right">{fmtMoney(l.precioUnitario)}</td>
              <td className="py-1 text-right">{Number(l.descuento) > 0 ? fmtMoney(l.descuento) : "—"}</td>
              <td className="py-1 text-right">{fmtMoney(l.baseGravable)}</td>
              <td className="py-1 text-right">{fmtMoney(l.itbms)} <span className="text-gray-500">({pct(l.tasaItbms)})</span></td>
              <td className="py-1 text-right font-medium">{fmtMoney(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mb-6 flex justify-between">
        <div className="text-xs">
          <h3 className="mb-1 font-bold uppercase text-gray-500">Pagos</h3>
          {s.pagos.map((p, i) => (
            <p key={i}>{p.metodo}{p.referencia ? ` (${p.referencia})` : ""}: {fmtMoney(p.monto)}</p>
          ))}
        </div>
        <table className="text-sm">
          <tbody>
            <tr><td className="pr-6 text-gray-600">Subtotal</td><td className="text-right">{fmtMoney(s.totales.subtotal)}</td></tr>
            <tr><td className="pr-6 text-gray-600">Descuento</td><td className="text-right">−{fmtMoney(s.totales.descuentoTotal)}</td></tr>
            <tr><td className="pr-6 text-gray-600">ITBMS</td><td className="text-right">{fmtMoney(s.totales.itbmsTotal)}</td></tr>
            <tr className="border-t-2 border-gray-800 text-base font-black">
              <td className="pr-6 pt-1">TOTAL B/.</td><td className="pt-1 text-right">{fmtMoney(s.totales.total)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer className="border-t border-gray-300 pt-2 text-center text-[10px] text-gray-500">
        Representación impresa de la Factura Electrónica de Panamá (FEP). {f.contingencia ? "Emitida en contingencia; será transmitida al PAC/DGI." : ""}
        <br />Auto Master Colón — ferretería y autopartes. ¡Gracias por su compra!
      </footer>
    </div>
  );
}
