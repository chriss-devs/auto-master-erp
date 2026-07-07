import { D, Dec, round2 } from '../common/dinero';

/**
 * Cálculo de venta (puro, sin IO — probado en unit tests).
 * ITBMS por línea (RN-024/042, BL-010):
 *   importeBruto = round2(precio × cantidad)
 *   baseGravable = importeBruto − descuento (descuento en monto, acotado)
 *   itbmsLinea   = round2(baseGravable × tasa)
 *   totalLinea   = baseGravable + itbmsLinea
 */
export interface LineaEntrada {
  cantidad: Dec;
  precioUnitario: Dec;
  descuento?: Dec; // monto B/.
  tasaItbms: Dec; // 0.07, 0, 0.10, 0.15
}

export interface LineaCalculada {
  importeBruto: Dec;
  descuento: Dec;
  baseGravable: Dec;
  itbmsLinea: Dec;
  totalLinea: Dec;
}

export function calcularLinea(l: LineaEntrada): LineaCalculada {
  if (l.cantidad.lte(0)) throw new Error('CANTIDAD_INVALIDA');
  if (l.precioUnitario.lt(0)) throw new Error('PRECIO_INVALIDO');
  const importeBruto = round2(l.precioUnitario.mul(l.cantidad));
  const descuento = round2(l.descuento ?? D(0));
  if (descuento.lt(0) || descuento.gt(importeBruto)) throw new Error('DESCUENTO_INVALIDO');
  const baseGravable = importeBruto.sub(descuento);
  const itbmsLinea = round2(baseGravable.mul(l.tasaItbms));
  return { importeBruto, descuento, baseGravable, itbmsLinea, totalLinea: baseGravable.add(itbmsLinea) };
}

export interface Totales {
  subtotal: Dec; // Σ importeBruto
  descuentoTotal: Dec;
  itbmsTotal: Dec;
  total: Dec;
}

export function calcularTotales(lineas: LineaCalculada[]): Totales {
  const z = D(0);
  return {
    subtotal: lineas.reduce((a, l) => a.add(l.importeBruto), z),
    descuentoTotal: lineas.reduce((a, l) => a.add(l.descuento), z),
    itbmsTotal: lineas.reduce((a, l) => a.add(l.itbmsLinea), z),
    total: lineas.reduce((a, l) => a.add(l.totalLinea), z),
  };
}

/** % de descuento efectivo sobre el importe bruto (para umbral RN-160). */
export function porcentajeDescuento(t: Totales): Dec {
  if (t.subtotal.lte(0)) return D(0);
  return t.descuentoTotal.div(t.subtotal).mul(100);
}

export interface PagoEntrada {
  metodo: 'EFECTIVO' | 'TARJETA' | 'YAPPY' | 'ACH';
  monto: Dec;
}

export interface ResultadoPagos {
  montoEfectivo: Dec;
  vuelto: Dec; // solo del efectivo
}

/**
 * Pagos (RF-VEN-005, D-029): Σ montos aplicados == total exacto (mixto permitido).
 * `efectivoRecibido` (si hay pago EFECTIVO) ≥ monto aplicado en efectivo; vuelto = recibido − aplicado.
 * Lanza Error con código: PAGO_INSUFICIENTE | PAGO_EXCEDENTE | EFECTIVO_INSUFICIENTE | PAGO_INVALIDO.
 */
export function validarPagos(total: Dec, pagos: PagoEntrada[], efectivoRecibido?: Dec): ResultadoPagos {
  if (!pagos.length) throw new Error('PAGO_INSUFICIENTE');
  for (const p of pagos) if (p.monto.lte(0)) throw new Error('PAGO_INVALIDO');
  const suma = pagos.reduce((a, p) => a.add(p.monto), D(0));
  if (round2(suma).lt(round2(total))) throw new Error('PAGO_INSUFICIENTE');
  if (round2(suma).gt(round2(total))) throw new Error('PAGO_EXCEDENTE');
  const montoEfectivo = pagos.filter((p) => p.metodo === 'EFECTIVO').reduce((a, p) => a.add(p.monto), D(0));
  let vuelto = D(0);
  if (montoEfectivo.gt(0) && efectivoRecibido !== undefined) {
    if (efectivoRecibido.lt(montoEfectivo)) throw new Error('EFECTIVO_INSUFICIENTE');
    vuelto = round2(efectivoRecibido.sub(montoEfectivo));
  }
  return { montoEfectivo, vuelto };
}
