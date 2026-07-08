"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { SesionProvider, useSesion } from "@/lib/session";
import { Button, Campo, Dialogo, Input, Kbd, Select, Spinner, ToastProvider, useToast, cx } from "@/components/ui";

const NAV: Array<{ ruta: string; texto: string; permiso: string; tecla?: string }> = [
  { ruta: "/", texto: "Dashboard", permiso: "reportes:ver", tecla: "F1" },
  { ruta: "/vender", texto: "Vender", permiso: "ventas:crear", tecla: "F2" },
  { ruta: "/caja", texto: "Caja", permiso: "caja:operar", tecla: "F3" },
  { ruta: "/productos", texto: "Productos", permiso: "productos:ver", tecla: "F4" },
  { ruta: "/inventario", texto: "Inventario", permiso: "inventario:ver", tecla: "F6" },
  { ruta: "/clientes", texto: "Clientes", permiso: "clientes:ver" },
  { ruta: "/proveedores", texto: "Proveedores", permiso: "proveedores:ver" },
  { ruta: "/facturas", texto: "Facturas", permiso: "facturacion:ver" },
  { ruta: "/admin/usuarios", texto: "Usuarios", permiso: "admin:usuarios" },
  { ruta: "/admin/roles", texto: "Roles", permiso: "admin:roles" },
  { ruta: "/admin/auditoria", texto: "Auditoría", permiso: "auditoria:ver" },
  { ruta: "/admin/configuracion", texto: "Configuración", permiso: "admin:config" },
];

function CambiarClave({ forzado, onListo }: { forzado: boolean; onListo: () => void }) {
  const { avisar } = useToast();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nueva !== confirmar) return avisar("error", "La confirmación no coincide.");
    setOcupado(true);
    try {
      await api("/auth/cambiar-clave", { cuerpo: { actual, nueva } });
      avisar("ok", "Contraseña actualizada.");
      onListo();
    } catch (err) {
      avisar("error", err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Dialogo abierto onCerrar={onListo} titulo="Cambiar contraseña" forzado={forzado}>
      {forzado && <p className="mb-3 rounded bg-warning-bg px-3 py-2 text-sm text-warning">Su contraseña es temporal: debe cambiarla para continuar.</p>}
      <form onSubmit={guardar} className="space-y-3">
        <Campo etiqueta="Contraseña actual">
          <Input type="password" value={actual} onChange={(e) => setActual(e.target.value)} required />
        </Campo>
        <Campo etiqueta="Nueva contraseña (mín. 8 caracteres)">
          <Input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} minLength={8} required />
        </Campo>
        <Campo etiqueta="Confirmar nueva contraseña">
          <Input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required />
        </Campo>
        <Button type="submit" className="w-full" disabled={ocupado}>Guardar</Button>
      </form>
    </Dialogo>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { me, cargando, sucursalId, cambiarSucursal, puede, recargar } = useSesion();
  const router = useRouter();
  const pathname = usePathname();
  const [cambiandoClave, setCambiandoClave] = useState(false);

  // Atajos globales de teclado (11 §4.2, D-033)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const item = NAV.find((n) => n.tecla === e.key);
      if (item && puede(item.permiso)) {
        e.preventDefault();
        router.push(item.ruta);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [router, puede]);

  useEffect(() => {
    if (!cargando && !me) router.replace("/login");
  }, [cargando, me, router]);

  if (cargando || !me) return <Spinner texto="Cargando sesión…" />;

  const salir = async () => {
    try {
      await api("/auth/logout", { cuerpo: {} });
    } finally {
      window.location.href = "/login";
    }
  };

  return (
    <div className="flex min-h-screen">
      <aside className="no-print flex w-52 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-white">AM</div>
          <div className="leading-tight">
            <div className="text-sm font-bold">Auto Master</div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-accent">Colón</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {NAV.filter((n) => puede(n.permiso)).map((n) => {
            const activo = n.ruta === "/" ? pathname === "/" : pathname.startsWith(n.ruta);
            return (
              <Link
                key={n.ruta}
                href={n.ruta}
                className={cx(
                  "flex items-center justify-between rounded-md px-3 py-1.5 text-sm",
                  activo ? "bg-primary-light font-semibold text-primary-dark" : "text-ink hover:bg-page",
                )}
              >
                {n.texto}
                {n.tecla && <Kbd>{n.tecla}</Kbd>}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3 text-xs text-muted">
          <div className="mb-1 font-medium text-ink">{me.usuario.nombre}</div>
          <div className="mb-2">{me.roles.join(", ")}</div>
          <button onClick={() => setCambiandoClave(true)} className="mr-3 text-primary hover:underline">Contraseña</button>
          <button onClick={salir} className="text-danger hover:underline">Salir</button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center justify-between border-b border-border bg-surface px-4 py-2">
          <div className="text-sm text-muted">B/. — moneda local (PAB)</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Sucursal:</span>
            <Select
              className="w-56"
              value={sucursalId ?? ""}
              onChange={(e) => void cambiarSucursal(e.target.value)}
            >
              {me.sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.codigo} — {s.nombre}
                </option>
              ))}
            </Select>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4">{children}</main>
      </div>

      {(me.usuario.debeCambiarClave || cambiandoClave) && (
        <CambiarClave
          forzado={me.usuario.debeCambiarClave}
          onListo={() => {
            setCambiandoClave(false);
            void recargar();
          }}
        />
      )}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SesionProvider>
      <ToastProvider>
        <Shell>{children}</Shell>
      </ToastProvider>
    </SesionProvider>
  );
}
