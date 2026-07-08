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

### BL-007 · Monorepo simple: dos apps independientes (sin npm workspaces)
pnpm no está instalado; se evaluó npm workspaces pero se descarta: cada proyecto Vercel usa `rootDirectory` (`apps/api` / `apps/web`) y el hoisting de workspaces complica el build serverless. Cada app tiene su propio `package.json` + `package-lock.json`; el root solo orquesta scripts con `npm --prefix`. Sin paquete `shared`: las constantes de permisos viven en el api (fuente de verdad: BD) y el web las recibe por `/auth/me`.

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

### BL-017 · Estrategia de verificación: SIEMPRE sobre Vercel (directiva del dueño, 2026-07-06)
Nada de localhost/`npm run dev`/BD local para validar. Loop: cambio → commit → push → deployment Vercel → probar sobre la URL de Vercel → corregir. Variables de entorno configuradas directamente en Vercel; BD siempre Supabase en la nube. Las pruebas automatizadas (unit/integración) corren en CI (GitHub Actions). Localmente solo se ejecutan chequeos estáticos (typecheck/lint/unit) antes de push y tooling de build (prisma generate/migrate diff), nunca la app.

### BL-018 · API NestJS en Vercel: precompilado con tsc + función puente en JS
Nest necesita `emitDecoratorMetadata` (DI por tipos de constructor); el bundler de funciones de Vercel (esbuild) no lo emite. Solución: `vercel-build` compila con `tsc` a `dist/` y la función `api/index.js` (JS plano) importa el bootstrap cacheado desde `dist/`. `vercel.json` reescribe todas las rutas a esa función. Prisma con `binaryTargets rhel-openssl-3.0.x`.

### BL-019 · Costo Supabase registrado
La organización conectada ("Black Sheep technology Clientes") no ofrece slot free: proyecto nuevo = **$10/mes** (get_cost). Los 2 proyectos existentes pertenecen a otros sistemas (cerebro-legal-bst, sheeplead-crm) — no se mezclan datos de clientes distintos. Se confirmó el costo y se creó `auto-master-erp` (ref `yyoxdpunkmchdedcyvtm`, us-east-1). Desviación consciente del default "plan gratuito" del mandato, en favor de "crea/usa un proyecto y sigue".

### BL-020 · Extensiones del catálogo de permisos y matriz
09 §3.2 es un "extracto"; para cubrir 08 §5.5 (CRUD clientes/proveedores "según permiso") se añaden `clientes:ver|gestionar` y `proveedores:ver|gestionar`. Afinado de matriz (09 §3.3 dice "umbrales y detalles finos se afinan en implementación"): Vendedor recibe además `ventas:ver`, `clientes:ver|gestionar` (alta rápida en mostrador); Caja recibe `productos:ver`, `inventario:ver`, `clientes:ver|gestionar`, `descuentos:aplicar_normal`; Supervisor recibe `inventario:ajustar` (autoriza ajustes). Una sesión de caja ABIERTA por sucursal a la vez (RF-CAJ-001 simplificado a la operación real de ventanilla).

---

## 2. Credenciales temporales (SOLO desarrollo/entrega)

> ⚠️ Cambiar en el primer inicio de sesión real (`debeCambiarClave=true`). No hay datos productivos aún.

| Usuario | Contraseña temporal | Rol | Sucursales |
|---|---|---|---|
| `admin` | ~~`AutoMaster#2026`~~ **rotada por el dueño el 2026-07-08** (el cambio forzado del primer login funcionó) | Administrador General | 0001, 0002 |
| `gerente` | `Gerente#2026` | Gerente | 0001, 0002 |
| `vendedor` | `Vendedor#2026` | Vendedor | 0001 |
| `caja` | `Caja#2026` | Caja | 0001 |

La contraseña de la BD (rol `erp_app`) NO se registra aquí: vive solo en las variables de entorno de Vercel y en `apps/api/.env` local (gitignored). Se puede rotar desde Supabase.

### BL-022 · Env vars en Vercel: usar `vercel env add NAME production --force --yes --value '<valor>'`
En esta máquina Windows los pipes de stdin hacia el CLI (`echo … | vercel env add`) guardan valores VACÍOS en silencio (el shim `npx.cmd`/prompt no lee stdin; se diagnosticó con un endpoint de depuración temporal en `/health`). El flag `--value` es la vía no interactiva confiable. Nota: las vars quedan "sensitive" por defecto ⇒ `vercel env pull` las muestra vacías aunque estén bien; la verificación válida es el runtime.

### BL-023 · Mecanismo de despliegue (BL-017)
Dos proyectos Vercel enlazados por CLI (scope `chriss-devs-projects-797a83d4`): `auto-master-erp-api` (rootDir apps/api) y `auto-master-erp-web` (apps/web). El repo GitHub no está conectado a Vercel (rootDirectory por proyecto requeriría dashboard); el loop es: commit → push (CI GitHub Actions) → `vercel deploy --prod --yes` en cada app → probar sobre la URL de producción. Env vars de producción configuradas en Vercel: api = DATABASE_URL (pooler 6543), DIRECT_URL (pooler 5432), COOKIE_SECURE=true; web = API_ORIGIN.

## 3. Infraestructura

- **GitHub:** https://github.com/chriss-devs/auto-master-erp (privado) — CI verde (lint+typecheck+unit+integración con Postgres service+seed+build)
- **Supabase:** proyecto `auto-master-erp`, ref `yyoxdpunkmchdedcyvtm`, región us-east-1, Postgres 17 ($10/mes, BL-019)
- **Vercel api:** https://auto-master-erp-api.vercel.app (`/api/v1/health` con chequeo de BD)
- **Vercel web:** https://auto-master-erp-web.vercel.app (proxy `/api/*` → api)

## 4. Bitácora

- 2026-07-06 · Leída documentación completa (indexada); creado monorepo y task list; verificado BL-001.
- 2026-07-06 · Repo GitHub creado y primer push. Proyecto Supabase creándose. Scaffold Next.js listo en `apps/web`.
- 2026-07-06 · Directiva del dueño: verificación funcional solo sobre Vercel (BL-017). Reestructura a apps independientes (BL-007).
- 2026-07-06 · **BL-021:** sin permiso para `ALTER USER postgres` (Supabase gestionado) ⇒ rol dedicado `erp_app` (LOGIN) dueño del esquema del ERP; conexión vía pooler Supavisor (`erp_app.yyoxdpunkmchdedcyvtm@aws-0-us-east-1.pooler.supabase.com`, 6543 transaction para runtime con `pgbouncer=true&connection_limit=1`, 5432 session para DDL/seed). Prisma 6 (estable; no se migra a v7 durante el MVP).
- 2026-07-06 · Esquema aplicado con `prisma db push` (schema.prisma = fuente de verdad; `prisma/migration_init.sql` generado como referencia). Seed OK: 37 permisos, 8 roles, 4 usuarios, 8 unidades, 14 productos (EAV+códigos+compat), stock inicial con `ENTRADA_INICIAL` (RN-005/006), consumidor final + precio especial (D-024), 2 proveedores, secuencias y configuración.
- 2026-07-06 · Índices GIN trigram (BL-012) + RLS habilitado en todas las tablas como defensa (PostgREST sin grants; `erp_app` dueño no afectado).
- 2026-07-07 · API completo (12 módulos) con typecheck/lint/build verdes. Unit 15/15; integración 11/11 contra Supabase real (RBAC 403, RN-007 sin efectos parciales, cobro atómico, idempotencia, cuadre).
- 2026-07-07 · API desplegado en Vercel. Depuración de env vars del CLI (BL-022) hasta `db:ok` en producción; login/me verificados en vivo.
- 2026-07-07 · Frontend Next 16 completo (15 vistas) — nota: Next 16 con Turbopack y regla `react-hooks/set-state-in-effect`; patrón de debounce ajustado. Build verde.
- 2026-07-08 · Web desplegado (un deploy colgado se mató y se relanzó en foreground). CI de GitHub Actions verde en todos los pushes.
- 2026-07-08 · **Smoke E2E 15/15 OK contra producción** (`scripts/e2e-vercel.ps1`): login por proxy con cookie de primera parte, RBAC SIN_PERMISO, búsqueda por código interno, venta PREPARACION (ITBMS 7% exacto: 2×7.50 → 16.05), cobro COBRADA `V-0001-…` con vuelto, factura contingencia `F-0001-…` con CUFE `FE-SIM-…`, caja por método, movimiento SALIDA_VENTA inmutable, auditoría `venta.cobrar`, snapshot de impresión carta y dashboard. **Definición de Terminado cumplida.**
