import { Body, Controller, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, Matches } from 'class-validator';
import { CajaMovTipo, MetodoPago, Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.module';
import { Ctx, RequierePermiso, SucursalActual, UsuarioActual } from '../common/decorators';
import { D, Dec, money, round2 } from '../common/dinero';
import { err } from '../common/errores';
import { PrismaService } from '../common/prisma.service';

const MONEY = /^\d+(\.\d{1,2})?$/;

class AbrirCajaDto {
  @Matches(MONEY, { message: 'Monto inicial inválido.' }) montoInicial: string;
  @IsOptional() @IsString() notas?: string;
}
class MovimientoCajaDto {
  @IsIn(['INGRESO', 'EGRESO', 'RETIRO']) tipo: 'INGRESO' | 'EGRESO' | 'RETIRO';
  @Matches(MONEY, { message: 'Monto inválido.' }) monto: string;
  @IsString() @IsNotEmpty({ message: 'El motivo es obligatorio.' }) motivo: string;
}
class CerrarCajaDto {
  /** Contado físico/reportado por método: { EFECTIVO: "125.50", TARJETA: "80.00", … } */
  @IsObject() contado: Record<string, string>;
  @IsOptional() @IsString() notas?: string;
}

export interface EsperadoPorMetodo {
  metodo: MetodoPago;
  esperado: Dec;
}

@Injectable()
export class CajaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Sesión ABIERTA de la sucursal (una a la vez, BL-020). */
  sesionAbierta(tenantId: string, sucursalId: string) {
    return this.prisma.cajaSesion.findFirst({
      where: { tenantId, sucursalId, estado: 'ABIERTA' },
      include: { movimientos: true },
    });
  }

  /** Esperado por método (RN-120): efectivo = inicial + ventas EFECTIVO + ingresos − egresos − retiros. */
  esperadoPorMetodo(sesion: { montoInicial: Prisma.Decimal; movimientos: Array<{ tipo: CajaMovTipo; metodo: MetodoPago | null; monto: Prisma.Decimal }> }): Record<string, Dec> {
    const r: Record<string, Dec> = {
      EFECTIVO: D(sesion.montoInicial),
      TARJETA: D(0),
      YAPPY: D(0),
      ACH: D(0),
    };
    for (const m of sesion.movimientos) {
      if (m.tipo === 'APERTURA') continue; // ya contada en montoInicial
      if (m.tipo === 'VENTA' && m.metodo) r[m.metodo] = r[m.metodo].add(D(m.monto));
      if (m.tipo === 'INGRESO') r.EFECTIVO = r.EFECTIVO.add(D(m.monto));
      if (m.tipo === 'EGRESO' || m.tipo === 'RETIRO') r.EFECTIVO = r.EFECTIVO.sub(D(m.monto));
    }
    return r;
  }

  async abrir(ctx: Ctx, sucursalId: string, dto: AbrirCajaDto) {
    const abierta = await this.sesionAbierta(ctx.tenantId, sucursalId);
    if (abierta) throw err.conflicto('CAJA_YA_ABIERTA', 'Ya hay una caja abierta en esta sucursal. Ciérrela antes de abrir otra.');
    const sesion = await this.prisma.$transaction(async (tx) => {
      const s = await tx.cajaSesion.create({
        data: {
          tenantId: ctx.tenantId,
          sucursalId,
          usuarioAperturaId: ctx.usuarioId,
          montoInicial: dto.montoInicial,
          notasApertura: dto.notas,
        },
      });
      await tx.cajaMovimiento.create({
        data: { cajaSesionId: s.id, tipo: 'APERTURA', metodo: 'EFECTIVO', monto: dto.montoInicial, usuarioId: ctx.usuarioId, motivo: 'Apertura de caja' },
      });
      await this.auditoria.registrar(tx, {
        tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, sucursalId, accion: 'caja.abrir', entidad: 'caja_sesion', entidadId: s.id,
        estadoNuevo: { montoInicial: dto.montoInicial }, ip: ctx.ip,
      });
      return s;
    });
    return sesion;
  }

  async estado(ctx: Ctx, sucursalId: string) {
    const sesion = await this.sesionAbierta(ctx.tenantId, sucursalId);
    if (!sesion) return { abierta: false as const };
    const esperado = this.esperadoPorMetodo(sesion);
    const ventas = sesion.movimientos.filter((m) => m.tipo === 'VENTA');
    return {
      abierta: true as const,
      sesion: {
        id: sesion.id,
        abiertaEn: sesion.abiertaEn,
        montoInicial: sesion.montoInicial,
        usuarioAperturaId: sesion.usuarioAperturaId,
        notasApertura: sesion.notasApertura,
      },
      esperado: Object.fromEntries(Object.entries(esperado).map(([k, v]) => [k, money(v)])),
      totalVentas: ventas.length ? money(ventas.reduce((a, m) => a.add(D(m.monto)), D(0))) : '0.00',
      cantidadVentas: new Set(sesion.movimientos.filter((m) => m.tipo === 'VENTA' && m.ventaId).map((m) => m.ventaId)).size,
      movimientos: sesion.movimientos
        .slice()
        .sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime())
        .slice(0, 50),
    };
  }

  async registrarMovimiento(ctx: Ctx, sucursalId: string, dto: MovimientoCajaDto) {
    const sesion = await this.sesionAbierta(ctx.tenantId, sucursalId);
    if (!sesion) throw err.regla('CAJA_NO_ABIERTA', 'No hay caja abierta en esta sucursal.');
    if (dto.tipo !== 'INGRESO') {
      const esperado = this.esperadoPorMetodo(sesion).EFECTIVO;
      if (esperado.lt(D(dto.monto))) {
        throw err.regla('EFECTIVO_INSUFICIENTE', `El efectivo en caja (B/. ${money(esperado)}) no alcanza para este ${dto.tipo.toLowerCase()}.`);
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const mov = await tx.cajaMovimiento.create({
        data: { cajaSesionId: sesion.id, tipo: dto.tipo, metodo: 'EFECTIVO', monto: dto.monto, motivo: dto.motivo, usuarioId: ctx.usuarioId },
      });
      await this.auditoria.registrar(tx, {
        tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, sucursalId, accion: `caja.${dto.tipo.toLowerCase()}`, entidad: 'caja_movimiento', entidadId: mov.id,
        estadoNuevo: { monto: dto.monto, motivo: dto.motivo }, ip: ctx.ip,
      });
      return mov;
    });
  }

  /** Cierre con cuadre por método (RN-120/123): esperado vs contado, diferencia y descuadre. */
  async cerrar(ctx: Ctx, sesionId: string, dto: CerrarCajaDto) {
    const sesion = await this.prisma.cajaSesion.findFirst({
      where: { id: sesionId, tenantId: ctx.tenantId },
      include: { movimientos: true },
    });
    if (!sesion) throw err.noEncontrado('La sesión de caja');
    if (sesion.estado === 'CERRADA') throw err.conflicto('CONFLICTO', 'La sesión ya está cerrada.');
    if (!ctx.sucursalIds.includes(sesion.sucursalId)) throw err.sucursalNoAutorizada();

    const esperado = this.esperadoPorMetodo(sesion);
    const cuadre: Record<string, { esperado: string; contado: string; diferencia: string }> = {};
    let descuadreTotal = D(0);
    for (const metodo of Object.keys(esperado)) {
      const contadoStr = dto.contado[metodo] ?? '0';
      if (!MONEY.test(contadoStr)) throw err.validacion(`Monto contado inválido para ${metodo}.`);
      const contado = D(contadoStr);
      const dif = round2(contado.sub(esperado[metodo]));
      cuadre[metodo] = { esperado: money(esperado[metodo]), contado: money(contado), diferencia: money(dif) };
      descuadreTotal = descuadreTotal.add(dif.abs());
    }

    const cerrada = await this.prisma.$transaction(async (tx) => {
      const s = await tx.cajaSesion.update({
        where: { id: sesion.id },
        data: {
          estado: 'CERRADA',
          usuarioCierreId: ctx.usuarioId,
          cerradaEn: new Date(),
          cuadre: cuadre as unknown as Prisma.InputJsonValue,
          descuadreTotal: round2(descuadreTotal),
          notasCierre: dto.notas,
        },
      });
      await this.auditoria.registrar(tx, {
        tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, sucursalId: sesion.sucursalId, accion: 'caja.cerrar', entidad: 'caja_sesion', entidadId: sesion.id,
        estadoNuevo: { cuadre, descuadreTotal: money(descuadreTotal) }, ip: ctx.ip,
      });
      return s;
    });
    return { sesion: cerrada, cuadre, descuadreTotal: money(descuadreTotal) };
  }

  async listarSesiones(ctx: Ctx, sucursalId: string | null, verTodas: boolean, limit = 20) {
    return this.prisma.cajaSesion.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(verTodas ? {} : { sucursalId: sucursalId ?? '00000000-0000-0000-0000-000000000000' }),
      },
      include: { sucursal: { select: { codigo: true, nombre: true } } },
      orderBy: { abiertaEn: 'desc' },
      take: Math.min(limit, 100),
    });
  }
}

@Controller('caja')
export class CajaController {
  constructor(private readonly caja: CajaService) {}

  @Post('sesiones')
  @RequierePermiso('caja:operar')
  abrir(@UsuarioActual() ctx: Ctx, @SucursalActual() sucursalId: string, @Body() dto: AbrirCajaDto) {
    return this.caja.abrir(ctx, sucursalId, dto);
  }

  @Get('estado')
  @RequierePermiso('caja:operar')
  estado(@UsuarioActual() ctx: Ctx, @SucursalActual() sucursalId: string) {
    return this.caja.estado(ctx, sucursalId);
  }

  @Post('movimientos')
  @RequierePermiso('caja:operar')
  movimiento(@UsuarioActual() ctx: Ctx, @SucursalActual() sucursalId: string, @Body() dto: MovimientoCajaDto) {
    return this.caja.registrarMovimiento(ctx, sucursalId, dto);
  }

  @Post('sesiones/:id/cerrar')
  @RequierePermiso('caja:cerrar')
  cerrar(@UsuarioActual() ctx: Ctx, @Param('id') id: string, @Body() dto: CerrarCajaDto) {
    return this.caja.cerrar(ctx, id, dto);
  }

  @Get('sesiones')
  @RequierePermiso('caja:operar')
  sesiones(@UsuarioActual() ctx: Ctx, @Query('limit') limit = '20') {
    const verTodas = ctx.permisos.has('caja:ver_todas');
    return this.caja.listarSesiones(ctx, ctx.sucursalId, verTodas, Number(limit) || 20);
  }
}

@Module({ providers: [CajaService], controllers: [CajaController], exports: [CajaService] })
export class CajaModule {}
