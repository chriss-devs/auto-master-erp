"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";

export interface Sucursal {
  id: string;
  codigo: string;
  nombre: string;
}

export interface Me {
  usuario: { id: string; usuario: string; nombre: string; debeCambiarClave: boolean };
  roles: string[];
  permisos: string[];
  sucursales: Sucursal[];
  sucursalActivaId: string | null;
  moneda: { codigo: string; simbolo: string };
}

interface SesionCtx {
  me: Me | null;
  cargando: boolean;
  sucursalId: string | null;
  sucursal: Sucursal | null;
  puede: (permiso: string) => boolean;
  cambiarSucursal: (id: string) => Promise<void>;
  recargar: () => Promise<void>;
}

const Ctx = createContext<SesionCtx>({
  me: null,
  cargando: true,
  sucursalId: null,
  sucursal: null,
  puede: () => false,
  cambiarSucursal: async () => {},
  recargar: async () => {},
});

export function SesionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [cargando, setCargando] = useState(true);
  const [sucursalId, setSucursalId] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      const m = await api<Me>("/auth/me");
      setMe(m);
      setSucursalId((prev) => prev ?? m.sucursalActivaId ?? m.sucursales[0]?.id ?? null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const cambiarSucursal = useCallback(async (id: string) => {
    await api("/auth/sucursal-activa", { cuerpo: { sucursalId: id } });
    setSucursalId(id);
  }, []);

  const puede = useCallback((permiso: string) => me?.permisos.includes(permiso) ?? false, [me]);
  const sucursal = me?.sucursales.find((s) => s.id === sucursalId) ?? null;

  return (
    <Ctx.Provider value={{ me, cargando, sucursalId, sucursal, puede, cambiarSucursal, recargar }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSesion = () => useContext(Ctx);
