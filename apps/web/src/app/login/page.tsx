"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button, Campo, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await api("/auth/login", { cuerpo: { usuario, password } });
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión.");
      setCargando(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-page p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-2xl font-black text-white">
            AM
          </div>
          <h1 className="text-xl font-bold">
            Auto Master <span className="text-accent">Colón</span>
          </h1>
          <p className="text-sm text-muted">Ferretería y autopartes — ERP</p>
        </div>
        <form onSubmit={entrar} className="space-y-3 rounded-lg border border-border bg-surface p-5 shadow-sm">
          <Campo etiqueta="Usuario">
            <Input autoFocus autoComplete="username" value={usuario} onChange={(e) => setUsuario(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Contraseña">
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Campo>
          {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={cargando}>
            {cargando ? "Entrando…" : "Iniciar sesión"}
          </Button>
        </form>
      </div>
    </main>
  );
}
