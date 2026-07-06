-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "tipo_producto" AS ENUM ('FERRETERIA', 'AUTOPARTE', 'GENERAL');

-- CreateEnum
CREATE TYPE "producto_estado" AS ENUM ('ACTIVO', 'DESCONTINUADO');

-- CreateEnum
CREATE TYPE "atributo_tipo" AS ENUM ('TEXTO', 'NUMERO', 'BOOLEANO', 'LISTA');

-- CreateEnum
CREATE TYPE "codigo_tipo" AS ENUM ('INTERNO', 'BARRA', 'OEM', 'PARTE', 'PROVEEDOR', 'OTRO');

-- CreateEnum
CREATE TYPE "mov_tipo" AS ENUM ('ENTRADA_COMPRA', 'ENTRADA_INICIAL', 'SALIDA_VENTA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA', 'TRANSFER_SALIDA', 'TRANSFER_ENTRADA', 'DEVOLUCION_ENTRADA', 'MERMA');

-- CreateEnum
CREATE TYPE "ref_tipo" AS ENUM ('VENTA', 'COMPRA', 'TRANSFERENCIA', 'AJUSTE', 'SEED');

-- CreateEnum
CREATE TYPE "cliente_tipo" AS ENUM ('CONSUMIDOR_FINAL', 'NATURAL', 'JURIDICO');

-- CreateEnum
CREATE TYPE "venta_estado" AS ENUM ('PREPARACION', 'COBRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "metodo_pago" AS ENUM ('EFECTIVO', 'TARJETA', 'YAPPY', 'ACH');

-- CreateEnum
CREATE TYPE "factura_estado" AS ENUM ('PENDIENTE_TRANSMISION', 'EMITIDA', 'AUTORIZADA', 'RECHAZADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "caja_estado" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "caja_mov_tipo" AS ENUM ('APERTURA', 'VENTA', 'INGRESO', 'EGRESO', 'RETIRO');

-- CreateEnum
CREATE TYPE "doc_tipo" AS ENUM ('VENTA', 'FACTURA', 'NOTA_CREDITO');

-- CreateTable
CREATE TABLE "tenant" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "razon_social" TEXT,
    "ruc" TEXT,
    "dv" TEXT,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sucursal" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "telefono" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "usuario" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "debe_cambiar_clave" BOOLEAN NOT NULL DEFAULT false,
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" TIMESTAMP(3),
    "ultimo_login_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rol" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "es_sistema" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permiso" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rol_permiso" (
    "rol_id" UUID NOT NULL,
    "permiso_id" UUID NOT NULL,

    CONSTRAINT "rol_permiso_pkey" PRIMARY KEY ("rol_id","permiso_id")
);

-- CreateTable
CREATE TABLE "usuario_rol" (
    "usuario_id" UUID NOT NULL,
    "rol_id" UUID NOT NULL,

    CONSTRAINT "usuario_rol_pkey" PRIMARY KEY ("usuario_id","rol_id")
);

-- CreateTable
CREATE TABLE "usuario_sucursal" (
    "usuario_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,

    CONSTRAINT "usuario_sucursal_pkey" PRIMARY KEY ("usuario_id","sucursal_id")
);

-- CreateTable
CREATE TABLE "sesion" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "sucursal_activa_id" UUID,
    "ip" TEXT,
    "user_agent" TEXT,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "revocada_en" TIMESTAMP(3),

    CONSTRAINT "sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "padre_id" UUID,
    "nombre" TEXT NOT NULL,
    "tipo" "tipo_producto" NOT NULL DEFAULT 'GENERAL',
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marca" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "marca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidad_medida" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "permite_decimales" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "unidad_medida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atributo_def" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "categoria_id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "atributo_tipo" NOT NULL DEFAULT 'TEXTO',
    "unidad" TEXT,
    "opciones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requerido" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "atributo_def_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" "tipo_producto" NOT NULL DEFAULT 'GENERAL',
    "categoria_id" UUID,
    "marca_id" UUID,
    "unidad_medida_id" UUID NOT NULL,
    "precio_base" DECIMAL(12,2) NOT NULL,
    "tasa_itbms" DECIMAL(5,4) NOT NULL DEFAULT 0.07,
    "venta_fraccionada" BOOLEAN NOT NULL DEFAULT false,
    "stock_minimo" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "estado" "producto_estado" NOT NULL DEFAULT 'ACTIVO',
    "datos_extra" JSONB,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_codigo" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "tipo" "codigo_tipo" NOT NULL,
    "valor" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "producto_codigo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_atributo" (
    "id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "atributo_def_id" UUID NOT NULL,
    "valor_texto" TEXT,
    "valor_numero" DECIMAL(14,4),
    "valor_bool" BOOLEAN,

    CONSTRAINT "producto_atributo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compat_vehiculo" (
    "id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "anio_desde" INTEGER,
    "anio_hasta" INTEGER,
    "motor" TEXT,
    "notas" TEXT,

    CONSTRAINT "compat_vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock" (
    "producto_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "costo_promedio" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_pkey" PRIMARY KEY ("producto_id","sucursal_id")
);

-- CreateTable
CREATE TABLE "movimiento_inv" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "tipo" "mov_tipo" NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "costo_unitario" DECIMAL(12,4) NOT NULL,
    "saldo_resultante" DECIMAL(12,3) NOT NULL,
    "ref_tipo" "ref_tipo",
    "ref_id" UUID,
    "motivo" TEXT,
    "usuario_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_inv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tipo" "cliente_tipo" NOT NULL DEFAULT 'NATURAL',
    "nombre" TEXT NOT NULL,
    "ruc_o_cedula" TEXT,
    "dv" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precio_especial" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "precio_especial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedor" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "ruc" TEXT,
    "dv" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "numero" TEXT,
    "estado" "venta_estado" NOT NULL DEFAULT 'PREPARACION',
    "cliente_id" UUID NOT NULL,
    "vendedor_id" UUID NOT NULL,
    "cajero_id" UUID,
    "caja_sesion_id" UUID,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "descuento_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "itbms_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "efectivo_recibido" DECIMAL(12,2),
    "vuelto" DECIMAL(12,2),
    "notas" TEXT,
    "descuento_autorizado_por_id" UUID,
    "idempotency_key" TEXT,
    "cobro_idempotency_key" TEXT,
    "cobrada_en" TIMESTAMP(3),
    "cancelada_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_linea" (
    "id" UUID NOT NULL,
    "venta_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "precio_lista" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "base_gravable" DECIMAL(12,2) NOT NULL,
    "tasa_itbms" DECIMAL(5,4) NOT NULL,
    "itbms_linea" DECIMAL(12,2) NOT NULL,
    "total_linea" DECIMAL(12,2) NOT NULL,
    "costo_unitario" DECIMAL(12,4),
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "venta_linea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_pago" (
    "id" UUID NOT NULL,
    "venta_id" UUID NOT NULL,
    "metodo" "metodo_pago" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "referencia" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venta_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factura" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "venta_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "punto_emision" TEXT NOT NULL,
    "estado" "factura_estado" NOT NULL DEFAULT 'PENDIENTE_TRANSMISION',
    "cufe" TEXT,
    "url_qr" TEXT,
    "pac_proveedor" TEXT NOT NULL DEFAULT 'STUB',
    "pac_respuesta" JSONB,
    "snapshot" JSONB NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_error" TEXT,
    "emitida_en" TIMESTAMP(3),
    "autorizada_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "factura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja_sesion" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "estado" "caja_estado" NOT NULL DEFAULT 'ABIERTA',
    "usuario_apertura_id" UUID NOT NULL,
    "usuario_cierre_id" UUID,
    "monto_inicial" DECIMAL(12,2) NOT NULL,
    "notas_apertura" TEXT,
    "notas_cierre" TEXT,
    "cuadre" JSONB,
    "descuadre_total" DECIMAL(12,2),
    "abierta_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrada_en" TIMESTAMP(3),

    CONSTRAINT "caja_sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja_movimiento" (
    "id" UUID NOT NULL,
    "caja_sesion_id" UUID NOT NULL,
    "tipo" "caja_mov_tipo" NOT NULL,
    "metodo" "metodo_pago",
    "monto" DECIMAL(12,2) NOT NULL,
    "venta_id" UUID,
    "motivo" TEXT,
    "usuario_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caja_movimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secuencia_documento" (
    "tenant_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "tipo" "doc_tipo" NOT NULL,
    "proximo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "secuencia_documento_pkey" PRIMARY KEY ("tenant_id","sucursal_id","tipo")
);

-- CreateTable
CREATE TABLE "configuracion" (
    "tenant_id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,

    CONSTRAINT "configuracion_pkey" PRIMARY KEY ("tenant_id","clave")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "usuario_id" UUID,
    "sucursal_id" UUID,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT,
    "estado_anterior" JSONB,
    "estado_nuevo" JSONB,
    "ip" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sucursal_tenant_id_codigo_key" ON "sucursal"("tenant_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_tenant_id_usuario_key" ON "usuario"("tenant_id", "usuario");

-- CreateIndex
CREATE UNIQUE INDEX "rol_tenant_id_codigo_key" ON "rol"("tenant_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "permiso_codigo_key" ON "permiso"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_token_hash_key" ON "sesion"("token_hash");

-- CreateIndex
CREATE INDEX "sesion_usuario_id_idx" ON "sesion"("usuario_id");

-- CreateIndex
CREATE INDEX "categoria_tenant_id_idx" ON "categoria"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "marca_tenant_id_nombre_key" ON "marca"("tenant_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "unidad_medida_tenant_id_codigo_key" ON "unidad_medida"("tenant_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "atributo_def_categoria_id_clave_key" ON "atributo_def"("categoria_id", "clave");

-- CreateIndex
CREATE INDEX "producto_tenant_id_nombre_idx" ON "producto"("tenant_id", "nombre");

-- CreateIndex
CREATE INDEX "producto_tenant_id_estado_idx" ON "producto"("tenant_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "producto_tenant_id_sku_key" ON "producto"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "producto_codigo_tenant_id_valor_idx" ON "producto_codigo"("tenant_id", "valor");

-- CreateIndex
CREATE UNIQUE INDEX "producto_codigo_tenant_id_tipo_valor_key" ON "producto_codigo"("tenant_id", "tipo", "valor");

-- CreateIndex
CREATE INDEX "producto_atributo_atributo_def_id_valor_numero_idx" ON "producto_atributo"("atributo_def_id", "valor_numero");

-- CreateIndex
CREATE UNIQUE INDEX "producto_atributo_producto_id_atributo_def_id_key" ON "producto_atributo"("producto_id", "atributo_def_id");

-- CreateIndex
CREATE INDEX "compat_vehiculo_producto_id_idx" ON "compat_vehiculo"("producto_id");

-- CreateIndex
CREATE INDEX "stock_sucursal_id_idx" ON "stock"("sucursal_id");

-- CreateIndex
CREATE INDEX "movimiento_inv_producto_id_sucursal_id_creado_en_idx" ON "movimiento_inv"("producto_id", "sucursal_id", "creado_en");

-- CreateIndex
CREATE INDEX "movimiento_inv_ref_tipo_ref_id_idx" ON "movimiento_inv"("ref_tipo", "ref_id");

-- CreateIndex
CREATE INDEX "movimiento_inv_tenant_id_creado_en_idx" ON "movimiento_inv"("tenant_id", "creado_en");

-- CreateIndex
CREATE INDEX "cliente_tenant_id_nombre_idx" ON "cliente"("tenant_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "precio_especial_cliente_id_producto_id_key" ON "precio_especial"("cliente_id", "producto_id");

-- CreateIndex
CREATE INDEX "proveedor_tenant_id_nombre_idx" ON "proveedor"("tenant_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "venta_idempotency_key_key" ON "venta"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "venta_cobro_idempotency_key_key" ON "venta"("cobro_idempotency_key");

-- CreateIndex
CREATE INDEX "venta_tenant_id_sucursal_id_creado_en_idx" ON "venta"("tenant_id", "sucursal_id", "creado_en");

-- CreateIndex
CREATE INDEX "venta_tenant_id_estado_idx" ON "venta"("tenant_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "venta_tenant_id_numero_key" ON "venta"("tenant_id", "numero");

-- CreateIndex
CREATE INDEX "venta_linea_venta_id_idx" ON "venta_linea"("venta_id");

-- CreateIndex
CREATE INDEX "venta_pago_venta_id_idx" ON "venta_pago"("venta_id");

-- CreateIndex
CREATE UNIQUE INDEX "factura_venta_id_key" ON "factura"("venta_id");

-- CreateIndex
CREATE INDEX "factura_tenant_id_estado_idx" ON "factura"("tenant_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "factura_tenant_id_numero_key" ON "factura"("tenant_id", "numero");

-- CreateIndex
CREATE INDEX "caja_sesion_tenant_id_sucursal_id_estado_idx" ON "caja_sesion"("tenant_id", "sucursal_id", "estado");

-- CreateIndex
CREATE INDEX "caja_movimiento_caja_sesion_id_idx" ON "caja_movimiento"("caja_sesion_id");

-- CreateIndex
CREATE INDEX "auditoria_entidad_entidad_id_creado_en_idx" ON "auditoria"("entidad", "entidad_id", "creado_en");

-- CreateIndex
CREATE INDEX "auditoria_tenant_id_creado_en_idx" ON "auditoria"("tenant_id", "creado_en");

-- AddForeignKey
ALTER TABLE "sucursal" ADD CONSTRAINT "sucursal_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol" ADD CONSTRAINT "rol_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "permiso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_sucursal" ADD CONSTRAINT "usuario_sucursal_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_sucursal" ADD CONSTRAINT "usuario_sucursal_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categoria" ADD CONSTRAINT "categoria_padre_id_fkey" FOREIGN KEY ("padre_id") REFERENCES "categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atributo_def" ADD CONSTRAINT "atributo_def_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_unidad_medida_id_fkey" FOREIGN KEY ("unidad_medida_id") REFERENCES "unidad_medida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_codigo" ADD CONSTRAINT "producto_codigo_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_atributo" ADD CONSTRAINT "producto_atributo_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_atributo" ADD CONSTRAINT "producto_atributo_atributo_def_id_fkey" FOREIGN KEY ("atributo_def_id") REFERENCES "atributo_def"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compat_vehiculo" ADD CONSTRAINT "compat_vehiculo_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inv" ADD CONSTRAINT "movimiento_inv_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inv" ADD CONSTRAINT "movimiento_inv_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precio_especial" ADD CONSTRAINT "precio_especial_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precio_especial" ADD CONSTRAINT "precio_especial_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_linea" ADD CONSTRAINT "venta_linea_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_linea" ADD CONSTRAINT "venta_linea_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_pago" ADD CONSTRAINT "venta_pago_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factura" ADD CONSTRAINT "factura_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factura" ADD CONSTRAINT "factura_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_sesion" ADD CONSTRAINT "caja_sesion_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_movimiento" ADD CONSTRAINT "caja_movimiento_caja_sesion_id_fkey" FOREIGN KEY ("caja_sesion_id") REFERENCES "caja_sesion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_movimiento" ADD CONSTRAINT "caja_movimiento_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

