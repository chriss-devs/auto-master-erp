import { HttpException } from '@nestjs/common';

/**
 * Error de negocio con código estable (08 §4). Códigos documentados:
 * 400 VALIDACION · 401 NO_AUTENTICADO/CREDENCIALES_INVALIDAS/SESION_INVALIDA
 * 403 SIN_PERMISO/SUCURSAL_NO_AUTORIZADA/USUARIO_INACTIVO · 404 NO_ENCONTRADO
 * 409 STOCK_INSUFICIENTE/CONFLICTO/YA_COBRADA/CAJA_YA_ABIERTA/IDEMPOTENCIA_EN_USO
 * 422 REGLA_NEGOCIO/CAJA_NO_ABIERTA/PAGO_INSUFICIENTE/DESCUENTO_REQUIERE_AUTORIZACION
 * 429 LIMITE_INTENTOS · 500 ERROR_INTERNO
 */
export class AppError extends HttpException {
  constructor(
    public readonly codigo: string,
    mensaje: string,
    status: number,
    public readonly detalles?: unknown[],
  ) {
    super(mensaje, status);
  }
}

export const err = {
  validacion: (m: string, d?: unknown[]) => new AppError('VALIDACION', m, 400, d),
  noAutenticado: () => new AppError('NO_AUTENTICADO', 'Debe iniciar sesión.', 401),
  sesionInvalida: () => new AppError('SESION_INVALIDA', 'La sesión expiró o fue revocada. Inicie sesión de nuevo.', 401),
  credenciales: () => new AppError('CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos.', 401),
  sinPermiso: (permiso?: string) =>
    new AppError('SIN_PERMISO', 'No tiene permiso para esta acción.', 403, permiso ? [{ permiso }] : undefined),
  sucursalNoAutorizada: () => new AppError('SUCURSAL_NO_AUTORIZADA', 'No tiene acceso a esa sucursal.', 403),
  noEncontrado: (que = 'El recurso') => new AppError('NO_ENCONTRADO', `${que} no existe.`, 404),
  conflicto: (codigo: string, m: string, d?: unknown[]) => new AppError(codigo, m, 409, d),
  regla: (codigo: string, m: string, d?: unknown[]) => new AppError(codigo, m, 422, d),
};
