import { Controller, Get } from '@nestjs/common';
import { Publico } from './common/decorators';
import { PrismaService } from './common/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Publico()
  @Get('/')
  raiz() {
    return { servicio: 'auto-master-api', version: 'v1', docs: '/api/v1/health' };
  }

  @Publico()
  @Get('health')
  async health() {
    let db = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }
    const u = process.env.DATABASE_URL;
    return { estado: 'ok', db, ts: new Date().toISOString(), env_dbg: `${u === undefined ? 'UNSET' : JSON.stringify(u.slice(0, 14))}|len=${u?.length ?? -1}` };
  }
}
