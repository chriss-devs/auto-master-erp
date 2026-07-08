"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Badge, Button, Card, Spinner, useToast } from "@/components/ui";

interface Rol {
  id: string;
  codigo: string;
  nombre: string;
  esSistema: boolean;
  usuarios: number;
  permisos: string[];
}
interface Permiso {
  codigo: string;
  descripcion: string;
}

export default function RolesPage() {
  const { avisar } = useToast();
  const [roles, setRoles] = useState<Rol[] | null>(null);
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(() => {
    api<Rol[]>("/roles").then((r) => {
      setRoles(r);
      setSel((s) => {
        const id = s ?? r[0]?.id ?? null;
        const rolSel = r.find((x) => x.id === id);
        if (rolSel) setMarcados(new Set(rolSel.permisos));
        return id;
      });
    }).catch(() => setRoles([]));
    api<Permiso[]>("/permisos").then(setPermisos).catch(() => {});
  }, []);

  useEffect(cargar, [cargar]);

  const rol = roles?.find((r) => r.id === sel) ?? null;
  const seleccionar = (r: Rol) => {
    setSel(r.id);
    setMarcados(new Set(r.permisos));
  };

  const grupos = useMemo(() => {
    const g = new Map<string, Permiso[]>();
    for (const p of permisos) {
      const rec = p.codigo.split(":")[0];
      g.set(rec, [...(g.get(rec) ?? []), p]);
    }
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permisos]);

  const guardar = async () => {
    if (!rol) return;
    setOcupado(true);
    try {
      await api(`/roles/${rol.id}`, { metodo: "PATCH", cuerpo: { permisos: [...marcados] } });
      avisar("ok", `Permisos de ${rol.nombre} actualizados (auditado).`);
      cargar();
    } catch (e) {
      avisar("error", e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  };

  if (!roles) return <Spinner />;

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">Roles y permisos (RBAC — 09 §3)</h1>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card titulo="Roles">
          <ul className="space-y-1">
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => seleccionar(r)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${sel === r.id ? "bg-primary-light font-semibold text-primary-dark" : "hover:bg-page"}`}
                >
                  {r.nombre}
                  <span className="text-xs text-muted">{r.usuarios} usr</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          titulo={rol ? `Permisos de ${rol.nombre}` : "Permisos"}
          accion={
            rol && rol.codigo !== "admin_general" ? (
              <Button onClick={() => void guardar()} disabled={ocupado}>Guardar cambios</Button>
            ) : rol ? (
              <Badge tono="azul">rol total — no editable</Badge>
            ) : null
          }
        >
          {!rol ? null : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {grupos.map(([recurso, ps]) => (
                <div key={recurso} className="rounded border border-border p-2">
                  <h4 className="mb-1 text-xs font-bold uppercase text-muted">{recurso}</h4>
                  {ps.map((p) => (
                    <label key={p.codigo} className="flex items-center gap-2 py-0.5 text-sm" title={p.descripcion}>
                      <input
                        type="checkbox"
                        disabled={rol.codigo === "admin_general"}
                        checked={marcados.has(p.codigo)}
                        onChange={() => {
                          const c = new Set(marcados);
                          if (c.has(p.codigo)) c.delete(p.codigo);
                          else c.add(p.codigo);
                          setMarcados(c);
                        }}
                      />
                      {p.codigo.split(":")[1]}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
