import { D } from '../common/dinero';
import { calcularLinea, calcularTotales, porcentajeDescuento, validarPagos } from './calculo';

const linea = (cantidad: string, precio: string, tasa = '0.07', descuento?: string) =>
  calcularLinea({ cantidad: D(cantidad), precioUnitario: D(precio), tasaItbms: D(tasa), descuento: descuento ? D(descuento) : undefined });

describe('ITBMS por línea (RN-024/042, BL-010)', () => {
  it('calcula 7% sobre la base de la línea', () => {
    const l = linea('2', '7.50');
    expect(l.importeBruto.toFixed(2)).toBe('15.00');
    expect(l.baseGravable.toFixed(2)).toBe('15.00');
    expect(l.itbmsLinea.toFixed(2)).toBe('1.05');
    expect(l.totalLinea.toFixed(2)).toBe('16.05');
  });

  it('aplica descuento por línea antes del impuesto', () => {
    const l = linea('1', '100.00', '0.07', '10.00');
    expect(l.baseGravable.toFixed(2)).toBe('90.00');
    expect(l.itbmsLinea.toFixed(2)).toBe('6.30');
    expect(l.totalLinea.toFixed(2)).toBe('96.30');
  });

  it('soporta productos exentos (tasa 0, RN-042)', () => {
    const l = linea('3', '0.75', '0');
    expect(l.itbmsLinea.toFixed(2)).toBe('0.00');
    expect(l.totalLinea.toFixed(2)).toBe('2.25');
  });

  it('redondea half-up a 2 decimales por línea', () => {
    // 3 × 0.85 = 2.55 → ITBMS 0.1785 → 0.18
    expect(linea('3', '0.85').itbmsLinea.toFixed(2)).toBe('0.18');
    // base 0.50 → 0.035 → 0.04 (half-up contable)
    expect(linea('1', '0.50').itbmsLinea.toFixed(2)).toBe('0.04');
  });

  it('venta fraccionada: cantidades con decimales (D-027)', () => {
    const l = linea('2.5', '0.85');
    expect(l.importeBruto.toFixed(2)).toBe('2.13'); // 2.125 → 2.13 half-up
    expect(l.itbmsLinea.toFixed(2)).toBe('0.15');
  });

  it('rechaza descuento mayor que el importe de la línea', () => {
    expect(() => linea('1', '5.00', '0.07', '6.00')).toThrow('DESCUENTO_INVALIDO');
  });

  it('rechaza cantidades y precios inválidos', () => {
    expect(() => linea('0', '5.00')).toThrow('CANTIDAD_INVALIDA');
    expect(() => calcularLinea({ cantidad: D('1'), precioUnitario: D('-1'), tasaItbms: D('0.07') })).toThrow('PRECIO_INVALIDO');
  });
});

describe('Totales de venta', () => {
  it('suma por línea (no recalcula sobre el total)', () => {
    const lineas = [linea('2', '7.50'), linea('1', '100.00', '0.07', '10.00'), linea('3', '0.75', '0')];
    const t = calcularTotales(lineas);
    expect(t.subtotal.toFixed(2)).toBe('117.25');
    expect(t.descuentoTotal.toFixed(2)).toBe('10.00');
    expect(t.itbmsTotal.toFixed(2)).toBe('7.35');
    expect(t.total.toFixed(2)).toBe('114.60');
  });

  it('porcentaje de descuento para el umbral de autorización (RN-160)', () => {
    const t = calcularTotales([linea('1', '100.00', '0.07', '8.00')]);
    expect(porcentajeDescuento(t).toFixed(1)).toBe('8.0');
  });
});

describe('Pagos y vuelto (RF-VEN-005, D-029)', () => {
  const total = D('21.40');

  it('pago exacto en efectivo con vuelto', () => {
    const r = validarPagos(total, [{ metodo: 'EFECTIVO', monto: D('21.40') }], D('25.00'));
    expect(r.vuelto.toFixed(2)).toBe('3.60');
  });

  it('pago mixto: efectivo + tarjeta', () => {
    const r = validarPagos(total, [
      { metodo: 'EFECTIVO', monto: D('10.00') },
      { metodo: 'TARJETA', monto: D('11.40') },
    ], D('10.00'));
    expect(r.montoEfectivo.toFixed(2)).toBe('10.00');
    expect(r.vuelto.toFixed(2)).toBe('0.00');
  });

  it('rechaza pagos insuficientes', () => {
    expect(() => validarPagos(total, [{ metodo: 'TARJETA', monto: D('20.00') }])).toThrow('PAGO_INSUFICIENTE');
  });

  it('rechaza pagos que exceden el total (solo el efectivo da vuelto)', () => {
    expect(() => validarPagos(total, [{ metodo: 'TARJETA', monto: D('25.00') }])).toThrow('PAGO_EXCEDENTE');
  });

  it('rechaza efectivo recibido menor al aplicado', () => {
    expect(() => validarPagos(total, [{ metodo: 'EFECTIVO', monto: D('21.40') }], D('20.00'))).toThrow('EFECTIVO_INSUFICIENTE');
  });

  it('rechaza montos no positivos', () => {
    expect(() => validarPagos(total, [{ metodo: 'EFECTIVO', monto: D('0') }])).toThrow('PAGO_INVALIDO');
  });
});
