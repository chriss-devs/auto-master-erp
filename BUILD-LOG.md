# BUILD-LOG — ERP Auto Master Colón (MVP Fase 0 + Fase 1)

Registro de construcción, decisiones y supuestos. Complementa (nunca contradice) `auto-master-documentacion/`.
Fuente de verdad de diseño: PROJECT_CONTEXT.md, DECISIONS.md (D-001…D-041), DECISIONES-PENDIENTES.md (§1.6), 02/03/04/06/07/08/09/10/11/12/13/14, 16-decisions.

- **Fecha de inicio:** 2026-07-06
- **Constructor:** Claude (ingeniero full-stack autónomo)
- **Repo:** https://github.com/chriss-devs/auto-master-erp *(se confirma al crear)*

---

## 1. Decisiones de implementación (BL-xxx)

Cada decisión cita las reglas/documentos que la sustentan. Ninguna contradice DECISIONS.md.

### BL-001 · El schema.prisma base referido no existe → se crea desde 07-database-design
La ruta `auto-master-documentacion/implementacion/prisma/schema.prisma` no existe en el repo de documentación (verificado con búsqueda global de `*.prisma`). Se crea el esquema desde cero siguiendo fielmente 07 §2–§11 (ERD, EAV híbrido ADR-DB-001/D-003, stock materializado + `movimiento_inv` D-002/RN-003..006, tablas de venta/factura/caja de 07 §5, RBAC/sesión/auditoría de 07 §8, `tenant_id` en todas las entidades de negocio sin activar multiempresa, 07 §11).

### BL-002 · Nomenclatura: modelos en español (como la documentación), tablas snake_case
El prompt permite "inglés o como en schema.prisma"; al no existir schema base, se usa la nomenclatura de 07-database-design y 08-api-design (producto, venta, movimiento_inv, caja_sesion…) para trazabilidad 1:1 con la documentación. Código de infraestructura (servicios, variables) en inglés técnico donde no hay término del dominio.

### BL-003 · Hash de contraseñas: bcryptjs (cost 10)
09 §2 exige Argon2id **o bcrypt** (RN-185: "Argon2/bcrypt"). Se elige `bcryptjs` (JS puro) para eliminar riesgo de módulos nativos en Vercel serverless. Ajustable a argon2 sin rediseño (columna `password_hash` agnóstica).

### BL-004 · Sesiones: cookie httpOnly + token opaco en tabla `sesion` (sin JWT en MVP)
ADR-SEC-001 (09 §2) propone "cookies httpOnly para la web; JWT para móvil/integraciones". El MVP es solo web ⇒ cookie httpOnly `am_session` con token opaco (48 bytes aleatorios, se guarda SHA-256 en `sesion`), expiración 12 h, revocable (RN-184). JWT queda como extensión futura sin rediseño.

### BL-005 · Topología de despliegue: Vercel (web + api) + Supabase Postgres
ADR-DEP-001 elige PaaS gestionado. Infra ordenada por el dueño: Vercel + Supabase. Dos proyectos Vercel desde el mismo repo: `apps/web` (Next.js) y `apps/api` (NestJS como función serverless con bootstrap cacheado). El diagrama de 14 §3 (contenedores/Redis/Cloudflare) queda como topología objetivo post-MVP; Redis no es necesario en MVP (cache/colas no críticas, ADR-005 "cache después").

### BL-006 · El web proxya `/api/*` hacia el backend (cookies de primera parte)
`*.vercel.app` está en la Public Suffix List ⇒ una cookie emitida por el dominio del api sería de terceros para el web. Solución: `rewrites` de Next.js (`/api/:path*` → API_ORIGIN) ⇒ el navegador solo habla con el dominio del web y la cookie httpOnly es de primera parte. CORS queda restringido y simple.

### BL-007 · Monorepo con npm workspaces (sin pnpm/turbo)
pnpm no está instalado en la máquina de build; npm workspaces cubre la necesidad (dos apps). Sin paquete `shared`: las constantes de permisos viven en el api (fuente de verdad: BD) y el web las recibe por `/auth/me`.

### BL-008 · Venta en dos pasos (D-020) — contrato API
- `POST /api/v1/ventas` (permiso `ventas:crear`, `Idempotency-Key`) crea la venta en estado **PREPARACION** (valida stock como advertencia, no reserva — Q-017: sin reservas).
- `POST /api/v1/ventas/{id}/cobrar` (permiso `caja:operar`, `Idempotency-Key` obligatoria) ejecuta en **una transacción**: revalida stock (RN-007, 409 `STOCK_INSUFICIENTE` si falta), descuenta `stock`, inserta `movimiento_inv` (salida_venta, costo = promedio vigente), registra `venta_pago` + `caja_movimiento` en la sesión de caja abierta (RN-120/123: sin caja abierta ⇒ 422 `CAJA_NO_ABIERTA`), calcula vuelto, crea `factura` vía FacturacionService (stub, nunca bloquea) y escribe `auditoria`. Estado final **COBRADA**.
- Reintento con la misma Idempotency-Key devuelve el mismo resultado sin duplicar efectos (08 §8). `POST /ventas/{id}/cancelar` para abandonar una PREPARACION (soft, RN-183).

### BL-009 · Facturación: StubPacProvider (Q-002 sin PAC elegido)
`FacturacionService` depende de la interfaz `PacProvider` (D-012, 08 §6). `StubPacProvider` marca la factura **PENDIENTE_TRANSMISION** (modo contingencia RF-FAC-005/RN-104), genera CUFE simulado (`FE-SIM-` + hash) y datos para representación impresa **tamaño carta** en HTML con CSS de impresión (Q-023 sin resolver ⇒ default carta, registrado aquí). La venta nunca se bloquea por facturación.

### BL-010 · ITBMS por línea (RN-024/042)
`base_linea = round2(precio_unitario × cantidad) − descuento_linea`; `itbms_linea = round2(base_linea × tasa_producto)`; totales = suma de líneas. Redondeo half-up a 2 decimales. Tasa default 7% configurable por producto (0%, 7%, 10%, 15%). Dinero en `Decimal` (numeric), nunca float; en JSON viaja como string decimal (08 §2).

### BL-011 · Costeo promedio ponderado (D-007/RN-009)
`stock.costo_promedio` por (producto, sucursal). Entradas: `nuevo = (qty_actual×costo_actual + qty_in×costo_in) / (qty_actual+qty_in)` (si qty_actual ≤ 0 ⇒ toma costo_in). Salidas: usan el promedio vigente como `costo_unitario` del movimiento. Correcciones = movimientos nuevos, nunca UPDATE/DELETE de `movimiento_inv` (RN-005/006).

### BL-012 · Búsqueda de productos (D-004/D-021/D-028)
Prioridad: (1) match exacto de código (`producto_codigo.valor`, incluye el **código interno** conservado), (2) prefijo de código, (3) `ILIKE`/trigram sobre nombre y descripción con extensión `pg_trgm` + `unaccent`. Índices GIN. As-you-type con debounce; resultado muestra stock por sucursal (visibilidad cruzada D-030) y precio.

### BL-013 · Componentes UI estilo shadcn escritos a mano
Se usa Tailwind v4 + componentes propios estilo shadcn/ui (button, input, dialog, table, badge…) para control total y cero fricción de CLI. Tokens de 11 §2.1: fondo blanco, primario azul (#1D4ED8 aprox. hasta recibir hex de marca), acento/danger rojo, texto #111827, muted #6B7280; tema claro por defecto (Q-046).

### BL-014 · Infra por defecto
Supabase: plan free, región `us-east-1` (cercana a Panamá). Vercel: plan del usuario conectado. TZ de negocio `America/Panama` (UTC-5, sin DST); moneda `PAB` mostrada como `B/.`. Retención y PITR según plan free (Q-041 ajustado a lo que el plan permita — registrado como limitación).

### BL-015 · Pruebas
Unit (puras): cálculo ITBMS, costo promedio, vuelto. Integración (BD real): no vender sin stock; cobro atómico actualiza stock+movimiento+caja+auditoría; idempotencia de cobro; RBAC 403. En CI: Postgres service + `prisma db push`. Local: `TEST_DATABASE_URL` (datos autocontenidos por corrida).

### BL-016 · Numeración de documentos (Q-022)
Consecutiva por punto de emisión (= sucursal en MVP): tabla `secuencia_documento` (tenant, sucursal, tipo, próximo) con incremento dentro de la transacción de cobro. Formato visible: `V-0001-00000123` (tipo-sucursal-consecutivo).

---

## 2. Credenciales temporales (SOLO desarrollo/entrega)

> ⚠️ Cambiar en el primer inicio de sesión real. No hay datos productivos aún.

- **Usuario admin:** `admin` — contraseña temporal: *(se registra al sembrar)*

## 3. Infraestructura

- **GitHub:** *(pendiente)*
- **Supabase:** *(pendiente)*
- **Vercel web:** *(pendiente)*
- **Vercel api:** *(pendiente)*

## 4. Bitácora

- 2026-07-06 · Leída documentación completa (indexada); creado monorepo y task list; verificado BL-001.
