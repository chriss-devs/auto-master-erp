import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested,
} from 'class-validator';
import { MetodoPago } from '@prisma/client';

const MONEY = /^\d+(\.\d{1,2})?$/;
const QTY = /^\d+(\.\d{1,3})?$/;

export class LineaVentaDto {
  @IsUUID() productoId: string;
  @Matches(QTY, { message: 'Cantidad inválida (hasta 3 decimales).' }) cantidad: string;
  @IsOptional() @Matches(MONEY, { message: 'Descuento inválido (monto en B/.).' }) descuento?: string;
}

export class AutorizacionDto {
  @IsString() @IsNotEmpty() usuario: string;
  @IsString() @IsNotEmpty() password: string;
}

export class CrearVentaDto {
  @IsOptional() @IsUUID() clienteId?: string;
  @IsOptional() @IsUUID() sucursalId?: string;
  @IsArray() @ArrayMinSize(1, { message: 'La venta necesita al menos una línea.' })
  @ValidateNested({ each: true }) @Type(() => LineaVentaDto)
  lineas: LineaVentaDto[];
  @IsOptional() @IsString() @MaxLength(500) notas?: string;
  @IsOptional() @IsString() @MaxLength(80) idempotencyKey?: string;
  /** Requerida si el descuento supera el umbral y quien vende no tiene descuentos:aplicar_extra (RN-160). */
  @IsOptional() @ValidateNested() @Type(() => AutorizacionDto) autorizacion?: AutorizacionDto;
}

export class ActualizarLineasDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LineaVentaDto)
  lineas: LineaVentaDto[];
  @IsOptional() @IsUUID() clienteId?: string;
  @IsOptional() @IsString() @MaxLength(500) notas?: string;
  @IsOptional() @ValidateNested() @Type(() => AutorizacionDto) autorizacion?: AutorizacionDto;
}

export class PagoDto {
  @IsEnum(MetodoPago) metodo: MetodoPago;
  @Matches(MONEY, { message: 'Monto de pago inválido.' }) monto: string;
  @IsOptional() @IsString() @MaxLength(120) referencia?: string;
}

export class CobrarVentaDto {
  @IsArray() @ArrayMinSize(1, { message: 'Indique al menos un pago.' })
  @ValidateNested({ each: true }) @Type(() => PagoDto)
  pagos: PagoDto[];
  @IsOptional() @Matches(MONEY) efectivoRecibido?: string;
  @IsString() @IsNotEmpty({ message: 'Idempotency-Key es obligatoria para cobrar (08 §8).' }) @MaxLength(80)
  idempotencyKey: string;
}

export class CancelarVentaDto {
  @IsString() @IsNotEmpty({ message: 'Indique el motivo de la cancelación.' }) @MaxLength(300) motivo: string;
}
