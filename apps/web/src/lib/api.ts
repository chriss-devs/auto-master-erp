/** Cliente del API (mismo origen vía proxy /api — BL-006). Errores con formato 08 §4. */

export class ApiError extends Error {
  constructor(
    public readonly codigo: string,
    mensaje: string,
    public readonly status: number,
    public readonly detalles?: unknown[],
  ) {
    super(mensaje);
  }
}

interface Opciones {
  metodo?: "GET" | "POST" | "PATCH" | "DELETE";
  cuerpo?: unknown;
  sucursalId?: string | null;
  idempotencyKey?: string;
}

export async function api<T = unknown>(ruta: string, op: Opciones = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (op.cuerpo !== undefined) headers["Content-Type"] = "application/json";
  if (op.sucursalId) headers["X-Sucursal-Id"] = op.sucursalId;
  if (op.idempotencyKey) headers["Idempotency-Key"] = op.idempotencyKey;

  const res = await fetch(`/api/v1${ruta}`, {
    method: op.metodo ?? (op.cuerpo !== undefined ? "POST" : "GET"),
    headers,
    body: op.cuerpo !== undefined ? JSON.stringify(op.cuerpo) : undefined,
    credentials: "same-origin",
  });

  if (res.status === 401 && !ruta.startsWith("/auth/login")) {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError("NO_AUTENTICADO", "Sesión expirada", 401);
  }

  const texto = await res.text();
  const json = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    const e = json?.error ?? {};
    throw new ApiError(e.codigo ?? "ERROR", e.mensaje ?? "Error inesperado", res.status, e.detalles);
  }
  return json as T;
}

export const nuevaIdempotencyKey = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
