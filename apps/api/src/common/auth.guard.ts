import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { err } from './errores';
import { Ctx, PERMISOS_KEY, PUBLICO_KEY, ReqConCtx } from './decorators';
import { PrismaService } from './prisma.service';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Guard global: sesión por cookie httpOnly (ADR-SEC-001/BL-004) + RBAC recurso:acción
 * (09 §3) + alcance por sucursal (RN-181). Todo endpoint es privado salvo @Publico().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ec: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(PUBLICO_KEY, [ec.getHandler(), ec.getClass()]);
    if (esPublico) return true;

    const req = ec.switchToHttp().getRequest<ReqConCtx>();
    const token = (req as ReqConCtx & { cookies?: Record<string, string> }).cookies?.['am_session'];
    if (!token) throw err.noAutenticado();

    const sesion = await this.prisma.sesion.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        usuario: {
          include: {
            roles: { include: { rol: { include: { permisos: { include: { permiso: true } } } } } },
            sucursales: true,
          },
        },
      },
    });

    if (!sesion || sesion.revocadaEn || sesion.expiraEn < new Date()) throw err.sesionInvalida();
    const u = sesion.usuario;
    if (!u.activo) throw err.sinPermiso();

    const permisos = new Set<string>();
    for (const ur of u.roles) for (const rp of ur.rol.permisos) permisos.add(rp.permiso.codigo);
    const sucursalIds = u.sucursales.map((s) => s.sucursalId);

    // Sucursal efectiva: X-Sucursal-Id (validada) o la activa de la sesión (Q-032)
    const header = (req.headers['x-sucursal-id'] as string | undefined)?.trim();
    let sucursalId: string | null = null;
    if (header) {
      if (!sucursalIds.includes(header)) throw err.sucursalNoAutorizada();
      sucursalId = header;
    } else if (sesion.sucursalActivaId && sucursalIds.includes(sesion.sucursalActivaId)) {
      sucursalId = sesion.sucursalActivaId;
    }

    const ctx: Ctx = {
      usuarioId: u.id,
      usuario: u.usuario,
      nombre: u.nombre,
      tenantId: u.tenantId,
      sesionId: sesion.id,
      permisos,
      rolCodigos: u.roles.map((r) => r.rol.codigo),
      sucursalIds,
      sucursalActivaId: sesion.sucursalActivaId,
      sucursalId,
      debeCambiarClave: u.debeCambiarClave,
      ip: req.ip,
    };
    req.ctx = ctx;

    const requeridos = this.reflector.getAllAndOverride<string[]>(PERMISOS_KEY, [ec.getHandler(), ec.getClass()]) ?? [];
    for (const p of requeridos) {
      if (!permisos.has(p)) throw err.sinPermiso(p);
    }
    return true;
  }
}
