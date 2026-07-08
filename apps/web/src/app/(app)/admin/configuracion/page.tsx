"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button, Campo, Card, Input, Spinner, useToast } from "@/components/ui";

interface Config {
  empresa: { nombre: string; razonSocial?: string | null; ruc?: string | null; dv?: string | null; direccion?: string | null; telefono?: string | null } | null;
  valores: Record<string, unknown>;
}

const EDITABLES: Array<{ clave: string; etiqueta: string; tipo: "numero" | "texto" }> = [
  { clave: "descuento_max_pct_sin_autorizacion", etiqueta: "Descuento máx. sin autorización (%) — RN-160", tipo: "numero" },
  { clave: "factura_papel", etiqueta: "Papel de impresión de factura (CARTA)", tipo: "texto" },
  { clave: "moneda_simbolo", etiqueta: "Símbolo de moneda", tipo: "texto" },
];

export default function ConfiguracionPage() {
  const { avisar } = useToast();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api<Config>("/configuracion")
      .then((c) => {
        setCfg(c);
        setValores(Object.fromEntries(EDITABLES.map((e) => [e.clave, String(c.valores[e.clave] ?? "")])));
      })
      .catch(() => setCfg({ empresa: null, valores: {} }));
  }, []);

  const guardar = async () => {
    setOcupado(true);
    try {
      const cuerpo: Record<string, unknown> = {};
      for (const e of EDITABLES) {
        cuerpo[e.clave] = e.tipo === "numero" ? Number(valores[e.clave] || 0) : valores[e.clave];
      }
      await api("/configuracion", { metodo: "PATCH", cuerpo: { valores: cuerpo } });
      avisar("ok", "Configuración guardada (auditada).");
    } catch (e) {
      avisar("error", e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  };

  if (!cfg) return <Spinner />;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-lg font-bold">Configuración</h1>

      <Card titulo="Empresa (datos fiscales del emisor)">
        {cfg.empresa ? (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">Nombre</dt><dd>{cfg.empresa.nombre}</dd>
            <dt className="text-muted">Razón social</dt><dd>{cfg.empresa.razonSocial ?? "—"}</dd>
            <dt className="text-muted">RUC / DV</dt><dd>{cfg.empresa.ruc ?? "—"} {cfg.empresa.dv ? `DV ${cfg.empresa.dv}` : ""}</dd>
            <dt className="text-muted">Dirección</dt><dd>{cfg.empresa.direccion ?? "—"}</dd>
            <dt className="text-muted">Teléfono</dt><dd>{cfg.empresa.telefono ?? "—"}</dd>
          </dl>
        ) : (
          <p className="text-sm text-muted">Sin datos.</p>
        )}
        <p className="mt-2 text-xs text-muted">Los datos definitivos (RUC real, logo, hex de marca) se actualizarán cuando el cliente los entregue (Q-044).</p>
      </Card>

      <Card titulo="Parámetros">
        <div className="space-y-3">
          {EDITABLES.map((e) => (
            <Campo key={e.clave} etiqueta={e.etiqueta}>
              <Input
                inputMode={e.tipo === "numero" ? "decimal" : undefined}
                value={valores[e.clave] ?? ""}
                onChange={(ev) => setValores((v) => ({ ...v, [e.clave]: ev.target.value }))}
              />
            </Campo>
          ))}
          <Button onClick={() => void guardar()} disabled={ocupado}>Guardar</Button>
        </div>
      </Card>

      <Card titulo="Otras claves (solo lectura)">
        <pre className="overflow-x-auto rounded bg-page p-3 text-xs">{JSON.stringify(cfg.valores, null, 2)}</pre>
      </Card>
    </div>
  );
}
