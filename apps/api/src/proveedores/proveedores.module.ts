import { Body, Controller, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.module';
import { Ctx, RequierePermiso, UsuarioActual } from '../common/decorators';
import { err } from '../common/errores';
import { PrismaService } from '../common/prisma.service';

class CrearProveedorDto {
  @IsString() @IsNotEmpty() @MaxLength(200) nombre: string;
  @IsOptional() @IsString() @MaxLength(30) ruc?: string;
  @IsOptional() @IsString() @MaxLength(4) dv?: string;
  @IsOptional() @IsString() @MaxLength(30) telefono?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(300) direccion?: string;
}
class ActualizarProveedorDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) nombre?: string;
  @IsOptional() @IsString() @MaxLength(30) ruc?: string;
  @IsOptional() @IsString() @MaxLength(4) dv?: string;
  @IsOptional() @IsString() @MaxLength(30) telefono?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(300) direccion?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

@Controller('proveedores')
export class ProveedoresController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  @Get()
  @RequierePermiso('proveedores:ver')
  async listar(@UsuarioActual() ctx: Ctx, @Query('q') q?: string, @Query('limit') limit = '30', @Query('cursor') cursor?: string) {
    const take = Math.min(Number(limit) || 30, 100);
    const filas = await this.prisma.proveedor.findMany({
      where: { tenantId: ctx.tenantId, activo: true, ...(q ? { nombre: { contains: q, mode: 'insensitive' } } : {}) },
      orderBy: { nombre: 'asc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hayMas = filas.length > take;
    return { datos: filas.slice(0, take), next_cursor: hayMas ? filas[take - 1].id : null };
  }

  @Post()
  @RequierePermiso('proveedores:gestionar')
  async crear(@UsuarioActual() ctx: Ctx, @Body() dto: CrearProveedorDto) {
    const p = await this.prisma.proveedor.create({ data: { tenantId: ctx.tenantId, ...dto } });
    await this.auditoria.registrar(null, {
      tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, accion: 'proveedor.crear', entidad: 'proveedor', entidadId: p.id,
      estadoNuevo: { nombre: p.nombre }, ip: ctx.ip,
    });
    return p;
  }

  @Patch(':id')
  @RequierePermiso('proveedores:gestionar')
  async actualizar(@UsuarioActual() ctx: Ctx, @Param('id') id: string, @Body() dto: ActualizarProveedorDto) {
    const previo = await this.prisma.proveedor.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!previo) throw err.noEncontrado('El proveedor');
    const p = await this.prisma.proveedor.update({ where: { id }, data: dto as Prisma.ProveedorUpdateInput });
    await this.auditoria.registrar(null, {
      tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, accion: 'proveedor.editar', entidad: 'proveedor', entidadId: id,
      estadoAnterior: { nombre: previo.nombre, activo: previo.activo }, estadoNuevo: dto as unknown as Record<string, unknown>, ip: ctx.ip,
    });
    return p;
  }
}

@Module({ controllers: [ProveedoresController] })
export class ProveedoresModule {}
