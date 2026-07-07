import { Injectable } from '@nestjs/common';
import { AtributoTipo, CodigoTipo, Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.module';
import { Ctx } from '../common/decorators';
import { D } from '../common/dinero';
import { err } from '../common/errores';
import { PrismaService } from '../common/prisma.service';
import { InventarioService } from '../inventario/inventario.module';
import { ActualizarProductoDto, AtributoValorDto, CrearProductoDto } from './productos.dto';

const INCLUDE_PRODUCTO = {
  categoria: true,
  marca: true,
  unidadMedida: true,
  codigos: true,
  atributos: { include: { atributoDef: true } },
  compat: true,
  stocks: { include: { sucursal: { select: { id: true, codigo: true, nombre: true } } } },
} satisfies Prisma.ProductoInclude;

@Injectable()
export class ProductosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventario: InventarioService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Búsqueda rápida y tolerante (D-004/D-021/D-028, BL-012):
   * exacto de código (incl. código interno) > prefijo de código > trigram/parcial en nombre,
   * descripción y marca. Devuelve stock por sucursal (D-030) y precio.
   */
  async buscar(ctx: Ctx, q: string, limit = 10) {
    const term = q.trim();
    if (!term) return { datos: [] };
    const like = `%${term}%`;
    const filas = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT p.id,
        CASE
          WHEN EXISTS (SELECT 1 FROM producto_codigo pc WHERE pc.producto_id = p.id AND lower(pc.valor) = lower(${term})) THEN 0
          WHEN EXISTS (SELECT 1 FROM producto_codigo pc WHERE pc.producto_id = p.id AND pc.valor ILIKE ${term + '%'}) THEN 1
          ELSE 2
        END AS rango,
        similarity(unaccent(p.nombre), unaccent(${term})) AS sim
      FROM producto p
      WHERE p.tenant_id = ${ctx.tenantId}::uuid
        AND p.estado = 'ACTIVO'
        AND (
          EXISTS (SELECT 1 FROM producto_codigo pc WHERE pc.producto_id = p.id AND pc.valor ILIKE ${like})
          OR unaccent(p.nombre) ILIKE unaccent(${like})
          OR unaccent(coalesce(p.descripcion, '')) ILIKE unaccent(${like})
          OR similarity(unaccent(p.nombre), unaccent(${term})) > 0.3
          OR EXISTS (SELECT 1 FROM marca m WHERE m.id = p.marca_id AND m.nombre ILIKE ${like})
        )
      ORDER BY rango ASC, sim DESC, p.nombre ASC
      LIMIT ${Math.min(limit, 25)}
    `);
    if (!filas.length) return { datos: [] };
    const ids = filas.map((f) => f.id);
    const productos = await this.prisma.producto.findMany({ where: { id: { in: ids } }, include: INCLUDE_PRODUCTO });
    const porId = new Map(productos.map((p) => [p.id, p]));
    return { datos: ids.map((id) => porId.get(id)).filter(Boolean) };
  }

  async listar(ctx: Ctx, f: { q?: string; categoriaId?: string; marcaId?: string; estado?: string; limit?: string; cursor?: string }) {
    const take = Math.min(Number(f.limit) || 30, 100);
    const where: Prisma.ProductoWhereInput = {
      tenantId: ctx.tenantId,
      ...(f.estado ? { estado: f.estado as 'ACTIVO' | 'DESCONTINUADO' } : {}),
      ...(f.categoriaId ? { categoriaId: f.categoriaId } : {}),
      ...(f.marcaId ? { marcaId: f.marcaId } : {}),
      ...(f.q
        ? {
            OR: [
              { nombre: { contains: f.q, mode: 'insensitive' } },
              { sku: { contains: f.q, mode: 'insensitive' } },
              { codigos: { some: { valor: { contains: f.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const filas = await this.prisma.producto.findMany({
      where,
      include: INCLUDE_PRODUCTO,
      orderBy: { nombre: 'asc' },
      take: take + 1,
      ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    });
    const hayMas = filas.length > take;
    return { datos: filas.slice(0, take), next_cursor: hayMas ? filas[take - 1].id : null };
  }

  async obtener(ctx: Ctx, id: string) {
    const p = await this.prisma.producto.findFirst({ where: { id, tenantId: ctx.tenantId }, include: INCLUDE_PRODUCTO });
    if (!p) throw err.noEncontrado('El producto');
    return p;
  }

  /** Valida valores EAV contra las definiciones de la categoría (ADR-DB-001). */
  private async validarAtributos(categoriaId: string | null | undefined, atributos: AtributoValorDto[] | undefined, exigirRequeridos: boolean) {
    if (!categoriaId) {
      if (atributos?.length) throw err.validacion('El producto no tiene categoría; no se pueden asignar atributos.');
      return [];
    }
    const defs = await this.prisma.atributoDef.findMany({ where: { categoriaId } });
    const porId = new Map(defs.map((d) => [d.id, d]));
    const filas: Array<{ atributoDefId: string; valorTexto: string | null; valorNumero: Prisma.Decimal | null; valorBool: boolean | null }> = [];
    for (const a of atributos ?? []) {
      const def = porId.get(a.atributoDefId);
      if (!def) throw err.validacion('Atributo no pertenece a la categoría del producto.', [{ atributoDefId: a.atributoDefId }]);
      const v = a.valor;
      if (v === null || v === undefined || v === '') continue;
      switch (def.tipo) {
        case AtributoTipo.NUMERO: {
          const n = Number(v);
          if (!isFinite(n)) throw err.validacion(`El atributo "${def.nombre}" debe ser numérico.`);
          filas.push({ atributoDefId: def.id, valorTexto: null, valorNumero: D(n), valorBool: null });
          break;
        }
        case AtributoTipo.BOOLEANO:
          if (typeof v !== 'boolean') throw err.validacion(`El atributo "${def.nombre}" debe ser sí/no.`);
          filas.push({ atributoDefId: def.id, valorTexto: null, valorNumero: null, valorBool: v });
          break;
        case AtributoTipo.LISTA:
          if (typeof v !== 'string' || !def.opciones.includes(v))
            throw err.validacion(`El atributo "${def.nombre}" debe ser una de las opciones: ${def.opciones.join(', ')}.`);
          filas.push({ atributoDefId: def.id, valorTexto: v, valorNumero: null, valorBool: null });
          break;
        default:
          if (typeof v !== 'string') throw err.validacion(`El atributo "${def.nombre}" debe ser texto.`);
          filas.push({ atributoDefId: def.id, valorTexto: v, valorNumero: null, valorBool: null });
      }
    }
    if (exigirRequeridos) {
      const presentes = new Set(filas.map((f) => f.atributoDefId));
      const faltantes = defs.filter((d) => d.requerido && !presentes.has(d.id));
      if (faltantes.length)
        throw err.validacion('Faltan atributos requeridos.', faltantes.map((d) => ({ atributo: d.nombre })));
    }
    return filas;
  }

  async crear(ctx: Ctx, dto: CrearProductoDto) {
    const sku = dto.sku.trim();
    const atributos = await this.validarAtributos(dto.categoriaId, dto.atributos, true);
    for (const s of dto.stockInicial ?? []) {
      if (!ctx.sucursalIds.includes(s.sucursalId)) throw err.sucursalNoAutorizada();
    }

    const producto = await this.prisma.$transaction(async (tx) => {
      const p = await tx.producto.create({
        data: {
          tenantId: ctx.tenantId,
          sku,
          nombre: dto.nombre.trim(),
          descripcion: dto.descripcion,
          tipo: dto.tipo ?? 'GENERAL',
          categoriaId: dto.categoriaId,
          marcaId: dto.marcaId,
          unidadMedidaId: dto.unidadMedidaId,
          precioBase: dto.precioBase,
          tasaItbms: dto.tasaItbms ?? '0.07',
          ventaFraccionada: dto.ventaFraccionada ?? false,
          stockMinimo: dto.stockMinimo ?? '0',
          datosExtra: (dto.datosExtra as Prisma.InputJsonValue) ?? undefined,
        },
      });
      // Código interno = SKU, prioritario en búsqueda (D-028/D-021) + códigos adicionales (RN-021)
      const codigos = [{ tipo: CodigoTipo.INTERNO, valor: sku, principal: true }, ...(dto.codigos ?? [])];
      for (const c of codigos) {
        await tx.productoCodigo.create({
          data: { tenantId: ctx.tenantId, productoId: p.id, tipo: c.tipo, valor: c.valor.trim(), principal: 'principal' in c ? !!c.principal : false },
        });
      }
      if (atributos.length) {
        await tx.productoAtributo.createMany({ data: atributos.map((a) => ({ ...a, productoId: p.id })) });
      }
      for (const s of dto.stockInicial ?? []) {
        await this.inventario.aplicarMovimiento(tx, {
          tenantId: ctx.tenantId,
          productoId: p.id,
          sucursalId: s.sucursalId,
          tipo: 'ENTRADA_INICIAL',
          cantidad: D(s.cantidad),
          costoUnitario: D(s.costoUnitario),
          refTipo: 'AJUSTE',
          motivo: 'Stock inicial al crear el producto',
          usuarioId: ctx.usuarioId,
        });
      }
      await this.auditoria.registrar(tx, {
        tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, accion: 'producto.crear', entidad: 'producto', entidadId: p.id,
        estadoNuevo: { sku, nombre: p.nombre, precioBase: dto.precioBase }, ip: ctx.ip,
      });
      return p;
    }, { timeout: 15000, maxWait: 10000 });

    return this.obtener(ctx, producto.id);
  }

  async actualizar(ctx: Ctx, id: string, dto: ActualizarProductoDto) {
    const previo = await this.obtener(ctx, id);
    const categoriaId = dto.categoriaId ?? previo.categoriaId;
    const atributos = dto.atributos ? await this.validarAtributos(categoriaId, dto.atributos, false) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.producto.update({
        where: { id },
        data: {
          nombre: dto.nombre?.trim(),
          descripcion: dto.descripcion,
          tipo: dto.tipo,
          categoriaId: dto.categoriaId,
          marcaId: dto.marcaId,
          unidadMedidaId: dto.unidadMedidaId,
          precioBase: dto.precioBase,
          tasaItbms: dto.tasaItbms,
          ventaFraccionada: dto.ventaFraccionada,
          stockMinimo: dto.stockMinimo,
          estado: dto.estado,
          datosExtra: dto.datosExtra as Prisma.InputJsonValue | undefined,
        },
      });
      if (dto.codigos) {
        // Reemplaza códigos NO internos; el código interno (SKU) es inmutable (RN-022/D-028)
        await tx.productoCodigo.deleteMany({ where: { productoId: id, NOT: { tipo: CodigoTipo.INTERNO } } });
        for (const c of dto.codigos.filter((c) => c.tipo !== CodigoTipo.INTERNO)) {
          await tx.productoCodigo.create({ data: { tenantId: ctx.tenantId, productoId: id, tipo: c.tipo, valor: c.valor.trim() } });
        }
      }
      if (atributos) {
        await tx.productoAtributo.deleteMany({ where: { productoId: id } });
        if (atributos.length) await tx.productoAtributo.createMany({ data: atributos.map((a) => ({ ...a, productoId: id })) });
      }
      await this.auditoria.registrar(tx, {
        tenantId: ctx.tenantId, usuarioId: ctx.usuarioId, accion: dto.estado === 'DESCONTINUADO' ? 'producto.descontinuar' : 'producto.editar',
        entidad: 'producto', entidadId: id,
        estadoAnterior: { nombre: previo.nombre, precioBase: previo.precioBase, estado: previo.estado },
        estadoNuevo: dto as unknown as Record<string, unknown>, ip: ctx.ip,
      });
    }, { timeout: 15000, maxWait: 10000 });

    return this.obtener(ctx, id);
  }
}
