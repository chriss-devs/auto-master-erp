import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { err } from './errores';

export const PUBLICO_KEY = 'publico';
/** Endpoint sin autenticación (solo login/health). */
export const Publico = () => SetMetadata(PUBLICO_KEY, true);

export const PERMISOS_KEY = 'permisos';
/** Permisos recurso:acción requeridos (09 §3.2); el guard valida RBAC + sucursal. */
export const RequierePermiso = (...permisos: string[]) => SetMetadata(PERMISOS_KEY, permisos);

/** Contexto de la petición autenticada (adjuntado por AuthGuard). */
export interface Ctx {
  usuarioId: string;
  usuario: string;
  nombre: string;
  tenantId: string;
  sesionId: string;
  permisos: Set<string>;
  rolCodigos: string[];
  sucursalIds: string[];
  sucursalActivaId: string | null;
  /** Sucursal efectiva de la petición: X-Sucursal-Id validada, o la activa de la sesión. */
  sucursalId: string | null;
  debeCambiarClave: boolean;
  ip?: string;
}

export type ReqConCtx = Request & { ctx?: Ctx };

export const UsuarioActual = createParamDecorator((_d: unknown, ec: ExecutionContext): Ctx => {
  const req = ec.switchToHttp().getRequest<ReqConCtx>();
  if (!req.ctx) throw err.noAutenticado();
  return req.ctx;
});

/** Sucursal efectiva obligatoria (RN-181/Q-032). */
export const SucursalActual = createParamDecorator((_d: unknown, ec: ExecutionContext): string => {
  const req = ec.switchToHttp().getRequest<ReqConCtx>();
  const sucursalId = req.ctx?.sucursalId;
  if (!sucursalId) throw err.validacion('Indique la sucursal (cabecera X-Sucursal-Id).');
  return sucursalId;
});
