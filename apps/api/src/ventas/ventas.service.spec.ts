import type { Ctx } from '../common/decorators';
import { VentasService } from './ventas.service';

const ctx: Ctx = {
  usuarioId: 'u1', usuario: 'test', nombre: 'Test', tenantId: 't1', sesionId: 's1',
  permisos: new Set(['ventas:crear']), rolCodigos: [], sucursalIds: ['suc1'],
  sucursalActivaId: 'suc1', sucursalId: 'suc1', debeCambiarClave: false,
};

const servicio = (valorConfigurado: unknown) => {
  const prisma = { configuracion: { findUnique: jest.fn(async () => (valorConfigurado === undefined ? null : { valor: valorConfigurado })) } };
  return new VentasService(prisma as never, {} as never, {} as never, {} as never, {} as never);
};

describe('VentasService.configDescuentos', () => {
  it('sin configuración guardada, devuelve el default [5, 10, 15, 20]', async () => {
    const s = servicio(undefined);
    expect(await s.configDescuentos(ctx)).toEqual({ presets: [5, 10, 15, 20] });
  });

  it('con configuración guardada, devuelve esos valores', async () => {
    const s = servicio([3, 7, 25]);
    expect(await s.configDescuentos(ctx)).toEqual({ presets: [3, 7, 25] });
  });

  it('valores fuera de rango (0, negativo, >100) se descartan; si no queda ninguno, usa el default', async () => {
    const s = servicio([0, -5, 150]);
    expect(await s.configDescuentos(ctx)).toEqual({ presets: [5, 10, 15, 20] });
  });

  it('valor guardado que no es un array, usa el default (defensivo)', async () => {
    const s = servicio('no-es-array');
    expect(await s.configDescuentos(ctx)).toEqual({ presets: [5, 10, 15, 20] });
  });
});
