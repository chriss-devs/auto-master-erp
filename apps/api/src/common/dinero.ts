import { Prisma } from '@prisma/client';

/** Dinero exacto: Prisma.Decimal (numeric), nunca float (07 §5). */
export type Dec = Prisma.Decimal;
export const D = (v: Prisma.Decimal.Value | null | undefined): Dec => new Prisma.Decimal(v ?? 0);

/** Redondeo contable a 2 decimales, half-up (BL-010). */
export const round2 = (v: Dec): Dec => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
export const round4 = (v: Dec): Dec => v.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

/** Serialización JSON: string decimal con 2 posiciones (08 §2). */
export const money = (v: Prisma.Decimal.Value | null | undefined): string => round2(D(v)).toFixed(2);
export const qty = (v: Prisma.Decimal.Value | null | undefined): string => D(v).toFixed(3).replace(/\.?0+$/, (m) => (m.startsWith('.') ? '' : m));
