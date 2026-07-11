/** Día operativo en America/Panama (UTC-5 fijo, sin DST — BL-014). */
export function rangoDiaPanama(offsetDias = 0, ahora = new Date()): { desde: Date; hasta: Date } {
  const offsetMs = 5 * 3600_000;
  const local = new Date(ahora.getTime() - offsetMs);
  const inicioLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + offsetDias);
  return { desde: new Date(inicioLocal + offsetMs), hasta: new Date(inicioLocal + offsetMs + 24 * 3600_000) };
}

/** Rango del día operativo para una fecha 'YYYY-MM-DD'; null si es inválida. */
export function rangoDeFecha(fechaISO: string): { desde: Date; hasta: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaISO)) return null;
  const desde = new Date(`${fechaISO}T00:00:00-05:00`);
  if (isNaN(desde.getTime())) return null;
  // Rechazar fechas normalizadas por Date (p. ej. 2026-02-30): round-trip en TZ -05:00
  const local = new Date(desde.getTime() - 5 * 3600_000);
  const rt = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
  if (rt !== fechaISO) return null;
  return { desde, hasta: new Date(desde.getTime() + 24 * 3600_000) };
}
