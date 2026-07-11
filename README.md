# Auto Master Colón — ERP (MVP)

ERP a medida para ferretería y autopartes (Colón, Panamá). Monorepo del MVP (Fase 0 + Fase 1): catálogo con atributos flexibles, inventario por sucursal con movimientos inmutables, POS de ventanilla en dos pasos (vendedor → caja), caja con cuadre por método, facturación electrónica en modo contingencia (PAC enchufable), RBAC, auditoría y dashboard.

> Diseño y decisiones: ver `../auto-master-documentacion/` y `BUILD-LOG.md`.

## Stack

- **Backend:** NestJS (TypeScript, monolito modular) + Prisma + PostgreSQL (Supabase) — `apps/api`
- **Frontend:** Next.js (App Router) + React + Tailwind + componentes estilo shadcn/ui — `apps/web`
- **Infra:** Vercel (web y api) + Supabase (BD) + GitHub Actions (CI)

## URLs (despliegue)

| Entorno | URL |
|---|---|
| **Web (Vercel)** | https://auto-master-erp-web.vercel.app |
| **API (Vercel)** | https://auto-master-erp-api.vercel.app (salud: `/api/v1/health`) |
| Repo | https://github.com/chriss-devs/auto-master-erp |
| BD | Supabase `auto-master-erp` (us-east-1, ref `yyoxdpunkmchdedcyvtm`) |

> El web proxya `/api/*` al API (cookies de primera parte). Usuarios demo y contraseñas temporales: `BUILD-LOG.md` §2.

### Desplegar (CLI, tras cada push)

```bash
cd apps/api && npx vercel deploy --prod --yes
cd apps/web && npx vercel deploy --prod --yes
```

## Desarrollo local

Requisitos: Node ≥ 20, npm ≥ 10.

```bash
npm install

# Variables de entorno
cp apps/api/.env.example apps/api/.env   # completar DATABASE_URL/DIRECT_URL
cp apps/web/.env.example apps/web/.env.local

# Prisma
npm run prisma:generate --workspace apps/api
npm run prisma:push --workspace apps/api      # o aplicar prisma/migrations

# Seed (roles, sucursales, admin, productos ejemplo)
npm run seed --workspace apps/api

# Correr (dos terminales)
npm run dev:api    # http://localhost:4000 (API en /api/v1)
npm run dev:web    # http://localhost:3000 (proxya /api → :4000)
```

Usuario inicial: `admin` (contraseña temporal en `BUILD-LOG.md` §2 — cambiarla de inmediato).

## Scripts útiles

```bash
npm run lint          # lint de ambos workspaces
npm run typecheck     # TS estricto
npm run test          # unit + integración (necesita TEST_DATABASE_URL para integración)
npm run build         # build de api y web
```

## Estructura

```
apps/
  api/    NestJS: auth, rbac, auditoria, catalogo, inventario, ventas, caja,
          facturacion (PacProvider + stub), clientes, proveedores, dashboard,
          configuracion, prisma/ (schema, migraciones, seed)
  web/    Next.js: login, dashboard, vender (POS), caja, productos, inventario,
          clientes, facturas (+ impresión carta), admin
```

## Reglas de negocio clave implementadas

- Producto único, stock por sucursal materializado + `movimiento_inv` append-only en la misma transacción (RN-001..006).
- No se vende sin stock (RN-007) — validado al cobrar, con error 409 `STOCK_INSUFICIENTE`.
- Venta en dos pasos: vendedor arma (**PREPARACION**) → caja cobra/factura/entrega (**COBRADA**) (D-020), con caja abierta obligatoria (RN-120/123) e `Idempotency-Key`.
- ITBMS 7% por línea, configurable por producto (RN-024/042); costeo promedio ponderado (RN-009).
- Facturación con `PacProvider` enchufable; stub en contingencia genera CUFE simulado y representación imprimible carta; nunca bloquea la venta (RF-FAC-005).
- RBAC recurso:acción con matriz de 09 §3.3, acotado por sucursal; auditoría inmutable (RN-182); soft-delete de entidades críticas (RN-183).
- Asistente: chat flotante que responde con datos vivos (stock, ventas, caja, clientes) vía DeepSeek tool calling, acotado por RBAC y sucursal; solo lectura, con enlaces a las pantallas (requiere `DEEPSEEK_API_KEY` en el api).
