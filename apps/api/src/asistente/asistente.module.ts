import { Body, Controller, Module, Post } from '@nestjs/common';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { Ctx, UsuarioActual } from '../common/decorators';
import { AsistenteService, ChatBody } from './asistente.service';
import { DeepseekClient } from './deepseek.client';

/**
 * Asistente conversacional sobre la BD (spec 2026-07-11). Cualquier usuario autenticado;
 * el RBAC se aplica POR HERRAMIENTA dentro del servicio, no en el endpoint.
 */
@Controller('asistente')
export class AsistenteController {
  constructor(private readonly asistente: AsistenteService) {}

  @Post('chat')
  chat(@UsuarioActual() ctx: Ctx, @Body() body: ChatBody) {
    return this.asistente.chat(ctx, body);
  }
}

@Module({
  imports: [CatalogoModule],
  providers: [AsistenteService, DeepseekClient],
  controllers: [AsistenteController],
})
export class AsistenteModule {}
