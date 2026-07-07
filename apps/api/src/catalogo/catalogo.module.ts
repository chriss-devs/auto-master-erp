import { Body, Controller, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AtributoTipo, TipoProducto } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.module';
import { Ctx, RequierePermiso, UsuarioActual } from '../common/decorators';
import { err } from '../common/errores';
import { PrismaService } from '../common/prisma.service';
import { InventarioModule } from '../inventario/inventario.module';
import { ActualizarProductoDto, CrearProductoDto } from './productos.dto';
import { ProductosService } from './productos.service';

@Controller('productos')
export class ProductosController {
  constructor(private readonly productos: ProductosService) {}

  /** Búsqueda as-you-type del POS y catálogo (RNF-001). */
  @Get('buscar')
  @RequierePermiso('productos:ver')
  buscar(@UsuarioActual() ctx: Ctx, @Query('q') q = '', @Query('limit') limit = '10') {
    return this.productos.buscar(ctx, q, Number(limit) || 10);
  }

  @Get()
  @RequierePermiso('productos:ver')
  listar(
    @UsuarioActual() ctx: Ctx,
    @Query('q') q?: string,
    @Query('categoria') categoriaId?: string,
    @Query('marca') marcaId?: string,
    @Query('estado') estado?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.productos.listar(ctx, { q, categoriaId, marcaId, estado, limit, cursor });
  }

  @Get(':id')
  @RequierePermiso('productos:ver')
  obtener(@UsuarioActual() ctx: Ctx, @Param('id') id: string) {
    return this.productos.obtener(ctx, id);
  }

  @Post()
  @RequierePermiso('productos:crear')
  crear(@UsuarioActual() ctx: Ctx, @Body() dto: CrearProductoDto) {
    return this.productos.crear(ctx, dto);
  }

  @Patch(':id')
  @RequierePermiso('productos:editar')
  actualizar(@UsuarioActual() ctx: Ctx, @Param('id') id: string, @Body() dto: ActualizarProductoDto) {
    return this.productos.actualizar(ctx, id, dto);
  }
}

class CrearCategoriaDto {
  @IsString() @IsNotEmpty() @MaxLength(120) nombre: string;
  @IsOptional() @IsEnum(TipoProducto) tipo?: TipoProducto;
  @IsOptional() @IsUUID() padreId?: string;
}
class CrearAtributoDefDto {
  @IsString() @IsNotEmpty() @MaxLength(60) clave: string;
  @IsString() @IsNotEmpty() @MaxLength(120) nombre: string;
  @IsEnum(AtributoTipo) tipo: AtributoTipo;
  @IsOptional() @IsString() @MaxLength(20) unidad?: string;
  @IsOptional() opciones?: string[];
  @IsOptional() @IsBoolean() requerido?: boolean;
}
class CrearSimpleDto {
  @IsString() @IsNotEmpty() @MaxLength(120) nombre: string;
}

/** Categorías, marcas, unidades y definiciones de atributos (metadatos del catálogo). */
@Controller()
export class CatalogoAuxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  @Get('categorias')
  @RequierePermiso('productos:ver')
  async categorias(@UsuarioActual() ctx: Ctx) {
    return this.prisma.categoria.findMany({
      where: { tenantId: ctx.tenantId, activa: true },
      include: { atributos: { orderBy: { orden: 'asc' } } },
      orderBy: [{ padreId: 'asc' }, { nombre: 'asc' }],
    });
  }

  @Post('categorias')
  @RequierePermiso('productos:crear')
  async crearCategoria(@UsuarioActual() ctx: Ctx, @Body() dto: CrearCategoriaDto) {
    const cat = await this.prisma.categoria.create({
      data: { tenantId: ctx.tenantId, nombre: dto.nombre.trim(), tipo: dto.tipo ?? 'GENERAL', padreId: dto.padreId },
    });
    await this.auditoria.registrar(null, {
      tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, accion: 'categoria.crear', entidad: 'categoria', entidadId: cat.id,
      estadoNuevo: { nombre: cat.nombre }, ip: ctx.ip,
    });
    return cat;
  }

  @Post('categorias/:id/atributos')
  @RequierePermiso('productos:crear')
  async crearAtributo(@UsuarioActual() ctx: Ctx, @Param('id') categoriaId: string, @Body() dto: CrearAtributoDefDto) {
    const cat = await this.prisma.categoria.findFirst({ where: { id: categoriaId, tenantId: ctx.tenantId } });
    if (!cat) throw err.noEncontrado('La categoría');
    const def = await this.prisma.atributoDef.create({
      data: {
        tenantId: ctx.tenantId, categoriaId,
        clave: dto.clave.trim().toLowerCase().replace(/\s+/g, '_'),
        nombre: dto.nombre.trim(), tipo: dto.tipo, unidad: dto.unidad,
        opciones: dto.opciones ?? [], requerido: dto.requerido ?? false,
      },
    });
    await this.auditoria.registrar(null, {
      tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, accion: 'atributo_def.crear', entidad: 'atributo_def', entidadId: def.id,
      estadoNuevo: { categoriaId, clave: def.clave, tipo: def.tipo }, ip: ctx.ip,
    });
    return def;
  }

  @Get('marcas')
  @RequierePermiso('productos:ver')
  marcas(@UsuarioActual() ctx: Ctx) {
    return this.prisma.marca.findMany({ where: { tenantId: ctx.tenantId, activa: true }, orderBy: { nombre: 'asc' } });
  }

  @Post('marcas')
  @RequierePermiso('productos:crear')
  async crearMarca(@UsuarioActual() ctx: Ctx, @Body() dto: CrearSimpleDto) {
    return this.prisma.marca.upsert({
      where: { tenantId_nombre: { tenantId: ctx.tenantId, nombre: dto.nombre.trim() } },
      update: { activa: true },
      create: { tenantId: ctx.tenantId, nombre: dto.nombre.trim() },
    });
  }

  @Get('unidades')
  @RequierePermiso('productos:ver')
  unidades(@UsuarioActual() ctx: Ctx) {
    return this.prisma.unidadMedida.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { codigo: 'asc' } });
  }

  @Get('sucursales')
  sucursales(@UsuarioActual() ctx: Ctx) {
    return this.prisma.sucursal.findMany({
      where: { tenantId: ctx.tenantId, activa: true },
      select: { id: true, codigo: true, nombre: true, direccion: true, telefono: true },
      orderBy: { codigo: 'asc' },
    });
  }
}

@Module({
  imports: [InventarioModule],
  providers: [ProductosService],
  controllers: [ProductosController, CatalogoAuxController],
  exports: [ProductosService],
})
export class CatalogoModule {}
