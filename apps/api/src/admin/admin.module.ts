import { Body, Controller, Get, Module, Param, Patch, Post } from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsBoolean, IsEmail, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.module';
import { Ctx, RequierePermiso, UsuarioActual } from '../common/decorators';
import { err } from '../common/errores';
import { PrismaService } from '../common/prisma.service';

class CrearUsuarioDto {
  @IsString() @IsNotEmpty() @MaxLength(40) usuario: string;
  @IsString() @IsNotEmpty() @MaxLength(120) nombre: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' }) password: string;
  @IsArray() @ArrayNotEmpty({ message: 'Asigne al menos un rol.' }) roles: string[]; // códigos de rol
  @IsArray() @ArrayNotEmpty({ message: 'Asigne al menos una sucursal.' }) sucursales: string[]; // ids
}
class ActualizarUsuarioDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) nombre?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsArray() roles?: string[];
  @IsOptional() @IsArray() sucursales?: string[];
  @IsOptional() @IsString() @MinLength(8) nuevaPassword?: string;
}
class ActualizarRolDto {
  @IsArray() @ArrayNotEmpty() permisos: string[]; // códigos recurso:accion
}
class ActualizarConfigDto {
  @IsObject() valores: Record<string, unknown>;
}

@Controller()
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ── Usuarios (admin:usuarios) ──────────────────────────────────────────────

  @Get('usuarios')
  @RequierePermiso('admin:usuarios')
  async usuarios(@UsuarioActual() ctx: Ctx) {
    const filas = await this.prisma.usuario.findMany({
      where: { tenantId: ctx.tenantId },
      include: { roles: { include: { rol: true } }, sucursales: { include: { sucursal: true } } },
      orderBy: { usuario: 'asc' },
    });
    return filas.map((u) => ({
      id: u.id, usuario: u.usuario, nombre: u.nombre, email: u.email, activo: u.activo,
      debeCambiarClave: u.debeCambiarClave, ultimoLoginEn: u.ultimoLoginEn,
      roles: u.roles.map((r) => ({ codigo: r.rol.codigo, nombre: r.rol.nombre })),
      sucursales: u.sucursales.map((s) => ({ id: s.sucursal.id, codigo: s.sucursal.codigo, nombre: s.sucursal.nombre })),
    }));
  }

  /** Verifica que TODAS las sucursales indicadas existan y pertenezcan al tenant (aislamiento multiempresa). */
  private async validarSucursalesDelTenant(tenantId: string, sucursalIds: string[]) {
    const unicas = [...new Set(sucursalIds)];
    const n = await this.prisma.sucursal.count({ where: { tenantId, id: { in: unicas } } });
    if (n !== unicas.length) throw err.validacion('Alguna sucursal no existe o no pertenece a la empresa.');
  }

  @Post('usuarios')
  @RequierePermiso('admin:usuarios')
  async crearUsuario(@UsuarioActual() ctx: Ctx, @Body() dto: CrearUsuarioDto) {
    const roles = await this.prisma.rol.findMany({ where: { tenantId: ctx.tenantId, codigo: { in: dto.roles } } });
    if (roles.length !== dto.roles.length) throw err.validacion('Alguno de los roles no existe.');
    await this.validarSucursalesDelTenant(ctx.tenantId, dto.sucursales);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const u = await this.prisma.usuario.create({
      data: {
        tenantId: ctx.tenantId,
        usuario: dto.usuario.trim().toLowerCase(),
        nombre: dto.nombre.trim(),
        email: dto.email,
        passwordHash,
        debeCambiarClave: true,
        roles: { create: roles.map((r) => ({ rolId: r.id })) },
        sucursales: { create: dto.sucursales.map((s) => ({ sucursalId: s })) },
      },
    });
    await this.auditoria.registrar(null, {
      tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, accion: 'usuario.crear', entidad: 'usuario', entidadId: u.id,
      estadoNuevo: { usuario: u.usuario, roles: dto.roles, sucursales: dto.sucursales }, ip: ctx.ip,
    });
    return { id: u.id, usuario: u.usuario };
  }

  @Patch('usuarios/:id')
  @RequierePermiso('admin:usuarios')
  async actualizarUsuario(@UsuarioActual() ctx: Ctx, @Param('id') id: string, @Body() dto: ActualizarUsuarioDto) {
    const previo = await this.prisma.usuario.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { roles: { include: { rol: true } } } });
    if (!previo) throw err.noEncontrado('El usuario');
    if (dto.activo === false && previo.id === ctx.usuarioId) {
      throw err.regla('REGLA_NEGOCIO', 'No puede desactivarse a sí mismo.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id },
        data: {
          nombre: dto.nombre,
          email: dto.email,
          activo: dto.activo,
          ...(dto.nuevaPassword ? { passwordHash: await bcrypt.hash(dto.nuevaPassword, 10), debeCambiarClave: true } : {}),
        },
      });
      if (dto.roles) {
        const roles = await tx.rol.findMany({ where: { tenantId: ctx.tenantId, codigo: { in: dto.roles } } });
        if (roles.length !== dto.roles.length) throw err.validacion('Alguno de los roles no existe.');
        await tx.usuarioRol.deleteMany({ where: { usuarioId: id } });
        await tx.usuarioRol.createMany({ data: roles.map((r) => ({ usuarioId: id, rolId: r.id })) });
      }
      if (dto.sucursales) {
        await this.validarSucursalesDelTenant(ctx.tenantId, dto.sucursales);
        await tx.usuarioSucursal.deleteMany({ where: { usuarioId: id } });
        await tx.usuarioSucursal.createMany({ data: dto.sucursales.map((s) => ({ usuarioId: id, sucursalId: s })) });
      }
      if (dto.activo === false || dto.nuevaPassword) {
        await tx.sesion.updateMany({ where: { usuarioId: id, revocadaEn: null }, data: { revocadaEn: new Date() } });
      }
      await this.auditoria.registrar(tx, {
        tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, accion: 'usuario.editar', entidad: 'usuario', entidadId: id,
        estadoAnterior: { activo: previo.activo, roles: previo.roles.map((r) => r.rol.codigo) },
        estadoNuevo: { ...dto, nuevaPassword: dto.nuevaPassword ? '[cambiada]' : undefined }, ip: ctx.ip,
      });
    });
    return { ok: true };
  }

  // ── Roles y permisos ───────────────────────────────────────────────────────

  @Get('roles')
  @RequierePermiso('admin:usuarios')
  async roles(@UsuarioActual() ctx: Ctx) {
    const filas = await this.prisma.rol.findMany({
      where: { tenantId: ctx.tenantId },
      include: { permisos: { include: { permiso: true } }, _count: { select: { usuarios: true } } },
      orderBy: { nombre: 'asc' },
    });
    return filas.map((r) => ({
      id: r.id, codigo: r.codigo, nombre: r.nombre, esSistema: r.esSistema, usuarios: r._count.usuarios,
      permisos: r.permisos.map((p) => p.permiso.codigo).sort(),
    }));
  }

  @Get('permisos')
  @RequierePermiso('admin:usuarios')
  permisos() {
    return this.prisma.permiso.findMany({ orderBy: { codigo: 'asc' } });
  }

  @Patch('roles/:id')
  @RequierePermiso('admin:roles')
  async actualizarRol(@UsuarioActual() ctx: Ctx, @Param('id') id: string, @Body() dto: ActualizarRolDto) {
    const rol = await this.prisma.rol.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { permisos: { include: { permiso: true } } } });
    if (!rol) throw err.noEncontrado('El rol');
    if (rol.codigo === 'admin_general') throw err.regla('REGLA_NEGOCIO', 'El rol Administrador General no se modifica.');
    const permisos = await this.prisma.permiso.findMany({ where: { codigo: { in: dto.permisos } } });
    if (permisos.length !== dto.permisos.length) throw err.validacion('Algún permiso no existe.');
    await this.prisma.$transaction(async (tx) => {
      await tx.rolPermiso.deleteMany({ where: { rolId: id } });
      await tx.rolPermiso.createMany({ data: permisos.map((p) => ({ rolId: id, permisoId: p.id })) });
      await this.auditoria.registrar(tx, {
        tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, accion: 'rol.editar_permisos', entidad: 'rol', entidadId: id,
        estadoAnterior: { permisos: rol.permisos.map((p) => p.permiso.codigo) }, estadoNuevo: { permisos: dto.permisos }, ip: ctx.ip,
      });
    });
    return { ok: true };
  }

  // ── Configuración (admin:config) ───────────────────────────────────────────

  @Get('configuracion')
  @RequierePermiso('admin:config')
  async configuracion(@UsuarioActual() ctx: Ctx) {
    const filas = await this.prisma.configuracion.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { clave: 'asc' } });
    const tenant = await this.prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
    return {
      empresa: tenant
        ? { nombre: tenant.nombre, razonSocial: tenant.razonSocial, ruc: tenant.ruc, dv: tenant.dv, direccion: tenant.direccion, telefono: tenant.telefono, email: tenant.email }
        : null,
      valores: Object.fromEntries(filas.map((f) => [f.clave, f.valor])),
    };
  }

  @Patch('configuracion')
  @RequierePermiso('admin:config')
  async actualizarConfiguracion(@UsuarioActual() ctx: Ctx, @Body() dto: ActualizarConfigDto) {
    if (!dto?.valores || typeof dto.valores !== 'object') throw err.validacion('Envíe { valores: { clave: valor } }.');
    const anteriores = await this.prisma.configuracion.findMany({ where: { tenantId: ctx.tenantId, clave: { in: Object.keys(dto.valores) } } });
    await this.prisma.$transaction(async (tx) => {
      for (const [clave, valor] of Object.entries(dto.valores)) {
        await tx.configuracion.upsert({
          where: { tenantId_clave: { tenantId: ctx.tenantId, clave } },
          update: { valor: valor as Prisma.InputJsonValue },
          create: { tenantId: ctx.tenantId, clave, valor: valor as Prisma.InputJsonValue },
        });
      }
      await this.auditoria.registrar(tx, {
        tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, accion: 'configuracion.editar', entidad: 'configuracion', entidadId: null,
        estadoAnterior: Object.fromEntries(anteriores.map((a) => [a.clave, a.valor])), estadoNuevo: dto.valores, ip: ctx.ip,
      });
    });
    return { ok: true };
  }
}

@Module({ controllers: [AdminController] })
export class AdminModule {}
