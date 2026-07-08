"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { fmtFecha } from "@/lib/format";
import { useSesion } from "@/lib/session";
import { Badge, Button, Campo, Dialogo, Input, Spinner, Tabla, Td, Th, useToast } from "@/components/ui";

interface Usuario {
  id: string;
  usuario: string;
  nombre: string;
  email?: string | null;
  activo: boolean;
  debeCambiarClave: boolean;
  ultimoLoginEn?: string | null;
  roles: Array<{ codigo: string; nombre: string }>;
  sucursales: Array<{ id: string; codigo: string; nombre: string }>;
}
interface Rol {
  id: string;
  codigo: string;
  nombre: string;
}

export default function UsuariosPage() {
  const [filas, setFilas] = useState<Usuario[] | null>(null);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [editando, setEditando] = useState<Usuario | "nuevo" | null>(null);

  const cargar = useCallback(() => {
    api<Usuario[]>("/usuarios").then(setFilas).catch(() => setFilas([]));
    api<Rol[]>("/roles").then(setRoles).catch(() => {});
  }, []);

  useEffect(cargar, [cargar]);

  if (!filas) return <Spinner />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Usuarios</h1>
        <Button onClick={() => setEditando("nuevo")}>+ Usuario</Button>
      </div>

      <Tabla>
        <thead>
          <tr><Th>Usuario</Th><Th>Nombre</Th><Th>Roles</Th><Th>Sucursales</Th><Th>Último acceso</Th><Th>Estado</Th><Th className="w-16"> </Th></tr>
        </thead>
        <tbody>
          {filas.map((u) => (
            <tr key={u.id} className="hover:bg-page">
              <Td className="font-mono text-xs">{u.usuario}</Td>
              <Td className="font-medium">{u.nombre}</Td>
              <Td className="text-xs">{u.roles.map((r) => r.nombre).join(", ")}</Td>
              <Td className="text-xs">{u.sucursales.map((s) => s.codigo).join(", ")}</Td>
              <Td className="text-xs text-muted">{fmtFecha(u.ultimoLoginEn)}</Td>
              <Td>
                {u.activo ? <Badge tono="verde">Activo</Badge> : <Badge tono="rojo">Inactivo</Badge>}
                {u.debeCambiarClave && <Badge tono="ambar" className="ml-1">clave temporal</Badge>}
              </Td>
              <Td><button className="text-primary hover:underline" onClick={() => setEditando(u)}>editar</button></Td>
            </tr>
          ))}
        </tbody>
      </Tabla>

      {editando && (
        <UsuarioDialog
          usuario={editando === "nuevo" ? null : editando}
          roles={roles}
          onCerrar={(rec) => {
            setEditando(null);
            if (rec) cargar();
          }}
        />
      )}
    </div>
  );
}

function UsuarioDialog({ usuario, roles, onCerrar }: { usuario: Usuario | null; roles: Rol[]; onCerrar: (rec: boolean) => void }) {
  const { me } = useSesion();
  const { avisar } = useToast();
  const [f, setF] = useState({
    usuario: usuario?.usuario ?? "",
    nombre: usuario?.nombre ?? "",
    email: usuario?.email ?? "",
    password: "",
    activo: usuario?.activo ?? true,
    roles: new Set(usuario?.roles.map((r) => r.codigo) ?? []),
    sucursales: new Set(usuario?.sucursales.map((s) => s.id) ?? []),
  });
  const [ocupado, setOcupado] = useState(false);

  const toggle = (set: Set<string>, v: string) => {
    const c = new Set(set);
    if (c.has(v)) c.delete(v);
    else c.add(v);
    return c;
  };

  const guardar = async () => {
    setOcupado(true);
    try {
      if (usuario) {
        await api(`/usuarios/${usuario.id}`, {
          metodo: "PATCH",
          cuerpo: {
            nombre: f.nombre.trim(),
            email: f.email || undefined,
            activo: f.activo,
            roles: [...f.roles],
            sucursales: [...f.sucursales],
            ...(f.password ? { nuevaPassword: f.password } : {}),
          },
        });
      } else {
        await api("/usuarios", {
          cuerpo: {
            usuario: f.usuario.trim(),
            nombre: f.nombre.trim(),
            email: f.email || undefined,
            password: f.password,
            roles: [...f.roles],
            sucursales: [...f.sucursales],
          },
        });
      }
      avisar("ok", "Usuario guardado (contraseña temporal: debe cambiarla al entrar).");
      onCerrar(true);
    } catch (e) {
      avisar("error", e instanceof ApiError ? e.message : "No se pudo guardar.");
      setOcupado(false);
    }
  };

  return (
    <Dialogo abierto onCerrar={() => onCerrar(false)} titulo={usuario ? `Editar ${usuario.usuario}` : "Usuario nuevo"}>
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Campo etiqueta="Usuario (login)">
            <Input value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} disabled={!!usuario} />
          </Campo>
          <Campo etiqueta="Nombre completo">
            <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          </Campo>
          <Campo etiqueta="Correo (opcional)">
            <Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Campo>
          <Campo etiqueta={usuario ? "Nueva contraseña (opcional, revoca sesiones)" : "Contraseña temporal"}>
            <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </Campo>
        </div>

        <Campo etiqueta="Roles (matriz 09 §3.3)">
          <div className="grid grid-cols-2 gap-1 rounded border border-border p-2 text-sm">
            {roles.map((r) => (
              <label key={r.codigo} className="flex items-center gap-2">
                <input type="checkbox" checked={f.roles.has(r.codigo)} onChange={() => setF({ ...f, roles: toggle(f.roles, r.codigo) })} />
                {r.nombre}
              </label>
            ))}
          </div>
        </Campo>

        <Campo etiqueta="Sucursales (alcance RN-181)">
          <div className="flex gap-4 rounded border border-border p-2 text-sm">
            {(me?.sucursales ?? []).map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <input type="checkbox" checked={f.sucursales.has(s.id)} onChange={() => setF({ ...f, sucursales: toggle(f.sucursales, s.id) })} />
                {s.codigo} — {s.nombre}
              </label>
            ))}
          </div>
        </Campo>

        {usuario && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />
            Activo (desactivar revoca sesiones — RN-183: no se borra)
          </label>
        )}

        <Button
          className="w-full"
          onClick={() => void guardar()}
          disabled={ocupado || !f.nombre.trim() || f.roles.size === 0 || f.sucursales.size === 0 || (!usuario && (!f.usuario.trim() || f.password.length < 8))}
        >
          Guardar
        </Button>
      </div>
    </Dialogo>
  );
}
