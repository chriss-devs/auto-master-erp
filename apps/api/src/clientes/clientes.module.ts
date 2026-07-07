import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { ClienteTipo, Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.module';
import { Ctx, RequierePermiso, UsuarioActual } from '../common/decorators';
import { err } from '../common/errores';
import { PrismaService } from '../common/prisma.service';

class CrearClienteDto {
  @IsString() @IsNotEmpty() @MaxLength(200) nombre: string;
  @IsOptional() @IsEnum(ClienteTipo) tipo?: ClienteTipo;
  @IsOptional() @IsString() @MaxLength(30) rucOCedula?: string;
  @IsOptional() @IsString() @MaxLength(4) dv?: string;
  @IsOptional() @IsString() @MaxLength(30) telefono?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(300) direccion?: string;
}
class ActualizarClienteDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) nombre?: string;
  @IsOptional() @IsEnum(ClienteTipo) tipo?: ClienteTipo;
  @IsOptional() @IsString() @MaxLength(30) rucOCedula?: string;
  @IsOptional() @IsString() @MaxLength(4) dv?: string;
  @IsOptional() @IsString() @MaxLength(30) telefono?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(300) direccion?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}
class PrecioEspecialDto {
  @IsUUID() productoId: string;
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'Precio inválido.' }) precio: string;
}

@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  @Get()
  @RequierePermiso('clientes:ver')
  async listar(@UsuarioActual() ctx: Ctx, @Query('q') q?: string, @Query('limit') limit = '30', @Query('cursor') cursor?: string) {
    const take = Math.min(Number(limit) || 30, 100);
    const filas = await this.prisma.cliente.findMany({
      where: {
        tenantId: ctx.tenantId,
        activo: true,
        ...(q ? { OR: [{ nombre: { contains: q, mode: 'insensitive' } }, { rucOCedula: { contains: q } }] } : {}),
      },
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hayMas = filas.length > take;
    return { datos: filas.slice(0, take), next_cursor: hayMas ? filas[take - 1].id : null };
  }

  @Get(':id')
  @RequierePermiso('clientes:ver')
  async obtener(@UsuarioActual() ctx: Ctx, @Param('id') id: string) {
    const c = await this.prisma.cliente.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { preciosEspeciales: { where: { activo: true }, include: { producto: { select: { id: true, sku: true, nombre: true, precioBase: true } } } } },
    });
    if (!c) throw err.noEncontrado('El cliente');
    return c;
  }

  @Post()
  @RequierePermiso('clientes:gestionar')
  async crear(@UsuarioActual() ctx: Ctx, @Body() dto: CrearClienteDto) {
    const c = await this.prisma.cliente.create({
      data: { tenantId: ctx.tenantId, ...dto, tipo: dto.tipo ?? 'NATURAL' },
    });
    await this.auditoria.registrar(null, {
      tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, accion: 'cliente.crear', entidad: 'cliente', entidadId: c.id,
      estadoNuevo: { nombre: c.nombre }, ip: ctx.ip,
    });
    return c;
  }

  @Patch(':id')
  @RequierePermiso('clientes:gestionar')
  async actualizar(@UsuarioActual() ctx: Ctx, @Param('id') id: string, @Body() dto: ActualizarClienteDto) {
    const previo = await this.prisma.cliente.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!previo) throw err.noEncontrado('El cliente');
    if (previo.tipo === 'CONSUMIDOR_FINAL' && dto.activo === false) {
      throw err.regla('REGLA_NEGOCIO', 'El Consumidor Final no puede desactivarse.');
    }
    const c = await this.prisma.cliente.update({ where: { id }, data: dto as Prisma.ClienteUpdateInput });
    await this.auditoria.registrar(null, {
      tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, accion: 'cliente.editar', entidad: 'cliente', entidadId: id,
      estadoAnterior: { nombre: previo.nombre, activo: previo.activo }, estadoNuevo: dto as unknown as Record<string, unknown>, ip: ctx.ip,
    });
    return c;
  }

  /** Precio especial por cliente (D-024/RN-043). */
  @Post(':id/precios-especiales')
  @RequierePermiso('clientes:gestionar')
  async precioEspecial(@UsuarioActual() ctx: Ctx, @Param('id') clienteId: string, @Body() dto: PrecioEspecialDto) {
    const cliente = await this.prisma.cliente.findFirst({ where: { id: clienteId, tenantId: ctx.tenantId } });
    if (!cliente) throw err.noEncontrado('El cliente');
    const pe = await this.prisma.precioEspecial.upsert({
      where: { clienteId_productoId: { clienteId, productoId: dto.productoId } },
      update: { precio: dto.precio, activo: true },
      create: { tenantId: ctx.tenantId, clienteId, productoId: dto.productoId, precio: dto.precio },
    });
    await this.auditoria.registrar(null, {
      tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, accion: 'cliente.precio_especial', entidad: 'precio_especial', entidadId: pe.id,
      estadoNuevo: { clienteId, productoId: dto.productoId, precio: dto.precio }, ip: ctx.ip,
    });
    return pe;
  }

  @Delete(':id/precios-especiales/:peId')
  @RequierePermiso('clientes:gestionar')
  async quitarPrecioEspecial(@UsuarioActual() ctx: Ctx, @Param('id') clienteId: string, @Param('peId') peId: string) {
    const pe = await this.prisma.precioEspecial.findFirst({ where: { id: peId, clienteId, tenantId: ctx.tenantId } });
    if (!pe) throw err.noEncontrado('El precio especial');
    await this.prisma.precioEspecial.update({ where: { id: peId }, data: { activo: false } });
    await this.auditoria.registrar(null, {
      tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, accion: 'cliente.precio_especial_quitar', entidad: 'precio_especial', entidadId: peId,
      estadoAnterior: { precio: pe.precio.toString() }, ip: ctx.ip,
    });
    return { ok: true };
  }
}

@Module({ controllers: [ClientesController] })
export class ClientesModule {}
