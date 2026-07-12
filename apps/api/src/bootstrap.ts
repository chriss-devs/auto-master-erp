import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { FiltroErrores } from './common/filtro-errores';

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api/v1', { exclude: ['/'] });
  app.use(cookieParser());
  app.set('trust proxy', 1); // Vercel/proxy: IP real para auditoría y rate limit
  app.set('x-powered-by', false); // no revelar el framework

  // CORS fail-closed: en producción SIN WEB_ORIGIN no se reflejan orígenes arbitrarios con credenciales.
  // El navegador habla same-origin vía el proxy /api del web, así que la lista blanca solo cubre acceso directo.
  const origenes = process.env.WEB_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: origenes && origenes.length ? origenes : process.env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  });

  // Headers de seguridad mínimos (defensa en profundidad; las páginas HTML las sirve el web).
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }));
  app.useGlobalFilters(new FiltroErrores());
  return app;
}
