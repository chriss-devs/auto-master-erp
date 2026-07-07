import { Controller, Get, Global, Injectable, Module, Query } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Ctx, RequierePermiso, UsuarioActual } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';

type Db = PrismaClient | Prisma.TransactionClient;

export interface EventoAuditoria {
  tenantId: string;
  usuarioId?: string | null;
  sucursalId?: string | null;
  accion: string; // "venta.cobrar", "auth.login"…
  entidad: string;
  entidadId?: string | null;
  estadoAnterior?: unknown;
  estadoNuevo?: unknown;
  ip?: string | null;
}

/** Auditoría inmutable (RN-182): siempre INSERT, jamás update/delete. */
@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra dentro de la transacción dada (o directo). */
  registrar(db: Db | null, e: EventoAuditoria) {
    return (db ?? this.prisma).auditoria.create({
      data: {
        tenantId: e.tenantId,
        usuarioId: e.usuarioId ?? null,
        sucursalId: e.sucursalId ?? null,
        accion: e.accion,
        entidad: e.entidad,
        entidadId: e.entidadId ?? null,
        estadoAnterior: (e.estadoAnterior as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        estadoNuevo: (e.estadoNuevo as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        ip: e.ip ?? null,
      },
    });
  }
}

@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly prisma: PrismaService) {}

  /** Consulta de auditoría, solo lectura (08 §5.5). */
  @Get()
  @RequierePermiso('auditoria:ver')
  async listar(
    @UsuarioActual() ctx: Ctx,
    @Query('entidad') entidad?: string,
    @Query('entidadId') entidadId?: string,
    @Query('accion') accion?: string,
    @Query('limit') limit = '50',
    @Query('cursor') cursor?: string,
  ) {
    const take = Math.min(Number(limit) || 50, 200);
    const where: Prisma.AuditoriaWhereInput = {
      tenantId: ctx.tenantId,
      ...(entidad ? { entidad } : {}),
      ...(entidadId ? { entidadId } : {}),
      ...(accion ? { accion: { contains: accion } } : {}),
    };
    const filas = await this.prisma.auditoria.findMany({
      where,
      orderBy: { creadoEn: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hayMas = filas.length > take;
    return { datos: filas.slice(0, take), next_cursor: hayMas ? filas[take - 1].id : null };
  }
}

@Global()
@Module({ providers: [AuditoriaService], controllers: [AuditoriaController], exports: [AuditoriaService] })
export class AuditoriaModule {}
