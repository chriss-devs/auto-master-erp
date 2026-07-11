import { rangoDiaPanama, rangoDeFecha } from './fechas';

describe('rangoDiaPanama', () => {
  it('devuelve el día operativo de Panamá (UTC-5) para un instante dado', () => {
    // 2026-07-11 02:00 UTC = 2026-07-10 21:00 en Panamá ⇒ día operativo 10-jul
    const r = rangoDiaPanama(0, new Date('2026-07-11T02:00:00Z'));
    expect(r.desde.toISOString()).toBe('2026-07-10T05:00:00.000Z');
    expect(r.hasta.toISOString()).toBe('2026-07-11T05:00:00.000Z');
  });
  it('offsetDias=-1 devuelve el día anterior', () => {
    const r = rangoDiaPanama(-1, new Date('2026-07-10T12:00:00Z'));
    expect(r.desde.toISOString()).toBe('2026-07-09T05:00:00.000Z');
  });
});

describe('rangoDeFecha', () => {
  it('convierte YYYY-MM-DD al rango del día en Panamá', () => {
    const r = rangoDeFecha('2026-07-10');
    expect(r?.desde.toISOString()).toBe('2026-07-10T05:00:00.000Z');
    expect(r?.hasta.toISOString()).toBe('2026-07-11T05:00:00.000Z');
  });
  it('rechaza formatos inválidos', () => {
    expect(rangoDeFecha('ayer')).toBeNull();
    expect(rangoDeFecha('2026-13-40')).toBeNull();
  });
});
