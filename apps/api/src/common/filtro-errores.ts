import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { AppError } from './errores';

const CODIGO_POR_STATUS: Record<number, string> = {
  400: 'VALIDACION',
  401: 'NO_AUTENTICADO',
  403: 'SIN_PERMISO',
  404: 'NO_ENCONTRADO',
  409: 'CONFLICTO',
  422: 'REGLA_NEGOCIO',
  429: 'LIMITE',
};

/** Formato uniforme de error (08 §4): { error: { codigo, mensaje, detalles, trace_id } } */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly logger = new Logger('Errores');

  catch(ex: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const traceId = randomUUID();

    let status = 500;
    let codigo = 'ERROR_INTERNO';
    let mensaje = 'Ocurrió un error interno. Intente de nuevo.';
    let detalles: unknown[] | undefined;

    if (ex instanceof AppError) {
      status = ex.getStatus();
      codigo = ex.codigo;
      mensaje = ex.message;
      detalles = ex.detalles;
    } else if (ex instanceof HttpException) {
      status = ex.getStatus();
      codigo = CODIGO_POR_STATUS[status] ?? 'ERROR';
      const r = ex.getResponse() as { message?: string | string[] };
      const msgs = Array.isArray(r?.message) ? r.message : r?.message ? [r.message] : [ex.message];
      mensaje = msgs[0];
      if (msgs.length > 1) detalles = msgs.map((m) => ({ mensaje: m }));
    } else if (ex instanceof Prisma.PrismaClientKnownRequestError) {
      if (ex.code === 'P2002') {
        status = 409;
        codigo = 'CONFLICTO_UNICIDAD';
        mensaje = 'Ya existe un registro con ese valor único.';
        detalles = [{ campos: (ex.meta as { target?: string[] })?.target }];
      } else if (ex.code === 'P2025') {
        status = 404;
        codigo = 'NO_ENCONTRADO';
        mensaje = 'El recurso no existe.';
      } else {
        this.logger.error(`[${traceId}] Prisma ${ex.code}: ${ex.message}`);
      }
    } else {
      this.logger.error(`[${traceId}] ${(ex as Error)?.stack ?? ex}`);
    }

    res.status(status).json({ error: { codigo, mensaje, detalles, trace_id: traceId } });
  }
}
