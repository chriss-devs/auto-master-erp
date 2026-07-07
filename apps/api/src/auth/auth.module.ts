import { Body, Controller, Get, Injectable, Module, Post, Req, Res } from '@nestjs/common';
import { IsNotEmpty, IsString, IsUUID, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { AuditoriaService } from '../auditoria/auditoria.module';
import { hashToken } from '../common/auth.guard';
import { Ctx, Publico, UsuarioActual } from '../common/decorators';
import { AppError, err } from '../common/errores';
import { PrismaService } from '../common/prisma.service';

const SESION_HORAS = 12;
const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 15;

class LoginDto {
  @IsString() @IsNotEmpty() usuario: string;
  @IsString() @IsNotEmpty() password: string;
}
class CambiarClaveDto {
  @IsString() @IsNotEmpty() actual: string;
  @IsString() @MinLength(8, { message: 'La nueva contraseña debe tener al menos 8 caracteres.' }) nueva: string;
}
class SucursalActivaDto {
  @IsUUID() sucursalId: string;
}

/** Rate limit simple en memoria por instancia (login): 10 intentos / 5 min por IP+usuario. */
const ventanas = new Map<string, { n: number; desde: number }>();
function rateLimit(clave: string) {
  const ahora = Date.now();
  const v = ventanas.get(clave);
  if (!v || ahora - v.desde > 5 * 60_000) {
    ventanas.set(clave, { n: 1, desde: ahora });
    return;
  }
  v.n += 1;
  if (v.n > 10) throw new AppError('LIMITE_INTENTOS', 'Demasiados intentos. Espere unos minutos.', 429);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async login(dto: LoginDto, ip: string | undefined, userAgent: string | undefined) {
    rateLimit(`${ip ?? '?'}:${dto.usuario.toLowerCase()}`);

    const u = await this.prisma.usuario.findFirst({
      where: { usuario: dto.usuario.trim(), activo: true },
      include: { sucursales: { include: { sucursal: true } } },
    });
    if (!u) throw err.credenciales();

    if (u.bloqueadoHasta && u.bloqueadoHasta > new Date()) {
      throw new AppError('LIMITE_INTENTOS', 'Cuenta bloqueada temporalmente por intentos fallidos. Intente más tarde.', 429);
    }

    const ok = await bcrypt.compare(dto.password, u.passwordHash);
    if (!ok) {
      const intentos = u.intentosFallidos + 1;
      await this.prisma.usuario.update({
        where: { id: u.id },
        data:
          intentos >= MAX_INTENTOS
            ? { intentosFallidos: 0, bloqueadoHasta: new Date(Date.now() + BLOQUEO_MIN * 60_000) }
            : { intentosFallidos: intentos },
      });
      await this.auditoria.registrar(null, {
        tenantId: u.tenantId, usuarioId: u.id, accion: 'auth.login_fallido', entidad: 'usuario', entidadId: u.id, ip,
      });
      throw err.credenciales();
    }

    const token = randomBytes(48).toString('hex');
    const sucursalActivaId = u.sucursales[0]?.sucursalId ?? null;
    const sesion = await this.prisma.sesion.create({
      data: {
        usuarioId: u.id,
        tokenHash: hashToken(token),
        sucursalActivaId,
        ip: ip ?? null,
        userAgent: userAgent?.slice(0, 300) ?? null,
        expiraEn: new Date(Date.now() + SESION_HORAS * 3600_000),
      },
    });
    await this.prisma.usuario.update({
      where: { id: u.id },
      data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoLoginEn: new Date() },
    });
    await this.auditoria.registrar(null, {
      tenantId: u.tenantId, usuarioId: u.id, accion: 'auth.login', entidad: 'sesion', entidadId: sesion.id, ip,
    });
    return { token, usuarioId: u.id };
  }

  async me(ctx: Ctx) {
    const sucursales = await this.prisma.sucursal.findMany({
      where: { id: { in: ctx.sucursalIds }, activa: true },
      select: { id: true, codigo: true, nombre: true },
      orderBy: { codigo: 'asc' },
    });
    return {
      usuario: { id: ctx.usuarioId, usuario: ctx.usuario, nombre: ctx.nombre, debeCambiarClave: ctx.debeCambiarClave },
      roles: ctx.rolCodigos,
      permisos: [...ctx.permisos].sort(),
      sucursales,
      sucursalActivaId: ctx.sucursalActivaId,
      moneda: { codigo: 'PAB', simbolo: 'B/.' },
    };
  }

  async logout(ctx: Ctx) {
    await this.prisma.sesion.update({ where: { id: ctx.sesionId }, data: { revocadaEn: new Date() } });
    await this.auditoria.registrar(null, {
      tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, accion: 'auth.logout', entidad: 'sesion', entidadId: ctx.sesionId, ip: ctx.ip,
    });
  }

  async cambiarClave(ctx: Ctx, dto: CambiarClaveDto) {
    const u = await this.prisma.usuario.findUniqueOrThrow({ where: { id: ctx.usuarioId } });
    const ok = await bcrypt.compare(dto.actual, u.passwordHash);
    if (!ok) throw err.credenciales();
    await this.prisma.usuario.update({
      where: { id: u.id },
      data: { passwordHash: await bcrypt.hash(dto.nueva, 10), debeCambiarClave: false },
    });
    // Revocar las demás sesiones (09 §9)
    await this.prisma.sesion.updateMany({
      where: { usuarioId: u.id, id: { not: ctx.sesionId }, revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
    await this.auditoria.registrar(null, {
      tenantId: ctx.tenantId, usuarioId: u.id, accion: 'auth.cambiar_clave', entidad: 'usuario', entidadId: u.id, ip: ctx.ip,
    });
  }

  async sucursalActiva(ctx: Ctx, sucursalId: string) {
    if (!ctx.sucursalIds.includes(sucursalId)) throw err.sucursalNoAutorizada();
    await this.prisma.sesion.update({ where: { id: ctx.sesionId }, data: { sucursalActivaId: sucursalId } });
  }
}

function setSessionCookie(res: Response, token: string | null) {
  const secure = process.env.COOKIE_SECURE !== 'false';
  if (token) {
    res.cookie('am_session', token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: SESION_HORAS * 3600_000,
    });
  } else {
    res.clearCookie('am_session', { httpOnly: true, secure, sameSite: 'lax', path: '/' });
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Publico()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token } = await this.auth.login(dto, req.ip, req.headers['user-agent']);
    setSessionCookie(res, token);
    // Cargar el contexto recién creado para responder el "me" completo
    return { ok: true };
  }

  @Get('me')
  me(@UsuarioActual() ctx: Ctx) {
    return this.auth.me(ctx);
  }

  @Post('logout')
  async logout(@UsuarioActual() ctx: Ctx, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(ctx);
    setSessionCookie(res, null);
    return { ok: true };
  }

  @Post('cambiar-clave')
  async cambiarClave(@UsuarioActual() ctx: Ctx, @Body() dto: CambiarClaveDto) {
    await this.auth.cambiarClave(ctx, dto);
    return { ok: true };
  }

  @Post('sucursal-activa')
  async sucursalActiva(@UsuarioActual() ctx: Ctx, @Body() dto: SucursalActivaDto) {
    await this.auth.sucursalActiva(ctx, dto.sucursalId);
    return { ok: true };
  }
}

@Module({ providers: [AuthService], controllers: [AuthController] })
export class AuthModule {}
