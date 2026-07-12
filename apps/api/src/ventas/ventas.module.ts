import { Body, Controller, Get, Headers, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { CajaModule } from '../caja/caja.module';
import { Ctx, RequierePermiso, UsuarioActual } from '../common/decorators';
import { FacturacionModule } from '../facturacion/facturacion.module';
import { InventarioModule } from '../inventario/inventario.module';
import { ActualizarLineasDto, CancelarVentaDto, CobrarVentaDto, CrearVentaDto } from './ventas.dto';
import { VentasService } from './ventas.service';

@Controller('ventas')
export class VentasController {
  constructor(private readonly ventas: VentasService) {}

  /** Paso 1 (vendedor): armar la venta en ventanilla → PREPARACION (D-020). */
  @Post()
  @RequierePermiso('ventas:crear')
  crear(@UsuarioActual() ctx: Ctx, @Body() dto: CrearVentaDto, @Headers('idempotency-key') headerKey?: string) {
    return this.ventas.crear(ctx, { ...dto, idempotencyKey: dto.idempotencyKey ?? headerKey });
  }

  /** Presets de % de descuento (Admin > Configuración) para los botones de la ventanilla. */
  @Get('config-descuentos')
  @RequierePermiso('ventas:crear')
  configDescuentos(@UsuarioActual() ctx: Ctx) {
    return this.ventas.configDescuentos(ctx);
  }

  @Get()
  @RequierePermiso('ventas:ver')
  listar(
    @UsuarioActual() ctx: Ctx,
    @Query('estado') estado?: string,
    @Query('sucursal') sucursal?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.ventas.listar(ctx, { estado, sucursal, q, limit, cursor });
  }

  @Get(':id')
  @RequierePermiso('ventas:ver')
  obtener(@UsuarioActual() ctx: Ctx, @Param('id') id: string) {
    return this.ventas.obtener(ctx, id);
  }

  @Patch(':id/lineas')
  @RequierePermiso('ventas:crear')
  actualizarLineas(@UsuarioActual() ctx: Ctx, @Param('id') id: string, @Body() dto: ActualizarLineasDto) {
    return this.ventas.actualizarLineas(ctx, id, dto);
  }

  /** Paso 2 (caja): cobrar/facturar/entregar — atómico e idempotente (BL-008). */
  @Post(':id/cobrar')
  @RequierePermiso('caja:operar')
  cobrar(@UsuarioActual() ctx: Ctx, @Param('id') id: string, @Body() dto: CobrarVentaDto, @Headers('idempotency-key') headerKey?: string) {
    return this.ventas.cobrar(ctx, id, { ...dto, idempotencyKey: dto.idempotencyKey ?? headerKey });
  }

  @Post(':id/cancelar')
  @RequierePermiso('ventas:crear')
  cancelar(@UsuarioActual() ctx: Ctx, @Param('id') id: string, @Body() dto: CancelarVentaDto) {
    return this.ventas.cancelar(ctx, id, dto.motivo);
  }
}

@Module({
  imports: [InventarioModule, CajaModule, FacturacionModule],
  providers: [VentasService],
  controllers: [VentasController],
})
export class VentasModule {}
