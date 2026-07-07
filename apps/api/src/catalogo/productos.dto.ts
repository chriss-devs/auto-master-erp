import { Type } from 'class-transformer';
import {
  Allow, IsArray, IsBoolean, IsEnum, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested,
} from 'class-validator';
import { CodigoTipo, TipoProducto } from '@prisma/client';

export const MONEY = /^\d+(\.\d{1,2})?$/;
export const QTY = /^\d+(\.\d{1,3})?$/;
export const COSTO = /^\d+(\.\d{1,4})?$/;
export const TASA = /^0(\.\d{1,4})?$/;

export class CodigoDto {
  @IsEnum(CodigoTipo) tipo: CodigoTipo;
  @IsString() @IsNotEmpty() @MaxLength(80) valor: string;
}

export class AtributoValorDto {
  @IsUUID() atributoDefId: string;
  // string | number | boolean — se valida contra la definición (tipo) en el servicio
  @Allow() valor: unknown;
}

export class StockInicialDto {
  @IsUUID() sucursalId: string;
  @Matches(QTY) cantidad: string;
  @Matches(COSTO) costoUnitario: string;
}

export class CrearProductoDto {
  @IsString() @IsNotEmpty() @MaxLength(40) sku: string;
  @IsString() @IsNotEmpty() @MaxLength(200) nombre: string;
  @IsOptional() @IsString() @MaxLength(2000) descripcion?: string;
  @IsOptional() @IsEnum(TipoProducto) tipo?: TipoProducto;
  @IsOptional() @IsUUID() categoriaId?: string;
  @IsOptional() @IsUUID() marcaId?: string;
  @IsUUID() unidadMedidaId: string;
  @Matches(MONEY, { message: 'Precio inválido (máx. 2 decimales).' }) precioBase: string;
  @IsOptional() @Matches(TASA, { message: 'Tasa ITBMS inválida (ej. 0.07).' }) tasaItbms?: string;
  @IsOptional() @IsBoolean() ventaFraccionada?: boolean;
  @IsOptional() @Matches(QTY) stockMinimo?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CodigoDto) codigos?: CodigoDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AtributoValorDto) atributos?: AtributoValorDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => StockInicialDto) stockInicial?: StockInicialDto[];
  @IsOptional() @IsObject() datosExtra?: Record<string, unknown>;
}

export class ActualizarProductoDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) nombre?: string;
  @IsOptional() @IsString() @MaxLength(2000) descripcion?: string;
  @IsOptional() @IsEnum(TipoProducto) tipo?: TipoProducto;
  @IsOptional() @IsUUID() categoriaId?: string;
  @IsOptional() @IsUUID() marcaId?: string;
  @IsOptional() @IsUUID() unidadMedidaId?: string;
  @IsOptional() @Matches(MONEY) precioBase?: string;
  @IsOptional() @Matches(TASA) tasaItbms?: string;
  @IsOptional() @IsBoolean() ventaFraccionada?: boolean;
  @IsOptional() @Matches(QTY) stockMinimo?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CodigoDto) codigos?: CodigoDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AtributoValorDto) atributos?: AtributoValorDto[];
  @IsOptional() @IsObject() datosExtra?: Record<string, unknown>;
  @IsOptional() @IsIn(['ACTIVO', 'DESCONTINUADO']) estado?: 'ACTIVO' | 'DESCONTINUADO';
}
