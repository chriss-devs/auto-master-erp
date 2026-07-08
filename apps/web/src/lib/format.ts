/** Formato Panamá: B/. (PAB = USD), es-PA, America/Panama. */

export const fmtMoney = (v: string | number | null | undefined): string => {
  const n = Number(v ?? 0);
  return `B/. ${n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const fmtQty = (v: string | number | null | undefined): string => {
  const n = Number(v ?? 0);
  return n.toLocaleString("es-PA", { maximumFractionDigits: 3 });
};

export const fmtFecha = (v: string | Date | null | undefined, conHora = true): string => {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  return d.toLocaleString("es-PA", {
    timeZone: "America/Panama",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
};

export const pct = (tasa: string | number): string => `${(Number(tasa) * 100).toFixed(Number(tasa) * 100 % 1 === 0 ? 0 : 2)}%`;
