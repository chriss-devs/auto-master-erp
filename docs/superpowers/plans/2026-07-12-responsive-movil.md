# Compatibilidad móvil completa — Auto Master ERP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que toda la app web (login, dashboard, POS/vender, caja, inventario, clientes, proveedores, facturas, productos, admin) sea completamente usable en celulares (320-430px), manteniendo el escritorio (≥1024px) sin cambios visuales, sin tocar lógica de negocio/permisos/APIs.

**Architecture:** Mobile-first vía Tailwind (`base` = móvil, overrides `sm`/`md`/`lg`). Se agregan primitivas reutilizables en `components/ui.tsx` (`TablaResponsive`, `Dialogo` en modo hoja completa, `Input`/`Select`/`Button` con tamaño táctil) y un nuevo `components/nav-movil.tsx` para la navegación móvil. Las pantallas existentes se adaptan reutilizando estas primitivas — no se reescribe ninguna pantalla desde cero.

**Tech Stack:** Next.js (App Router) + React + Tailwind CSS v4 + `@fortawesome/react-fontawesome` (ya instalado). Sin librería de testing en `apps/web` — verificación vía `tsc --noEmit` (tipos) y Playwright MCP (`mcp__plugin_playwright_playwright__*`) para validar visualmente cada breakpoint.

## Global Constraints

- No modificar lógica de negocio, permisos, endpoints ni formato de datos — solo interfaz, estilos y presentación.
- Mantener el escritorio (`≥1024px` para el shell, `≥768px` para tablas) visualmente idéntico al actual.
- Breakpoints: `base <640px` (móvil), `sm ≥640px`, `md ≥768px` (tablet — tablas vuelven a modo tabla), `lg ≥1024px` (escritorio — vuelve el sidebar fijo).
- Iconos: siempre FontAwesome (`@fortawesome/react-fontawesome` + `free-solid-svg-icons`), nunca emoji/glifos Unicode (excepto los ya existentes como `✕`/`✔` en código legado que no se toca en este plan salvo que la tarea lo indique explícitamente).
- Objetivo táctil mínimo: 44×44px para toda acción interactiva en `<1024px` (botones, links de acción en tablas, ítems de nav).
- Validar cada pantalla tocada en 320px, 375px, 390px, 430px, 768px y desktop antes de dar la tarea por terminada.
- Commits frecuentes, uno por tarea completa.

---

## Verificación visual (usada en cada tarea)

Cada tarea de UI termina con una verificación Playwright. Patrón estándar (reemplazar `<RUTA>` por la ruta de la pantalla, requiere sesión ya iniciada — usar `/login` primero si hace falta):

1. `mcp__plugin_playwright_playwright__browser_navigate` a `http://localhost:3000<RUTA>`
2. Para cada ancho en `[320, 375, 390, 430, 768, 1024]`: `mcp__plugin_playwright_playwright__browser_resize` a `{width, height: 800}`, luego `mcp__plugin_playwright_playwright__browser_evaluate` con `() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth })` — `scrollW` **no debe superar** `clientW` (si lo supera, hay overflow horizontal no intencional a corregir).
3. `mcp__plugin_playwright_playwright__browser_take_screenshot` en 375px y 1024px para inspección visual (solapamientos, texto cortado, acciones alcanzables).

El servidor dev (`npm run dev` en `apps/web`, puerto 3000) debe estar corriendo — si no lo está, iniciarlo en background antes de la tarea 2 (la primera que se puede navegar visualmente) y dejarlo corriendo para el resto del plan.

---

### Task 1: Fundamentos técnicos globales

**Files:**
- Modify: `apps/web/src/components/ui.tsx` (Input, Select, Button, Td — no se toca su firma, solo clases)
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Produces: mismas firmas públicas de `Input`, `Select`, `Button`, `Td` — ningún consumidor cambia.

- [ ] **Step 1: Arrancar el dev server (si no está corriendo)**

```bash
cd apps/web && npm run dev > /tmp/web-dev.log 2>&1 &
```

Esperar a ver `Ready` en `/tmp/web-dev.log` antes de continuar (verificación visual de tareas posteriores lo necesita).

- [ ] **Step 2: `Input`/`Select` a 16px en móvil (evita zoom automático de iOS)**

En `apps/web/src/components/ui.tsx`, cambiar:

```tsx
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "w-full rounded-md border border-border bg-white px-2.5 py-1.5 text-sm placeholder:text-muted disabled:bg-page",
        className,
      )}
      {...props}
    />
  );
}
```

por:

```tsx
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "w-full rounded-md border border-border bg-white px-2.5 py-2 text-base placeholder:text-muted disabled:bg-page sm:py-1.5 sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}
```

Y `Select` de:

```tsx
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cx("w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm", className)}
      {...props}
    >
      {children}
    </select>
  );
}
```

a:

```tsx
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cx("w-full rounded-md border border-border bg-white px-2 py-2 text-base sm:py-1.5 sm:text-sm", className)}
      {...props}
    >
      {children}
    </select>
  );
}
```

- [ ] **Step 3: `Button` con objetivo táctil ≥44px en móvil**

Cambiar la clase base de `Button` de:

```tsx
"inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
```

a:

```tsx
"inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0",
```

- [ ] **Step 4: Links de acción en tablas (`Td`) con área táctil suficiente**

`Td` en sí no cambia (es un contenedor), pero cada página usa `<button className="text-primary hover:underline">texto</button>` dentro de `Td` para acciones. Como convención para el resto del plan (tareas 5-13), todo botón de acción dentro de una tarjeta o tabla debe incluir `min-h-[44px] px-1` en móvil. Esto se aplica directamente en cada tarea que toca esas páginas — no requiere cambio aquí.

- [ ] **Step 5: Evitar overflow horizontal accidental a nivel global**

En `apps/web/src/app/globals.css`, agregar después del bloque `html, body { ... }`:

```css
html,
body {
  overflow-x: hidden;
}
```

- [ ] **Step 6: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 7: Verificación visual — Login**

Seguir el patrón de "Verificación visual" de arriba en `/login`. Confirmar que el input de contraseña (con el toggle 👁 agregado previamente) se ve a 16px en 375px sin recortarse, y el botón "Iniciar sesión" mide ≥44px de alto.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/ui.tsx apps/web/src/app/globals.css
git commit -m "feat(responsive): fundamentos táctiles y overflow global (inputs 16px, botones 44px)"
```

---

### Task 2: Navegación móvil — componente `nav-movil.tsx`

**Files:**
- Create: `apps/web/src/components/nav-movil.tsx`

**Interfaces:**
- Produces:
  - `interface ItemNav { ruta: string; texto: string; permiso: string; icono: IconDefinition }`
  - `BarraInferior({ items, activo }: { items: ItemNav[]; activo: (ruta: string) => boolean })`
  - `BotonMenu({ onAbrir }: { onAbrir: () => void })`
  - `DrawerMenu({ abierto, onCerrar, items, activo, usuario, roles, onCambiarClave, onSalir }: { abierto: boolean; onCerrar: () => void; items: ItemNav[]; activo: (ruta: string) => boolean; usuario: string; roles: string; onCambiarClave: () => void; onSalir: () => void })`
- Consumes: `cx` de `@/components/ui`.

- [ ] **Step 1: Crear el archivo**

```tsx
"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faBars, faXmark } from "@fortawesome/free-solid-svg-icons";
import { cx } from "@/components/ui";

export interface ItemNav {
  ruta: string;
  texto: string;
  permiso: string;
  icono: IconDefinition;
}

export function BarraInferior({ items, activo }: { items: ItemNav[]; activo: (ruta: string) => boolean }) {
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      {items.map((n) => (
        <Link
          key={n.ruta}
          href={n.ruta}
          className={cx(
            "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px]",
            activo(n.ruta) ? "text-primary" : "text-muted",
          )}
        >
          <FontAwesomeIcon icon={n.icono} className="text-base" />
          {n.texto}
        </Link>
      ))}
    </nav>
  );
}

export function BotonMenu({ onAbrir }: { onAbrir: () => void }) {
  return (
    <button
      onClick={onAbrir}
      className="flex h-11 w-11 items-center justify-center rounded-md text-ink hover:bg-page lg:hidden"
      aria-label="Abrir menú"
    >
      <FontAwesomeIcon icon={faBars} />
    </button>
  );
}

export function DrawerMenu({
  abierto,
  onCerrar,
  items,
  activo,
  usuario,
  roles,
  onCambiarClave,
  onSalir,
}: {
  abierto: boolean;
  onCerrar: () => void;
  items: ItemNav[];
  activo: (ruta: string) => boolean;
  usuario: string;
  roles: string;
  onCambiarClave: () => void;
  onSalir: () => void;
}) {
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />
      <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-white">AM</div>
            <div className="text-sm font-bold">Auto Master</div>
          </div>
          <button
            onClick={onCerrar}
            className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-page"
            aria-label="Cerrar menú"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {items.map((n) => (
            <Link
              key={n.ruta}
              href={n.ruta}
              onClick={onCerrar}
              className={cx(
                "flex min-h-[48px] items-center gap-3 rounded-md px-3 text-sm",
                activo(n.ruta) ? "bg-primary-light font-semibold text-primary-dark" : "text-ink hover:bg-page",
              )}
            >
              <FontAwesomeIcon icon={n.icono} className="w-4 text-center" />
              {n.texto}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-3 text-xs text-muted">
          <div className="mb-1 font-medium text-ink">{usuario}</div>
          <div className="mb-2">{roles}</div>
          <button
            onClick={() => { onCerrar(); onCambiarClave(); }}
            className="mr-3 min-h-[44px] text-primary hover:underline"
          >
            Contraseña
          </button>
          <button onClick={() => { onCerrar(); onSalir(); }} className="min-h-[44px] text-danger hover:underline">
            Salir
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: sin errores (el archivo aún no se importa desde ningún lado, pero debe compilar solo).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/nav-movil.tsx
git commit -m "feat(responsive): componentes de navegación móvil (barra inferior + drawer)"
```

---

### Task 3: Shell responsive — integrar nav móvil en el layout

**Files:**
- Modify: `apps/web/src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `BarraInferior`, `BotonMenu`, `DrawerMenu`, `ItemNav` de `@/components/nav-movil` (Task 2).

- [ ] **Step 1: Agregar íconos a `NAV` y separar principal/completa**

Reemplazar el bloque `NAV` actual:

```tsx
const NAV: Array<{ ruta: string; texto: string; permiso: string; tecla?: string }> = [
  { ruta: "/", texto: "Dashboard", permiso: "reportes:ver", tecla: "F1" },
  { ruta: "/vender", texto: "Vender", permiso: "ventas:crear", tecla: "F2" },
  { ruta: "/caja", texto: "Caja", permiso: "caja:operar", tecla: "F3" },
  { ruta: "/productos", texto: "Productos", permiso: "productos:ver", tecla: "F4" },
  { ruta: "/inventario", texto: "Inventario", permiso: "inventario:ver", tecla: "F6" },
  { ruta: "/clientes", texto: "Clientes", permiso: "clientes:ver" },
  { ruta: "/proveedores", texto: "Proveedores", permiso: "proveedores:ver" },
  { ruta: "/facturas", texto: "Facturas", permiso: "facturacion:ver" },
  { ruta: "/admin/usuarios", texto: "Usuarios", permiso: "admin:usuarios" },
  { ruta: "/admin/roles", texto: "Roles", permiso: "admin:roles" },
  { ruta: "/admin/auditoria", texto: "Auditoría", permiso: "auditoria:ver" },
  { ruta: "/admin/configuracion", texto: "Configuración", permiso: "admin:config" },
];
```

por:

```tsx
import {
  faGaugeHigh,
  faCashRegister,
  faCalculator,
  faBoxOpen,
  faWarehouse,
  faUsers,
  faTruck,
  faFileInvoice,
  faUserGear,
  faShieldHalved,
  faClipboardList,
  faGear,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { BarraInferior, BotonMenu, DrawerMenu, type ItemNav } from "@/components/nav-movil";

const NAV: Array<{ ruta: string; texto: string; permiso: string; tecla?: string; icono: IconDefinition }> = [
  { ruta: "/", texto: "Dashboard", permiso: "reportes:ver", tecla: "F1", icono: faGaugeHigh },
  { ruta: "/vender", texto: "Vender", permiso: "ventas:crear", tecla: "F2", icono: faCashRegister },
  { ruta: "/caja", texto: "Caja", permiso: "caja:operar", tecla: "F3", icono: faCalculator },
  { ruta: "/productos", texto: "Productos", permiso: "productos:ver", tecla: "F4", icono: faBoxOpen },
  { ruta: "/inventario", texto: "Inventario", permiso: "inventario:ver", tecla: "F6", icono: faWarehouse },
  { ruta: "/clientes", texto: "Clientes", permiso: "clientes:ver", icono: faUsers },
  { ruta: "/proveedores", texto: "Proveedores", permiso: "proveedores:ver", icono: faTruck },
  { ruta: "/facturas", texto: "Facturas", permiso: "facturacion:ver", icono: faFileInvoice },
  { ruta: "/admin/usuarios", texto: "Usuarios", permiso: "admin:usuarios", icono: faUserGear },
  { ruta: "/admin/roles", texto: "Roles", permiso: "admin:roles", icono: faShieldHalved },
  { ruta: "/admin/auditoria", texto: "Auditoría", permiso: "auditoria:ver", icono: faClipboardList },
  { ruta: "/admin/configuracion", texto: "Configuración", permiso: "admin:config", icono: faGear },
];

const RUTAS_BARRA_INFERIOR = ["/", "/vender", "/caja", "/productos", "/inventario"];
```

- [ ] **Step 2: Header + wrapper del `Shell` con barra móvil, drawer y botón menú**

Dentro de `Shell`, agregar estado del drawer y las variables derivadas justo debajo de las declaraciones existentes (`const [cambiandoClave, setCambiandoClave] = useState(false);`):

```tsx
const [menuAbierto, setMenuAbierto] = useState(false);
const itemsVisibles: ItemNav[] = NAV.filter((n) => puede(n.permiso));
const itemsBarra = itemsVisibles.filter((n) => RUTAS_BARRA_INFERIOR.includes(n.ruta));
const esActivo = (ruta: string) => (ruta === "/" ? pathname === "/" : pathname.startsWith(ruta));
```

Reemplazar el `<aside>` actual (que hoy es siempre visible) para que solo se muestre en escritorio, agregando `hidden lg:flex` a su className:

```tsx
<aside className="no-print hidden h-full w-52 shrink-0 flex-col border-r border-border bg-surface lg:flex">
```

(el resto del contenido del `<aside>` no cambia).

Reemplazar el `<header>` actual:

```tsx
<header className="no-print flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-2">
  <div className="text-sm text-muted">B/. — moneda local (PAB)</div>
  <div className="flex items-center gap-2">
    <span className="text-xs text-muted">Sucursal:</span>
    <Select
      className="w-56"
      value={sucursalId ?? ""}
      onChange={(e) => void cambiarSucursal(e.target.value)}
    >
      {me.sucursales.map((s) => (
        <option key={s.id} value={s.id}>
          {s.codigo} — {s.nombre}
        </option>
      ))}
    </Select>
  </div>
</header>
```

por:

```tsx
<header className="no-print flex shrink-0 flex-col gap-2 border-b border-border bg-surface px-3 py-2 lg:flex-row lg:items-center lg:justify-between lg:px-4">
  <div className="flex items-center justify-between gap-2">
    <div className="flex items-center gap-2 lg:hidden">
      <BotonMenu onAbrir={() => setMenuAbierto(true)} />
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-black text-white">AM</div>
    </div>
    <div className="hidden text-sm text-muted lg:block">B/. — moneda local (PAB)</div>
    <Select
      className="w-44 sm:w-56 lg:w-56"
      value={sucursalId ?? ""}
      onChange={(e) => void cambiarSucursal(e.target.value)}
    >
      {me.sucursales.map((s) => (
        <option key={s.id} value={s.id}>
          {s.codigo} — {s.nombre}
        </option>
      ))}
    </Select>
  </div>
</header>
```

Cambiar `<main>` para dejar espacio a la barra inferior fija en móvil, de:

```tsx
<main className="min-w-0 flex-1 overflow-y-auto p-4 print:overflow-visible">{children}</main>
```

a:

```tsx
<main className="min-w-0 flex-1 overflow-y-auto p-3 pb-20 print:overflow-visible sm:p-4 lg:pb-4">{children}</main>
```

Agregar `BarraInferior` y `DrawerMenu` justo antes del cierre del `<div className="flex h-screen ...">` raíz (antes de `{(me.usuario.debeCambiarClave || cambiandoClave) && (...)}`):

```tsx
<BarraInferior items={itemsBarra} activo={esActivo} />
<DrawerMenu
  abierto={menuAbierto}
  onCerrar={() => setMenuAbierto(false)}
  items={itemsVisibles}
  activo={esActivo}
  usuario={me.usuario.nombre}
  roles={me.roles.join(", ")}
  onCambiarClave={() => setCambiandoClave(true)}
  onSalir={() => void salir()}
/>
```

- [ ] **Step 3: `h-dvh` en vez de `h-screen`**

Cambiar el `<div>` raíz del `Shell` de:

```tsx
<div className="flex h-screen overflow-hidden print:h-auto print:overflow-visible">
```

a:

```tsx
<div className="flex h-dvh overflow-hidden print:h-auto print:overflow-visible">
```

- [ ] **Step 4: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 5: Verificación visual — Shell en Dashboard**

Seguir el patrón de "Verificación visual" en `/`. Confirmar en 375px: sidebar de escritorio oculto, header muestra botón ☰ + selector de sucursal sin desbordar, barra inferior con 5 accesos visible y fija abajo, el contenido no queda tapado por la barra inferior. Tocar ☰ y confirmar que el drawer abre con overlay y todos los ítems con permiso. En 1024px: confirmar que la barra inferior y el botón ☰ desaparecen y el sidebar de escritorio se ve igual que antes del cambio.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(app)/layout.tsx"
git commit -m "feat(responsive): shell con barra inferior y drawer en móvil/tablet"
```

---

### Task 4: `Dialogo` responsive (hoja de pantalla completa en móvil)

**Files:**
- Modify: `apps/web/src/components/ui.tsx:141-189` (función `Dialogo`)

**Interfaces:**
- Produces: misma firma pública de `Dialogo` — ningún consumidor cambia.

- [ ] **Step 1: Reescribir el contenedor de `Dialogo`**

Reemplazar:

```tsx
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]" onMouseDown={forzado ? undefined : onCerrar}>
      <div ref={ref} className={cx("w-full rounded-lg bg-surface p-4 shadow-xl", ancho)} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{titulo}</h2>
          {!forzado && (
            <button data-cerrar onClick={onCerrar} tabIndex={-1} className="rounded p-1 text-muted hover:bg-page" aria-label="Cerrar">
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
```

por:

```tsx
  if (!abierto) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-start sm:p-4 sm:pt-[8vh]"
      onMouseDown={forzado ? undefined : onCerrar}
    >
      <div
        ref={ref}
        className={cx(
          "flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-lg bg-surface shadow-xl sm:max-h-[85vh] sm:rounded-lg",
          ancho,
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4 sm:border-0 sm:pb-0">
          <h2 className="text-base font-semibold">{titulo}</h2>
          {!forzado && (
            <button
              data-cerrar
              onClick={onCerrar}
              tabIndex={-1}
              className="flex h-9 w-9 items-center justify-center rounded p-1 text-muted hover:bg-page"
              aria-label="Cerrar"
            >
              ✕
            </button>
          )}
        </div>
        <div className="overflow-y-auto p-4 sm:pt-3">{children}</div>
      </div>
    </div>
  );
```

Nota: el contenido (`children`) de cada diálogo suele terminar en un `<Button className="w-full">Guardar</Button>` — al quedar dentro del contenedor con scroll interno (`overflow-y-auto`), el botón se desplaza junto con el contenido pero permanece siempre alcanzable sin quedar oculto tras el teclado, porque el diálogo entero no excede `92dvh`. No se requiere un footer fijo separado.

- [ ] **Step 2: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Verificación visual — diálogo de cambio de contraseña**

En `/` (dashboard), con sesión iniciada, abrir el diálogo "Contraseña" desde el drawer móvil (o desde el pie del sidebar en desktop). Verificar en 375px: el diálogo ocupa la parte inferior de la pantalla como hoja, con header fijo arriba y el botón "Guardar" alcanzable sin scroll extra. En 1024px: diálogo centrado como antes del cambio.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui.tsx
git commit -m "feat(responsive): Dialogo como hoja de pantalla completa en móvil"
```

---

### Task 5: `TablaResponsive` — componente reutilizable

**Files:**
- Modify: `apps/web/src/components/ui.tsx` (agregar al final del bloque "Tabla")

**Interfaces:**
- Produces: `TablaResponsive<T>({ filas, claveFila, encabezado, renderFila, renderTarjeta, vacio }: { filas: T[]; claveFila: (fila: T) => string; encabezado: React.ReactNode; renderFila: (fila: T) => React.ReactNode; renderTarjeta: (fila: T) => React.ReactNode; vacio?: string })`
- Consumes: `Tabla`, `Vacio` (ya definidos en el mismo archivo).

- [ ] **Step 1: Agregar el componente**

Justo después de la definición de `Td` (línea ~125) en `apps/web/src/components/ui.tsx`:

```tsx
// ── Tabla responsive (tarjetas en móvil, tabla desde md) ───────────────────────
export function TablaResponsive<T>({
  filas,
  claveFila,
  encabezado,
  renderFila,
  renderTarjeta,
  vacio = "Sin resultados.",
}: {
  filas: T[];
  claveFila: (fila: T) => string;
  encabezado: React.ReactNode;
  renderFila: (fila: T) => React.ReactNode;
  renderTarjeta: (fila: T) => React.ReactNode;
  vacio?: string;
}) {
  if (filas.length === 0) return <Vacio texto={vacio} />;
  return (
    <>
      <div className="space-y-2 md:hidden">
        {filas.map((f) => (
          <div key={claveFila(f)} className="rounded-lg border border-border bg-surface p-3 shadow-sm">
            {renderTarjeta(f)}
          </div>
        ))}
      </div>
      <div className="hidden md:block">
        <Tabla>
          <thead>
            <tr>{encabezado}</tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={claveFila(f)} className="hover:bg-page">
                {renderFila(f)}
              </tr>
            ))}
          </tbody>
        </Tabla>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui.tsx
git commit -m "feat(responsive): componente TablaResponsive (tarjetas en móvil, tabla en desktop)"
```

---

### Task 6: Aplicar `TablaResponsive` — Clientes

**Files:**
- Modify: `apps/web/src/app/(app)/clientes/page.tsx:40-75`

**Interfaces:**
- Consumes: `TablaResponsive` (Task 5).

- [ ] **Step 1: Import**

Agregar `TablaResponsive` al import existente de `@/components/ui`:

```tsx
import { Badge, Button, Campo, Dialogo, Input, Select, Spinner, TablaResponsive, Td, Th, useToast } from "@/components/ui";
```

(se quitan `Tabla` y `Vacio` de ese import ya que `TablaResponsive` los maneja internamente; si `Vacio` se usa en otro lado del archivo, conservarlo).

- [ ] **Step 2: Reemplazar el bloque de tabla**

Reemplazar:

```tsx
      {!filas ? (
        <Spinner />
      ) : (
        <>
        <Tabla>
          <thead>
            <tr><Th>Nombre</Th><Th>Tipo</Th><Th>RUC/Cédula</Th><Th>Teléfono</Th><Th className="w-40"> </Th></tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr key={c.id} className="hover:bg-page">
                <Td className="font-medium">{c.nombre}</Td>
                <Td>{c.tipo === "CONSUMIDOR_FINAL" ? <Badge tono="azul">Consumidor final</Badge> : c.tipo === "JURIDICO" ? "Jurídico" : "Natural"}</Td>
                <Td className="font-mono text-xs">{c.rucOCedula ?? "—"}{c.dv ? ` DV ${c.dv}` : ""}</Td>
                <Td>{c.telefono ?? "—"}</Td>
                <Td className="text-right">
                  <button className="mr-3 text-primary hover:underline" onClick={() => verDetalle(c)}>precios</button>
                  {puede("clientes:gestionar") && c.tipo !== "CONSUMIDOR_FINAL" && (
                    <button className="text-primary hover:underline" onClick={() => setEditando(c)}>editar</button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
        <Paginador p={pag} nombre="cliente(s)" />
        </>
      )}
```

por:

```tsx
      {!filas ? (
        <Spinner />
      ) : (
        <>
        <TablaResponsive
          filas={filas}
          claveFila={(c) => c.id}
          vacio="Sin clientes."
          encabezado={<><Th>Nombre</Th><Th>Tipo</Th><Th>RUC/Cédula</Th><Th>Teléfono</Th><Th className="w-40"> </Th></>}
          renderFila={(c) => (
            <>
              <Td className="font-medium">{c.nombre}</Td>
              <Td>{c.tipo === "CONSUMIDOR_FINAL" ? <Badge tono="azul">Consumidor final</Badge> : c.tipo === "JURIDICO" ? "Jurídico" : "Natural"}</Td>
              <Td className="font-mono text-xs">{c.rucOCedula ?? "—"}{c.dv ? ` DV ${c.dv}` : ""}</Td>
              <Td>{c.telefono ?? "—"}</Td>
              <Td className="text-right">
                <button className="mr-3 text-primary hover:underline" onClick={() => verDetalle(c)}>precios</button>
                {puede("clientes:gestionar") && c.tipo !== "CONSUMIDOR_FINAL" && (
                  <button className="text-primary hover:underline" onClick={() => setEditando(c)}>editar</button>
                )}
              </Td>
            </>
          )}
          renderTarjeta={(c) => (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">{c.nombre}</div>
                <div className="mt-0.5">
                  {c.tipo === "CONSUMIDOR_FINAL" ? <Badge tono="azul">Consumidor final</Badge> : <span className="text-xs text-muted">{c.tipo === "JURIDICO" ? "Jurídico" : "Natural"}</span>}
                </div>
                <div className="mt-1 text-xs text-muted">
                  {c.rucOCedula ? `${c.rucOCedula}${c.dv ? ` DV ${c.dv}` : ""}` : "Sin RUC/cédula"} · {c.telefono ?? "sin teléfono"}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                <button className="min-h-[44px] px-2 text-primary hover:underline" onClick={() => verDetalle(c)}>precios</button>
                {puede("clientes:gestionar") && c.tipo !== "CONSUMIDOR_FINAL" && (
                  <button className="min-h-[44px] px-2 text-primary hover:underline" onClick={() => setEditando(c)}>editar</button>
                )}
              </div>
            </div>
          )}
        />
        <Paginador p={pag} nombre="cliente(s)" />
        </>
      )}
```

Si el import de `Vacio`/`Tabla` queda sin usos en el resto del archivo, quitarlos del import (verificar con el error de `tsc`/eslint del siguiente paso).

- [ ] **Step 2: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: sin errores. Si aparece "declared but never read" para `Tabla`/`Vacio`/`Td`/`Th`, quitarlos del import (Th sigue usándose en `encabezado`, no quitar ese).

- [ ] **Step 3: Verificación visual — Clientes**

Seguir el patrón de "Verificación visual" en `/clientes`. En 375px: lista de tarjetas, cada una con nombre, tipo, RUC/teléfono y botones "precios"/"editar" alcanzables. En 768px+: tabla clásica sin cambios.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(app)/clientes/page.tsx"
git commit -m "feat(responsive): Clientes con tarjetas en móvil (TablaResponsive)"
```

---

### Task 7: Aplicar `TablaResponsive` — Proveedores

**Files:**
- Modify: `apps/web/src/app/(app)/proveedores/page.tsx:26-60`

**Interfaces:**
- Consumes: `TablaResponsive` (Task 5).

- [ ] **Step 1: Import**

```tsx
import { Button, Campo, Dialogo, Input, Spinner, TablaResponsive, Td, Th, useToast } from "@/components/ui";
```

- [ ] **Step 2: Reemplazar el bloque de tabla**

Reemplazar:

```tsx
      {!filas ? (
        <Spinner />
      ) : filas.length === 0 ? (
        <Vacio texto="Sin proveedores." />
      ) : (
        <>
        <Tabla>
          <thead><tr><Th>Nombre</Th><Th>RUC</Th><Th>Teléfono</Th><Th>Correo</Th><Th className="w-20"> </Th></tr></thead>
          <tbody>
            {filas.map((p) => (
              <tr key={p.id} className="hover:bg-page">
                <Td className="font-medium">{p.nombre}</Td>
                <Td className="font-mono text-xs">{p.ruc ?? "—"}</Td>
                <Td>{p.telefono ?? "—"}</Td>
                <Td>{p.email ?? "—"}</Td>
                <Td>
                  {puede("proveedores:gestionar") && (
                    <button className="text-primary hover:underline" onClick={() => setEditando(p)}>editar</button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
        <Paginador p={pag} nombre="proveedor(es)" />
        </>
      )}
```

por:

```tsx
      {!filas ? (
        <Spinner />
      ) : (
        <>
        <TablaResponsive
          filas={filas}
          claveFila={(p) => p.id}
          vacio="Sin proveedores."
          encabezado={<><Th>Nombre</Th><Th>RUC</Th><Th>Teléfono</Th><Th>Correo</Th><Th className="w-20"> </Th></>}
          renderFila={(p) => (
            <>
              <Td className="font-medium">{p.nombre}</Td>
              <Td className="font-mono text-xs">{p.ruc ?? "—"}</Td>
              <Td>{p.telefono ?? "—"}</Td>
              <Td>{p.email ?? "—"}</Td>
              <Td>
                {puede("proveedores:gestionar") && (
                  <button className="text-primary hover:underline" onClick={() => setEditando(p)}>editar</button>
                )}
              </Td>
            </>
          )}
          renderTarjeta={(p) => (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">{p.nombre}</div>
                <div className="mt-1 text-xs text-muted">
                  {p.ruc ?? "sin RUC"} · {p.telefono ?? "sin teléfono"}
                </div>
                {p.email && <div className="text-xs text-muted">{p.email}</div>}
              </div>
              {puede("proveedores:gestionar") && (
                <button className="min-h-[44px] shrink-0 px-2 text-sm text-primary hover:underline" onClick={() => setEditando(p)}>editar</button>
              )}
            </div>
          )}
        />
        <Paginador p={pag} nombre="proveedor(es)" />
        </>
      )}
```

- [ ] **Step 3: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: sin errores (quitar `Tabla`/`Td`/`Vacio` del import si quedan sin uso).

- [ ] **Step 4: Verificación visual — Proveedores**

Igual patrón en `/proveedores`.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/proveedores/page.tsx"
git commit -m "feat(responsive): Proveedores con tarjetas en móvil (TablaResponsive)"
```

---

### Task 8: Aplicar `TablaResponsive` — Productos

**Files:**
- Modify: `apps/web/src/app/(app)/productos/page.tsx:1-78`

**Interfaces:**
- Consumes: `TablaResponsive` (Task 5).

- [ ] **Step 1: Import**

```tsx
import { Badge, Button, Input, Spinner, TablaResponsive, Td, Th } from "@/components/ui";
```

- [ ] **Step 2: Reemplazar el bloque de tabla**

Nota: esta tabla tiene columnas dinámicas por sucursal (`sucursales.map`) — en la tarjeta móvil se resume como lista de "Sucursal: cantidad" en vez de columnas.

Reemplazar:

```tsx
      {!filas ? (
        <Spinner />
      ) : filas.length === 0 ? (
        <Vacio texto="Sin productos." />
      ) : (
        <>
          <Tabla>
            <thead>
              <tr>
                <Th>Código</Th><Th>Nombre</Th><Th>Categoría</Th><Th>Marca</Th>
                {sucursales.map((s) => <Th key={s.id} className="text-right">Stock {s.codigo}</Th>)}
                <Th className="text-right">Precio</Th><Th>ITBMS</Th><Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <tr key={p.id} className="hover:bg-page">
                  <Td className="font-mono text-xs">{p.sku}</Td>
                  <Td><Link href={`/productos/${p.id}`} className="font-medium text-primary hover:underline">{p.nombre}</Link></Td>
                  <Td className="text-muted">{p.categoria?.nombre ?? "—"}</Td>
                  <Td className="text-muted">{p.marca?.nombre ?? "—"}</Td>
                  {sucursales.map((s) => {
                    const st = p.stocks.find((x) => x.sucursal.id === s.id);
                    return <Td key={s.id} className="text-right">{fmtQty(st?.cantidad ?? 0)}</Td>;
                  })}
                  <Td className="text-right font-medium">{fmtMoney(p.precioBase)}</Td>
                  <Td>{pct(p.tasaItbms)}</Td>
                  <Td>{p.estado === "ACTIVO" ? <Badge tono="verde">Activo</Badge> : <Badge tono="rojo">Descontinuado</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <Paginador p={pag} nombre="producto(s)" />
        </>
      )}
```

por:

```tsx
      {!filas ? (
        <Spinner />
      ) : (
        <>
          <TablaResponsive
            filas={filas}
            claveFila={(p) => p.id}
            vacio="Sin productos."
            encabezado={
              <>
                <Th>Código</Th><Th>Nombre</Th><Th>Categoría</Th><Th>Marca</Th>
                {sucursales.map((s) => <Th key={s.id} className="text-right">Stock {s.codigo}</Th>)}
                <Th className="text-right">Precio</Th><Th>ITBMS</Th><Th>Estado</Th>
              </>
            }
            renderFila={(p) => (
              <>
                <Td className="font-mono text-xs">{p.sku}</Td>
                <Td><Link href={`/productos/${p.id}`} className="font-medium text-primary hover:underline">{p.nombre}</Link></Td>
                <Td className="text-muted">{p.categoria?.nombre ?? "—"}</Td>
                <Td className="text-muted">{p.marca?.nombre ?? "—"}</Td>
                {sucursales.map((s) => {
                  const st = p.stocks.find((x) => x.sucursal.id === s.id);
                  return <Td key={s.id} className="text-right">{fmtQty(st?.cantidad ?? 0)}</Td>;
                })}
                <Td className="text-right font-medium">{fmtMoney(p.precioBase)}</Td>
                <Td>{pct(p.tasaItbms)}</Td>
                <Td>{p.estado === "ACTIVO" ? <Badge tono="verde">Activo</Badge> : <Badge tono="rojo">Descontinuado</Badge>}</Td>
              </>
            )}
            renderTarjeta={(p) => (
              <Link href={`/productos/${p.id}`} className="block">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-muted">{p.sku}</div>
                    <div className="font-medium text-primary">{p.nombre}</div>
                    <div className="mt-0.5 text-xs text-muted">{p.categoria?.nombre ?? "—"} · {p.marca?.nombre ?? "—"}</div>
                  </div>
                  {p.estado === "ACTIVO" ? <Badge tono="verde">Activo</Badge> : <Badge tono="rojo">Descontinuado</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  {sucursales.map((s) => {
                    const st = p.stocks.find((x) => x.sucursal.id === s.id);
                    return <span key={s.id}>{s.codigo}: <span className="font-medium text-ink">{fmtQty(st?.cantidad ?? 0)}</span></span>;
                  })}
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-muted">ITBMS {pct(p.tasaItbms)}</span>
                  <span className="font-semibold">{fmtMoney(p.precioBase)}</span>
                </div>
              </Link>
            )}
          />
          <Paginador p={pag} nombre="producto(s)" />
        </>
      )}
```

- [ ] **Step 3: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Verificación visual — Productos**

Igual patrón en `/productos`. Confirmar que tocar la tarjeta completa navega al detalle del producto (el `<Link>` envuelve toda la tarjeta).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/productos/page.tsx"
git commit -m "feat(responsive): Productos con tarjetas en móvil (TablaResponsive)"
```

---

### Task 9: Aplicar `TablaResponsive` — Facturas

**Files:**
- Modify: `apps/web/src/app/(app)/facturas/page.tsx:53-108`

**Interfaces:**
- Consumes: `TablaResponsive` (Task 5).

- [ ] **Step 1: Import**

```tsx
import { Badge, Select, Spinner, TablaResponsive, Td, Th, useToast } from "@/components/ui";
```

- [ ] **Step 2: Reemplazar el bloque de tabla**

Reemplazar:

```tsx
      {!filas ? (
        <Spinner />
      ) : filas.length === 0 ? (
        <Vacio texto="Sin facturas." />
      ) : (
        <>
        <Tabla>
          <thead>
            <tr>
              <Th>Número</Th><Th>Fecha</Th><Th>Cliente</Th><Th className="text-right">Total</Th>
              <Th>Estado</Th><Th>CUFE</Th><Th className="w-48"> </Th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="hover:bg-page">
                <Td className="font-mono text-xs">{f.numero}</Td>
                <Td className="whitespace-nowrap text-xs">{fmtFecha(f.creadoEn)}</Td>
                <Td>{f.venta.cliente.nombre}</Td>
                <Td className="text-right font-medium">{fmtMoney(f.venta.total)}</Td>
                <Td><Badge tono={TONO[f.estado] ?? "gris"}>{f.estado === "PENDIENTE_TRANSMISION" ? "Contingencia" : f.estado}</Badge></Td>
                <Td className="max-w-40 truncate font-mono text-[10px] text-muted" >{f.cufe ?? "—"}</Td>
                <Td className="whitespace-nowrap text-right">
                  <Link className="mr-3 text-primary hover:underline" href={`/facturas/${f.id}/imprimir`} target="_blank">imprimir</Link>
                  {puede("facturacion:emitir") && f.estado === "PENDIENTE_TRANSMISION" && (
                    <button className="text-primary hover:underline" onClick={() => void retransmitir(f.id)}>
                      retransmitir ({f.intentos})
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
        <Paginador p={pag} nombre="factura(s)" />
        </>
      )}
```

por:

```tsx
      {!filas ? (
        <Spinner />
      ) : (
        <>
        <TablaResponsive
          filas={filas}
          claveFila={(f) => f.id}
          vacio="Sin facturas."
          encabezado={
            <>
              <Th>Número</Th><Th>Fecha</Th><Th>Cliente</Th><Th className="text-right">Total</Th>
              <Th>Estado</Th><Th>CUFE</Th><Th className="w-48"> </Th>
            </>
          }
          renderFila={(f) => (
            <>
              <Td className="font-mono text-xs">{f.numero}</Td>
              <Td className="whitespace-nowrap text-xs">{fmtFecha(f.creadoEn)}</Td>
              <Td>{f.venta.cliente.nombre}</Td>
              <Td className="text-right font-medium">{fmtMoney(f.venta.total)}</Td>
              <Td><Badge tono={TONO[f.estado] ?? "gris"}>{f.estado === "PENDIENTE_TRANSMISION" ? "Contingencia" : f.estado}</Badge></Td>
              <Td className="max-w-40 truncate font-mono text-[10px] text-muted">{f.cufe ?? "—"}</Td>
              <Td className="whitespace-nowrap text-right">
                <Link className="mr-3 text-primary hover:underline" href={`/facturas/${f.id}/imprimir`} target="_blank">imprimir</Link>
                {puede("facturacion:emitir") && f.estado === "PENDIENTE_TRANSMISION" && (
                  <button className="text-primary hover:underline" onClick={() => void retransmitir(f.id)}>
                    retransmitir ({f.intentos})
                  </button>
                )}
              </Td>
            </>
          )}
          renderTarjeta={(f) => (
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-muted">{f.numero}</div>
                  <div className="font-medium">{f.venta.cliente.nombre}</div>
                  <div className="text-xs text-muted">{fmtFecha(f.creadoEn)}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{fmtMoney(f.venta.total)}</div>
                  <Badge tono={TONO[f.estado] ?? "gris"}>{f.estado === "PENDIENTE_TRANSMISION" ? "Contingencia" : f.estado}</Badge>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2 text-sm">
                <Link className="min-h-[44px] px-2 py-2.5 text-primary hover:underline" href={`/facturas/${f.id}/imprimir`} target="_blank">imprimir</Link>
                {puede("facturacion:emitir") && f.estado === "PENDIENTE_TRANSMISION" && (
                  <button className="min-h-[44px] px-2 py-2.5 text-primary hover:underline" onClick={() => void retransmitir(f.id)}>
                    retransmitir ({f.intentos})
                  </button>
                )}
              </div>
            </div>
          )}
        />
        <Paginador p={pag} nombre="factura(s)" />
        </>
      )}
```

- [ ] **Step 3: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Verificación visual — Facturas**

Igual patrón en `/facturas`.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/facturas/page.tsx"
git commit -m "feat(responsive): Facturas con tarjetas en móvil (TablaResponsive)"
```

---

### Task 10: Aplicar `TablaResponsive` — Admin / Usuarios

**Files:**
- Modify: `apps/web/src/app/(app)/admin/usuarios/page.tsx:1-81`

**Interfaces:**
- Consumes: `TablaResponsive` (Task 5).

- [ ] **Step 1: Import**

```tsx
import { Badge, Button, Campo, Dialogo, Input, Spinner, TablaResponsive, Td, Th, useToast } from "@/components/ui";
```

- [ ] **Step 2: Reemplazar el bloque de tabla**

Reemplazar:

```tsx
      <Tabla>
        <thead>
          <tr><Th>Usuario</Th><Th>Nombre</Th><Th>Roles</Th><Th>Sucursales</Th><Th>Último acceso</Th><Th>Estado</Th><Th className="w-16"> </Th></tr>
        </thead>
        <tbody>
          {filas.map((u) => (
            <tr key={u.id} className="hover:bg-page">
              <Td className="font-mono text-xs">{u.usuario}</Td>
              <Td className="font-medium">{u.nombre}</Td>
              <Td className="text-xs">{u.roles.map((r) => r.nombre).join(", ")}</Td>
              <Td className="text-xs">{u.sucursales.map((s) => s.codigo).join(", ")}</Td>
              <Td className="text-xs text-muted">{fmtFecha(u.ultimoLoginEn)}</Td>
              <Td>
                {u.activo ? <Badge tono="verde">Activo</Badge> : <Badge tono="rojo">Inactivo</Badge>}
                {u.debeCambiarClave && <Badge tono="ambar" className="ml-1">clave temporal</Badge>}
              </Td>
              <Td><button className="text-primary hover:underline" onClick={() => setEditando(u)}>editar</button></Td>
            </tr>
          ))}
        </tbody>
      </Tabla>
```

por:

```tsx
      <TablaResponsive
        filas={filas}
        claveFila={(u) => u.id}
        vacio="Sin usuarios."
        encabezado={<><Th>Usuario</Th><Th>Nombre</Th><Th>Roles</Th><Th>Sucursales</Th><Th>Último acceso</Th><Th>Estado</Th><Th className="w-16"> </Th></>}
        renderFila={(u) => (
          <>
            <Td className="font-mono text-xs">{u.usuario}</Td>
            <Td className="font-medium">{u.nombre}</Td>
            <Td className="text-xs">{u.roles.map((r) => r.nombre).join(", ")}</Td>
            <Td className="text-xs">{u.sucursales.map((s) => s.codigo).join(", ")}</Td>
            <Td className="text-xs text-muted">{fmtFecha(u.ultimoLoginEn)}</Td>
            <Td>
              {u.activo ? <Badge tono="verde">Activo</Badge> : <Badge tono="rojo">Inactivo</Badge>}
              {u.debeCambiarClave && <Badge tono="ambar" className="ml-1">clave temporal</Badge>}
            </Td>
            <Td><button className="text-primary hover:underline" onClick={() => setEditando(u)}>editar</button></Td>
          </>
        )}
        renderTarjeta={(u) => (
          <button className="block w-full text-left" onClick={() => setEditando(u)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-xs text-muted">{u.usuario}</div>
                <div className="font-medium">{u.nombre}</div>
                <div className="mt-0.5 text-xs text-muted">{u.roles.map((r) => r.nombre).join(", ") || "sin roles"}</div>
                <div className="text-xs text-muted">Sucursales: {u.sucursales.map((s) => s.codigo).join(", ") || "—"}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {u.activo ? <Badge tono="verde">Activo</Badge> : <Badge tono="rojo">Inactivo</Badge>}
                {u.debeCambiarClave && <Badge tono="ambar">clave temporal</Badge>}
              </div>
            </div>
          </button>
        )}
      />
```

Nota: la tarjeta completa es clicable (`onClick={() => setEditando(u)}`) para reemplazar el link de texto "editar", dando un área táctil mucho más grande.

- [ ] **Step 3: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Verificación visual — Admin/Usuarios**

Igual patrón en `/admin/usuarios`.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/admin/usuarios/page.tsx"
git commit -m "feat(responsive): Admin/Usuarios con tarjetas en móvil (TablaResponsive)"
```

---

### Task 11: Aplicar `TablaResponsive` — Admin / Auditoría (con detalle expandible)

**Files:**
- Modify: `apps/web/src/app/(app)/admin/auditoria/page.tsx`

**Interfaces:**
- Consumes: `TablaResponsive` (Task 5).

Esta pantalla tiene una fila expandible con JSON de estado anterior/nuevo — `TablaResponsive` no soporta filas expandibles multi-`<tr>` directamente en el modo tabla, así que se mantiene `FilaEvento` como está para el modo tabla y se agrega el detalle dentro de la propia tarjeta en modo móvil (más simple: siempre visible, sin toggle, ya que en tarjeta no hay problema de espacio horizontal).

- [ ] **Step 1: Import**

```tsx
import { Badge, Input, Spinner, TablaResponsive, Td, Th } from "@/components/ui";
```

- [ ] **Step 2: Reemplazar el bloque de tabla y `FilaEvento`**

Reemplazar:

```tsx
      {!filas ? (
        <Spinner />
      ) : filas.length === 0 ? (
        <Vacio texto="Sin eventos para esos filtros." />
      ) : (
        <>
          <Tabla>
            <thead>
              <tr><Th>Fecha</Th><Th>Acción</Th><Th>Entidad</Th><Th>Entidad ID</Th><Th>IP</Th><Th className="w-20"> </Th></tr>
            </thead>
            <tbody>
              {filas.map((e) => (
                <FilaEvento key={e.id} e={e} abierto={abierto === e.id} onToggle={() => setAbierto(abierto === e.id ? null : e.id)} />
              ))}
            </tbody>
          </Tabla>
          <Paginador p={pag} nombre="evento(s)" />
        </>
      )}
```

por:

```tsx
      {!filas ? (
        <Spinner />
      ) : (
        <>
          <TablaResponsive
            filas={filas}
            claveFila={(e) => e.id}
            vacio="Sin eventos para esos filtros."
            encabezado={<><Th>Fecha</Th><Th>Acción</Th><Th>Entidad</Th><Th>Entidad ID</Th><Th>IP</Th><Th className="w-20"> </Th></>}
            renderFila={(e) => (
              <FilaEventoTabla e={e} abierto={abierto === e.id} onToggle={() => setAbierto(abierto === e.id ? null : e.id)} />
            )}
            renderTarjeta={(e) => (
              <div>
                <div className="flex items-start justify-between gap-2">
                  <Badge tono={e.accion.includes("fallido") || e.accion.includes("cancelar") ? "rojo" : "azul"}>{e.accion}</Badge>
                  <span className="text-xs text-muted">{fmtFecha(e.creadoEn)}</span>
                </div>
                <div className="mt-1 text-sm">{e.entidad} <span className="font-mono text-[10px] text-muted">{e.entidadId ?? "—"}</span></div>
                <div className="text-xs text-muted">IP: {e.ip ?? "—"}</div>
                <div className="mt-2 grid gap-2 border-t border-border pt-2 text-xs">
                  <div>
                    <div className="mb-1 font-semibold text-muted">Estado anterior</div>
                    <pre className="overflow-x-auto rounded bg-page p-2">{JSON.stringify(e.estadoAnterior ?? null, null, 2)}</pre>
                  </div>
                  <div>
                    <div className="mb-1 font-semibold text-muted">Estado nuevo</div>
                    <pre className="overflow-x-auto rounded bg-page p-2">{JSON.stringify(e.estadoNuevo ?? null, null, 2)}</pre>
                  </div>
                </div>
              </div>
            )}
          />
          <Paginador p={pag} nombre="evento(s)" />
        </>
      )}
```

Renombrar la función existente `FilaEvento` a `FilaEventoTabla` y quitar su `<tr>` externo (ya lo agrega `TablaResponsive`), dejando solo los `<Td>`:

Reemplazar:

```tsx
function FilaEvento({ e, abierto, onToggle }: { e: Evento; abierto: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="hover:bg-page">
        <Td className="whitespace-nowrap text-xs">{fmtFecha(e.creadoEn)}</Td>
        <Td><Badge tono={e.accion.includes("fallido") || e.accion.includes("cancelar") ? "rojo" : "azul"}>{e.accion}</Badge></Td>
        <Td>{e.entidad}</Td>
        <Td className="max-w-40 truncate font-mono text-[10px] text-muted">{e.entidadId ?? "—"}</Td>
        <Td className="text-xs text-muted">{e.ip ?? "—"}</Td>
        <Td><button className="text-primary hover:underline" onClick={onToggle}>{abierto ? "ocultar" : "detalle"}</button></Td>
      </tr>
      {abierto && (
        <tr>
          <Td colSpan={6} className="bg-page">
            <div className="grid gap-2 p-2 text-xs md:grid-cols-2">
              <div>
                <div className="mb-1 font-semibold text-muted">Estado anterior</div>
                <pre className="overflow-x-auto rounded bg-white p-2">{JSON.stringify(e.estadoAnterior ?? null, null, 2)}</pre>
              </div>
              <div>
                <div className="mb-1 font-semibold text-muted">Estado nuevo</div>
                <pre className="overflow-x-auto rounded bg-white p-2">{JSON.stringify(e.estadoNuevo ?? null, null, 2)}</pre>
              </div>
            </div>
          </Td>
        </tr>
      )}
    </>
  );
}
```

por (nota: `TablaResponsive` ya envuelve `renderFila` en un único `<tr>`, así que la fila de detalle expandible ya no puede ser un segundo `<tr>` — se muestra como un bloque dentro de la última celda cuando `abierto`):

```tsx
function FilaEventoTabla({ e, abierto, onToggle }: { e: Evento; abierto: boolean; onToggle: () => void }) {
  return (
    <>
      <Td className="whitespace-nowrap text-xs">{fmtFecha(e.creadoEn)}</Td>
      <Td><Badge tono={e.accion.includes("fallido") || e.accion.includes("cancelar") ? "rojo" : "azul"}>{e.accion}</Badge></Td>
      <Td>{e.entidad}</Td>
      <Td className="max-w-40 truncate font-mono text-[10px] text-muted">{e.entidadId ?? "—"}</Td>
      <Td className="text-xs text-muted">{e.ip ?? "—"}</Td>
      <Td>
        <button className="text-primary hover:underline" onClick={onToggle}>{abierto ? "ocultar" : "detalle"}</button>
        {abierto && (
          <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
            <div>
              <div className="mb-1 font-semibold text-muted">Estado anterior</div>
              <pre className="overflow-x-auto rounded bg-page p-2">{JSON.stringify(e.estadoAnterior ?? null, null, 2)}</pre>
            </div>
            <div>
              <div className="mb-1 font-semibold text-muted">Estado nuevo</div>
              <pre className="overflow-x-auto rounded bg-page p-2">{JSON.stringify(e.estadoNuevo ?? null, null, 2)}</pre>
            </div>
          </div>
        )}
      </Td>
    </>
  );
}
```

- [ ] **Step 3: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Verificación visual — Admin/Auditoría**

Igual patrón en `/admin/auditoria`. En 375px confirmar que cada tarjeta muestra el detalle JSON siempre visible (sin overflow horizontal — el `<pre>` tiene su propio `overflow-x-auto`). En 1024px confirmar que "detalle"/"ocultar" siguen funcionando como antes.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/admin/auditoria/page.tsx"
git commit -m "feat(responsive): Admin/Auditoría con tarjetas en móvil (TablaResponsive)"
```

---

### Task 12: Admin / Roles — ajustes táctiles (sin `TablaResponsive`)

**Files:**
- Modify: `apps/web/src/app/(app)/admin/roles/page.tsx:74-133`

Esta pantalla ya usa un layout de dos columnas (`lg:grid-cols-[260px_1fr]`) con listas, no tablas — no necesita `TablaResponsive`, solo pasar a columna única antes de `lg` y agrandar objetivos táctiles.

- [ ] **Step 1: Verificar que el grid principal ya es mobile-first**

`<div className="grid gap-4 lg:grid-cols-[260px_1fr]">` ya apila en una columna por debajo de `lg` — no requiere cambio.

- [ ] **Step 2: Agrandar los checkboxes de permisos y el botón de rol para toque**

Reemplazar el `<label>` de permisos:

```tsx
                    <label key={p.codigo} className="flex items-center gap-2 py-0.5 text-sm" title={p.descripcion}>
                      <input
                        type="checkbox"
                        disabled={rol.codigo === "admin_general"}
                        checked={marcados.has(p.codigo)}
                        onChange={() => {
                          const c = new Set(marcados);
                          if (c.has(p.codigo)) c.delete(p.codigo);
                          else c.add(p.codigo);
                          setMarcados(c);
                        }}
                      />
                      {p.codigo.split(":")[1]}
                    </label>
```

por:

```tsx
                    <label key={p.codigo} className="flex min-h-[36px] items-center gap-2 text-sm" title={p.descripcion}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0"
                        disabled={rol.codigo === "admin_general"}
                        checked={marcados.has(p.codigo)}
                        onChange={() => {
                          const c = new Set(marcados);
                          if (c.has(p.codigo)) c.delete(p.codigo);
                          else c.add(p.codigo);
                          setMarcados(c);
                        }}
                      />
                      {p.codigo.split(":")[1]}
                    </label>
```

Reemplazar el botón de selección de rol:

```tsx
                <button
                  onClick={() => seleccionar(r)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${sel === r.id ? "bg-primary-light font-semibold text-primary-dark" : "hover:bg-page"}`}
                >
```

por:

```tsx
                <button
                  onClick={() => seleccionar(r)}
                  className={`flex min-h-[44px] w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${sel === r.id ? "bg-primary-light font-semibold text-primary-dark" : "hover:bg-page"}`}
                >
```

- [ ] **Step 3: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Verificación visual — Admin/Roles**

Igual patrón en `/admin/roles`. Confirmar que en 375px la lista de roles queda arriba y el panel de permisos debajo (una columna), sin overflow horizontal (los grupos de permisos usan `grid-cols-1` bajo `md`, ya correcto).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/admin/roles/page.tsx"
git commit -m "feat(responsive): Admin/Roles con objetivos táctiles ajustados"
```

---

### Task 13: Admin / Configuración — ajustes menores

**Files:**
- Modify: `apps/web/src/app/(app)/admin/configuracion/page.tsx:80-86`

- [ ] **Step 1: Apilar el `dl` de datos de empresa en móvil**

Reemplazar:

```tsx
          <dl className="grid grid-cols-2 gap-2 text-sm">
```

por:

```tsx
          <dl className="grid grid-cols-1 gap-x-2 gap-y-1 text-sm sm:grid-cols-2">
```

- [ ] **Step 2: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Verificación visual — Admin/Configuración**

Igual patrón en `/admin/configuracion`. Confirmar en 375px que la lista `dt/dd` no corta texto largo (RUC, dirección) y el bloque `<pre>` de "Otras claves" no desborda horizontalmente (ya tiene `overflow-x-auto`).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(app)/admin/configuracion/page.tsx"
git commit -m "feat(responsive): Admin/Configuración — datos de empresa apilados en móvil"
```

---

### Task 14: Inventario — tarjeta por producto + sucursal activa

**Files:**
- Modify: `apps/web/src/app/(app)/inventario/page.tsx:54-107`

Caso especial: no usa `TablaResponsive` genérico porque la tarjeta necesita lógica propia (mostrar solo la sucursal activa + expandir el resto).

- [ ] **Step 1: Agregar estado de expansión y helper**

Dentro de `InventarioContenido`, junto a los demás `useState`, agregar:

```tsx
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const toggleExpandido = (id: string) => {
    setExpandido((s) => {
      const c = new Set(s);
      if (c.has(id)) c.delete(id);
      else c.add(id);
      return c;
    });
  };
```

- [ ] **Step 2: Reemplazar el bloque de tabla**

Reemplazar:

```tsx
      {!filas ? (
        <Spinner />
      ) : filas.length === 0 ? (
        <Vacio texto="Sin resultados." />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Código</Th><Th>Producto</Th>
              {sucursales.map((s) => <Th key={s.id} className="text-right">{s.codigo} {s.nombre}</Th>)}
              <Th className="text-right">Mínimo</Th><Th className="w-44"> </Th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const total = f.stocks.reduce((a, s) => a + Number(s.cantidad), 0);
              const bajo = Number(f.producto.stockMinimo) > 0 && total <= Number(f.producto.stockMinimo);
              return (
                <tr key={f.producto.id} className="hover:bg-page">
                  <Td className="font-mono text-xs">{f.producto.sku}</Td>
                  <Td>
                    {f.producto.nombre} {bajo && <Badge tono="rojo" className="ml-1">bajo</Badge>}
                  </Td>
                  {sucursales.map((s) => {
                    const st = f.stocks.find((x) => x.sucursal.id === s.id);
                    return (
                      <Td key={s.id} className="text-right">
                        {fmtQty(st?.cantidad ?? 0)} <span className="text-xs text-muted">@ {fmtMoney(st?.costoPromedio ?? 0)}</span>
                      </Td>
                    );
                  })}
                  <Td className="text-right text-muted">{fmtQty(f.producto.stockMinimo)}</Td>
                  <Td className="text-right">
                    <button className="mr-3 text-primary hover:underline" onClick={() => void verKardex(f.producto)}>kardex</button>
                    {puede("inventario:ajustar") && (
                      <button className="text-primary hover:underline" onClick={() => setAjuste(f)}>ajustar</button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
```

por:

```tsx
      {!filas ? (
        <Spinner />
      ) : filas.length === 0 ? (
        <Vacio texto="Sin resultados." />
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {filas.map((f) => {
              const total = f.stocks.reduce((a, s) => a + Number(s.cantidad), 0);
              const bajo = Number(f.producto.stockMinimo) > 0 && total <= Number(f.producto.stockMinimo);
              const stActiva = f.stocks.find((s) => s.sucursal.id === sucursalId);
              const otras = sucursales.filter((s) => s.id !== sucursalId);
              const abierto = expandido.has(f.producto.id);
              return (
                <div key={f.producto.id} className="rounded-lg border border-border bg-surface p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-muted">{f.producto.sku}</div>
                      <div className="font-medium">{f.producto.nombre} {bajo && <Badge tono="rojo" className="ml-1">bajo</Badge>}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-lg font-bold">{fmtQty(stActiva?.cantidad ?? 0)}</div>
                      <div className="text-xs text-muted">mín. {fmtQty(f.producto.stockMinimo)}</div>
                    </div>
                  </div>
                  {otras.length > 0 && (
                    <button className="mt-1 text-xs text-primary hover:underline" onClick={() => toggleExpandido(f.producto.id)}>
                      {abierto ? "ocultar otras sucursales" : "ver otras sucursales"}
                    </button>
                  )}
                  {abierto && (
                    <div className="mt-1 grid grid-cols-2 gap-1 text-xs text-muted">
                      {otras.map((s) => {
                        const st = f.stocks.find((x) => x.sucursal.id === s.id);
                        return <div key={s.id}>{s.codigo}: <span className="text-ink">{fmtQty(st?.cantidad ?? 0)}</span></div>;
                      })}
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-3 border-t border-border pt-2 text-sm">
                    <button className="min-h-[44px] px-1 text-primary hover:underline" onClick={() => void verKardex(f.producto)}>kardex</button>
                    {puede("inventario:ajustar") && (
                      <button className="min-h-[44px] px-1 text-primary hover:underline" onClick={() => setAjuste(f)}>ajustar</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden md:block">
            <Tabla>
              <thead>
                <tr>
                  <Th>Código</Th><Th>Producto</Th>
                  {sucursales.map((s) => <Th key={s.id} className="text-right">{s.codigo} {s.nombre}</Th>)}
                  <Th className="text-right">Mínimo</Th><Th className="w-44"> </Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const total = f.stocks.reduce((a, s) => a + Number(s.cantidad), 0);
                  const bajo = Number(f.producto.stockMinimo) > 0 && total <= Number(f.producto.stockMinimo);
                  return (
                    <tr key={f.producto.id} className="hover:bg-page">
                      <Td className="font-mono text-xs">{f.producto.sku}</Td>
                      <Td>
                        {f.producto.nombre} {bajo && <Badge tono="rojo" className="ml-1">bajo</Badge>}
                      </Td>
                      {sucursales.map((s) => {
                        const st = f.stocks.find((x) => x.sucursal.id === s.id);
                        return (
                          <Td key={s.id} className="text-right">
                            {fmtQty(st?.cantidad ?? 0)} <span className="text-xs text-muted">@ {fmtMoney(st?.costoPromedio ?? 0)}</span>
                          </Td>
                        );
                      })}
                      <Td className="text-right text-muted">{fmtQty(f.producto.stockMinimo)}</Td>
                      <Td className="text-right">
                        <button className="mr-3 text-primary hover:underline" onClick={() => void verKardex(f.producto)}>kardex</button>
                        {puede("inventario:ajustar") && (
                          <button className="text-primary hover:underline" onClick={() => setAjuste(f)}>ajustar</button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          </div>
        </>
      )}
```

- [ ] **Step 3: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Verificación visual — Inventario**

Igual patrón en `/inventario`. En 375px: tarjeta por producto muestra solo el stock de la sucursal activa (la que está seleccionada en el header), badge "bajo" si aplica, y "ver otras sucursales" expande una grilla 2 columnas. En 768px+: tabla completa sin cambios. Confirmar que el diálogo de Kardex (ya ajustado en Task 4) sigue mostrando su tabla ancha con scroll horizontal interno.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/inventario/page.tsx"
git commit -m "feat(responsive): Inventario con tarjeta por producto y sucursal activa en móvil"
```

---

### Task 15: Dashboard — `TablaResponsive` en tablas internas

**Files:**
- Modify: `apps/web/src/app/(app)/page.tsx:206-260`

**Interfaces:**
- Consumes: `TablaResponsive` (Task 5).

- [ ] **Step 1: Import**

```tsx
import { Badge, Card, Spinner, TablaResponsive, Td, Th, Vacio, cx } from "@/components/ui";
```

- [ ] **Step 2: Reemplazar la tabla "Stock bajo mínimo"**

Reemplazar:

```tsx
            <>
              <div className="max-h-64 overflow-y-auto">
                <Tabla>
                  <thead>
                    <tr><Th>Código</Th><Th>Producto</Th><Th className="text-right">Stock</Th><Th className="text-right">Mínimo</Th></tr>
                  </thead>
                  <tbody>
                    {pagBajo.filas.map((f) => {
                      const cantidad = f.stocks.find((s) => s.sucursal.id === sucursalId)?.cantidad ?? "0";
                      return (
                        <tr key={f.producto.id}>
                          <Td className="font-mono text-xs">{f.producto.sku}</Td>
                          <Td><Link className="text-primary hover:underline" href={`/productos/${f.producto.id}`}>{f.producto.nombre}</Link></Td>
                          <Td className="text-right font-semibold text-danger">{fmtQty(cantidad)}</Td>
                          <Td className="text-right text-muted">{fmtQty(f.producto.stockMinimo)}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Tabla>
              </div>
              <div className="mt-2">
                <Paginador p={pagBajo} nombre="producto(s) bajo mínimo" />
              </div>
            </>
```

por:

```tsx
            <>
              <div className="max-h-64 overflow-y-auto">
                <TablaResponsive
                  filas={pagBajo.filas}
                  claveFila={(f) => f.producto.id}
                  encabezado={<><Th>Código</Th><Th>Producto</Th><Th className="text-right">Stock</Th><Th className="text-right">Mínimo</Th></>}
                  renderFila={(f) => {
                    const cantidad = f.stocks.find((s) => s.sucursal.id === sucursalId)?.cantidad ?? "0";
                    return (
                      <>
                        <Td className="font-mono text-xs">{f.producto.sku}</Td>
                        <Td><Link className="text-primary hover:underline" href={`/productos/${f.producto.id}`}>{f.producto.nombre}</Link></Td>
                        <Td className="text-right font-semibold text-danger">{fmtQty(cantidad)}</Td>
                        <Td className="text-right text-muted">{fmtQty(f.producto.stockMinimo)}</Td>
                      </>
                    );
                  }}
                  renderTarjeta={(f) => {
                    const cantidad = f.stocks.find((s) => s.sucursal.id === sucursalId)?.cantidad ?? "0";
                    return (
                      <Link href={`/productos/${f.producto.id}`} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-xs text-muted">{f.producto.sku}</div>
                          <div className="text-primary">{f.producto.nombre}</div>
                        </div>
                        <div className="shrink-0 text-right text-sm">
                          <div className="font-semibold text-danger">{fmtQty(cantidad)}</div>
                          <div className="text-xs text-muted">mín. {fmtQty(f.producto.stockMinimo)}</div>
                        </div>
                      </Link>
                    );
                  }}
                />
              </div>
              <div className="mt-2">
                <Paginador p={pagBajo} nombre="producto(s) bajo mínimo" />
              </div>
            </>
```

- [ ] **Step 3: Reemplazar la tabla "Más vendidos"**

Reemplazar:

```tsx
            <Tabla>
              <thead>
                <tr><Th>Producto</Th><Th className="text-right">Unid.</Th><Th className="text-right">Vendido</Th><Th className="text-right">Utilidad</Th></tr>
              </thead>
              <tbody>
                {datos.topProductos7d.map((t) => (
                  <tr key={t.productoId}>
                    <Td>{t.descripcion}</Td>
                    <Td className="text-right">{fmtQty(t.unidades)}</Td>
                    <Td className="text-right font-medium">{fmtMoney(t.importe)}</Td>
                    <Td className="text-right font-medium text-success">{fmtMoney(t.utilidad)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
```

por:

```tsx
            <TablaResponsive
              filas={datos.topProductos7d}
              claveFila={(t) => t.productoId}
              encabezado={<><Th>Producto</Th><Th className="text-right">Unid.</Th><Th className="text-right">Vendido</Th><Th className="text-right">Utilidad</Th></>}
              renderFila={(t) => (
                <>
                  <Td>{t.descripcion}</Td>
                  <Td className="text-right">{fmtQty(t.unidades)}</Td>
                  <Td className="text-right font-medium">{fmtMoney(t.importe)}</Td>
                  <Td className="text-right font-medium text-success">{fmtMoney(t.utilidad)}</Td>
                </>
              )}
              renderTarjeta={(t) => (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate">{t.descripcion}</div>
                  <div className="shrink-0 text-right text-sm">
                    <div>{fmtQty(t.unidades)} unid. · {fmtMoney(t.importe)}</div>
                    <div className="font-medium text-success">+{fmtMoney(t.utilidad)}</div>
                  </div>
                </div>
              )}
            />
```

- [ ] **Step 4: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: sin errores. Confirmar que `Td` sigue importado (se usa en `renderFila`) aunque `Tabla` ya no.

- [ ] **Step 5: Verificación visual — Dashboard**

Igual patrón en `/`. Confirmar en 375px las 4 tarjetas de la fila 1 en `grid-cols-2` (ya era así), las tarjetas de "Caja"/"Por cobrar"/"Pendientes" en una columna, y las dos tablas de la fila 3 convertidas a listas de tarjetas legibles sin overflow.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(app)/page.tsx"
git commit -m "feat(responsive): Dashboard con TablaResponsive en tablas internas"
```

---

### Task 16: Vender (POS) — overhaul móvil

**Files:**
- Modify: `apps/web/src/app/(app)/vender/page.tsx`

- [ ] **Step 1: Layout general — sticky bottom bar en vez de columna lateral fija**

Reemplazar el contenedor raíz:

```tsx
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
      <div className="space-y-3">
```

por:

```tsx
  return (
    <div className="grid gap-4 pb-40 xl:grid-cols-[1fr_300px] xl:pb-0">
      <div className="space-y-3">
```

(`pb-40` deja espacio para la barra de totales sticky que se agrega más abajo; `xl:pb-0` la quita en desktop porque ahí la columna de totales ya no es sticky).

- [ ] **Step 2: Resultados de búsqueda con filas táctiles más altas**

Reemplazar la clase del botón de resultado:

```tsx
                    className={cx("flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm", i === sel ? "bg-primary-light" : "hover:bg-page")}
```

por:

```tsx
                    className={cx("flex min-h-[52px] w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm", i === sel ? "bg-primary-light" : "hover:bg-page")}
```

- [ ] **Step 3: Tabla de líneas → tarjetas en `<768px`**

Reemplazar el bloque `<Tabla>...</Tabla>` de las líneas de venta:

```tsx
        <Tabla>
          <thead>
            <tr>
              <Th>Producto</Th><Th className="w-24 text-right">Cantidad</Th><Th className="w-28 text-right">Precio</Th>
              <Th className="w-28 text-right">Descuento</Th><Th className="w-28 text-right">Importe</Th><Th className="w-10"> </Th>
            </tr>
          </thead>
          <tbody>
            {lineas.length === 0 && (
              <tr><Td colSpan={6}><Vacio texto="Busque un producto y presione Enter para agregarlo." /></Td></tr>
            )}
            {lineas.map((l, i) => {
              const bruto = Math.round(Number(l.producto.precioBase) * Number(l.cantidad || 0) * 100) / 100;
              const descAplicado = Math.min(montoDescuento(l.descuento, bruto), bruto);
              return (
                <tr key={l.producto.id}>
                  <Td>
                    <div className="font-medium">{l.producto.nombre}</div>
                    <div className="font-mono text-xs text-muted">{l.producto.sku} · {l.producto.unidadMedida.codigo}</div>
                  </Td>
                  <Td>
                    <Input
                      className="text-right"
                      inputMode="decimal"
                      value={l.cantidad}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, cantidad: v } : x)));
                      }}
                    />
                  </Td>
                  <Td>
                    <InputPrecio key={`${l.descuento}|${l.cantidad}`} valor={precioEfectivo(l)} onCommit={(n) => cambiarPrecio(i, n)} />
                  </Td>
                  <Td className="text-right">
                    <DescuentoPopover
                      valor={l.descuento}
                      presets={presets}
                      ariaLabel="Descuento de la línea"
                      onCambiar={(v) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, descuento: v } : x)))}
                    />
                    {l.descuento.trim().endsWith("%") && descAplicado > 0 && (
                      <div className="mt-0.5 text-right text-[10px] text-muted">= {fmtMoney(descAplicado)}</div>
                    )}
                  </Td>
                  <Td className="text-right font-medium">{fmtMoney(bruto - descAplicado)}</Td>
                  <Td>
                    <button className="text-danger hover:underline" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}>✕</button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
```

por:

```tsx
        {lineas.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface"><Vacio texto="Busque un producto y presione Enter para agregarlo." /></div>
        ) : (
          <>
            <div className="space-y-2 md:hidden">
              {lineas.map((l, i) => {
                const bruto = Math.round(Number(l.producto.precioBase) * Number(l.cantidad || 0) * 100) / 100;
                const descAplicado = Math.min(montoDescuento(l.descuento, bruto), bruto);
                return (
                  <div key={l.producto.id} className="rounded-lg border border-border bg-surface p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{l.producto.nombre}</div>
                        <div className="font-mono text-xs text-muted">{l.producto.sku} · {l.producto.unidadMedida.codigo}</div>
                      </div>
                      <button className="flex h-9 w-9 shrink-0 items-center justify-center text-danger" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} aria-label="Quitar línea">✕</button>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <Campo etiqueta="Cantidad">
                        <Input className="text-right" inputMode="decimal" value={l.cantidad} onChange={(e) => {
                          const v = e.target.value;
                          setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, cantidad: v } : x)));
                        }} />
                      </Campo>
                      <Campo etiqueta="Precio">
                        <InputPrecio key={`${l.descuento}|${l.cantidad}`} valor={precioEfectivo(l)} onCommit={(n) => cambiarPrecio(i, n)} />
                      </Campo>
                      <Campo etiqueta="Descuento">
                        <DescuentoPopover
                          valor={l.descuento}
                          presets={presets}
                          ariaLabel="Descuento de la línea"
                          onCambiar={(v) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, descuento: v } : x)))}
                        />
                      </Campo>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
                      <span className="text-muted">Importe</span>
                      <span className="font-semibold">{fmtMoney(bruto - descAplicado)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden md:block">
              <Tabla>
                <thead>
                  <tr>
                    <Th>Producto</Th><Th className="w-24 text-right">Cantidad</Th><Th className="w-28 text-right">Precio</Th>
                    <Th className="w-28 text-right">Descuento</Th><Th className="w-28 text-right">Importe</Th><Th className="w-10"> </Th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, i) => {
                    const bruto = Math.round(Number(l.producto.precioBase) * Number(l.cantidad || 0) * 100) / 100;
                    const descAplicado = Math.min(montoDescuento(l.descuento, bruto), bruto);
                    return (
                      <tr key={l.producto.id}>
                        <Td>
                          <div className="font-medium">{l.producto.nombre}</div>
                          <div className="font-mono text-xs text-muted">{l.producto.sku} · {l.producto.unidadMedida.codigo}</div>
                        </Td>
                        <Td>
                          <Input
                            className="text-right"
                            inputMode="decimal"
                            value={l.cantidad}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, cantidad: v } : x)));
                            }}
                          />
                        </Td>
                        <Td>
                          <InputPrecio key={`${l.descuento}|${l.cantidad}`} valor={precioEfectivo(l)} onCommit={(n) => cambiarPrecio(i, n)} />
                        </Td>
                        <Td className="text-right">
                          <DescuentoPopover
                            valor={l.descuento}
                            presets={presets}
                            ariaLabel="Descuento de la línea"
                            onCambiar={(v) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, descuento: v } : x)))}
                          />
                          {l.descuento.trim().endsWith("%") && descAplicado > 0 && (
                            <div className="mt-0.5 text-right text-[10px] text-muted">= {fmtMoney(descAplicado)}</div>
                          )}
                        </Td>
                        <Td className="text-right font-medium">{fmtMoney(bruto - descAplicado)}</Td>
                        <Td>
                          <button className="text-danger hover:underline" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}>✕</button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Tabla>
            </div>
          </>
        )}
```

- [ ] **Step 4: Panel de Totales → sticky bottom bar en `<1024px`**

Reemplazar el `<div className="space-y-3">` que envuelve la Card de "Totales" y "En preparación":

```tsx
      <div className="space-y-3">
        <Card titulo="Totales">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{fmtMoney(totales.subtotal)}</dd></div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 text-muted">
                Descuento
                <DescuentoPopover
                  valor=""
                  ariaLabel="Descuento general (aplica a toda la venta)"
                  presets={presets}
                  onCambiar={(v) => {
                    if (!v || !lineas.length) return;
                    setLineas((ls) => ls.map((x) => ({ ...x, descuento: v })));
                  }}
                />
              </dt>
              <dd className="text-accent">−{fmtMoney(totales.descuento)}</dd>
            </div>
            <div className="flex justify-between"><dt className="text-muted">ITBMS</dt><dd>{fmtMoney(totales.itbms)}</dd></div>
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-lg font-bold">
              <dt>Total</dt><dd className="text-primary">{fmtMoney(totales.total)}</dd>
            </div>
          </dl>
          <Button className="mt-3 w-full py-2.5 text-base" disabled={enviando || lineas.length === 0} onClick={() => void enviar()}>
            {enviando ? "Enviando…" : "Enviar a caja (F9)"}
          </Button>
          <p className="mt-2 text-center text-xs text-muted">La caja cobra, factura y entrega (D-020).</p>
        </Card>

        <Card titulo="En preparación (esta sucursal)">
          {enPreparacion.length === 0 ? (
            <Vacio texto="No hay ventas esperando cobro." />
          ) : (
            <ul className="space-y-2 text-sm">
              {enPreparacion.map((v) => (
                <li key={v.id} className="flex items-center justify-between rounded border border-border px-2 py-1.5">
                  <span className="min-w-0 truncate">{v.cliente.nombre}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-medium">{fmtMoney(v.total)}</span>
                    <button className="text-xs text-danger hover:underline" onClick={() => void cancelarPreparacion(v.id)}>cancelar</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
```

por:

```tsx
      <div className="space-y-3 xl:space-y-3">
        <div className="hidden xl:block">
          <Card titulo="Totales">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{fmtMoney(totales.subtotal)}</dd></div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-muted">
                  Descuento
                  <DescuentoPopover
                    valor=""
                    ariaLabel="Descuento general (aplica a toda la venta)"
                    presets={presets}
                    onCambiar={(v) => {
                      if (!v || !lineas.length) return;
                      setLineas((ls) => ls.map((x) => ({ ...x, descuento: v })));
                    }}
                  />
                </dt>
                <dd className="text-accent">−{fmtMoney(totales.descuento)}</dd>
              </div>
              <div className="flex justify-between"><dt className="text-muted">ITBMS</dt><dd>{fmtMoney(totales.itbms)}</dd></div>
              <div className="mt-2 flex justify-between border-t border-border pt-2 text-lg font-bold">
                <dt>Total</dt><dd className="text-primary">{fmtMoney(totales.total)}</dd>
              </div>
            </dl>
            <Button className="mt-3 w-full py-2.5 text-base" disabled={enviando || lineas.length === 0} onClick={() => void enviar()}>
              {enviando ? "Enviando…" : "Enviar a caja (F9)"}
            </Button>
            <p className="mt-2 text-center text-xs text-muted">La caja cobra, factura y entrega (D-020).</p>
          </Card>
        </div>

        <Card titulo="En preparación (esta sucursal)">
          {enPreparacion.length === 0 ? (
            <Vacio texto="No hay ventas esperando cobro." />
          ) : (
            <ul className="space-y-2 text-sm">
              {enPreparacion.map((v) => (
                <li key={v.id} className="flex items-center justify-between rounded border border-border px-2 py-1.5">
                  <span className="min-w-0 truncate">{v.cliente.nombre}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-medium">{fmtMoney(v.total)}</span>
                    <button className="min-h-[44px] px-1 text-xs text-danger hover:underline" onClick={() => void cancelarPreparacion(v.id)}>cancelar</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-surface p-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] xl:hidden">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted">Total ({lineas.length} línea{lineas.length === 1 ? "" : "s"})</span>
          <span className="text-lg font-bold text-primary">{fmtMoney(totales.total)}</span>
        </div>
        <Button className="w-full py-2.5 text-base" disabled={enviando || lineas.length === 0} onClick={() => void enviar()}>
          {enviando ? "Enviando…" : "Enviar a caja (F9)"}
        </Button>
      </div>
```

Nota: `bottom-16` posiciona la barra justo encima de la `BarraInferior` fija del shell (que mide `min-h-[56px]` ≈ 56px = `14`; se usa `16` = 64px de Tailwind para dejar margen). `xl:hidden` la oculta en desktop, donde la Card de Totales (ahora `hidden xl:block`) vuelve a ser la única fuente de totales.

- [ ] **Step 5: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 6: Verificación visual — Vender**

Igual patrón en `/vender`. En 375/390/430px: buscar un producto, agregarlo, confirmar que aparece como tarjeta con cantidad/precio/descuento editables y que la barra inferior sticky muestra el total y el botón "Enviar a caja" siempre visible sobre la barra de navegación, sin que ambas se superpongan. En 1024px (por debajo de `xl`=1280px): confirma que también se ve la barra sticky (columna lateral aún oculta hasta `xl`). En desktop ancho (≥1280px): columna lateral de Totales visible, sin barra sticky, igual que antes del cambio.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/(app)/vender/page.tsx"
git commit -m "feat(responsive): Vender (POS) con tarjetas de línea y barra de totales sticky en móvil"
```

---

### Task 17: Caja (POS) — overhaul móvil

**Files:**
- Modify: `apps/web/src/app/(app)/caja/page.tsx`

- [ ] **Step 1: Grid de métodos de pago — 2 columnas en móvil**

Reemplazar:

```tsx
      <div className="grid gap-3 text-sm md:grid-cols-5">
```

por:

```tsx
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
```

- [ ] **Step 2: Lista de ventas + panel de cobro — flujo secuencial en `<1024px`**

Reemplazar:

```tsx
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
```

por:

```tsx
      <div className="grid gap-4 pb-24 lg:grid-cols-[340px_1fr] lg:pb-0">
```

(el `pb-24` dejará espacio para la barra sticky de "Cobrar" agregada en el Step 4; en `lg` ambas columnas ya se ven completas lado a lado, se quita el padding).

- [ ] **Step 3: Fila de pago — apilada en `<640px`**

Reemplazar:

```tsx
                {pagos.map((p, i) => (
                  <div key={i} className="grid grid-cols-[130px_1fr_1fr_32px] items-center gap-2">
                    <Select value={p.metodo} onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, metodo: e.target.value as Metodo } : x)))}>
                      {METODOS.map((m) => <option key={m} value={m}>{m === "ACH" ? "ACH/Transf." : m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
                    </Select>
                    <Input inputMode="decimal" placeholder="Monto" value={p.monto} onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))} />
                    <Input placeholder={p.metodo === "TARJETA" ? "Voucher datáfono" : p.metodo === "EFECTIVO" ? "—" : "Referencia"} disabled={p.metodo === "EFECTIVO"} value={p.referencia} onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, referencia: e.target.value } : x)))} />
                    <button className="text-danger" onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))} disabled={pagos.length === 1}>✕</button>
                  </div>
                ))}
```

por:

```tsx
                {pagos.map((p, i) => (
                  <div key={i} className="grid grid-cols-2 items-end gap-2 border-b border-border pb-2 last:border-0 last:pb-0 sm:grid-cols-[130px_1fr_1fr_32px] sm:items-center sm:border-0 sm:pb-0">
                    <Select className="col-span-2 sm:col-span-1" value={p.metodo} onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, metodo: e.target.value as Metodo } : x)))}>
                      {METODOS.map((m) => <option key={m} value={m}>{m === "ACH" ? "ACH/Transf." : m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
                    </Select>
                    <Input inputMode="decimal" placeholder="Monto" value={p.monto} onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))} />
                    <Input placeholder={p.metodo === "TARJETA" ? "Voucher datáfono" : p.metodo === "EFECTIVO" ? "—" : "Referencia"} disabled={p.metodo === "EFECTIVO"} value={p.referencia} onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, referencia: e.target.value } : x)))} />
                    <button className="flex h-11 w-11 items-center justify-center text-danger sm:h-auto sm:w-auto" onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))} disabled={pagos.length === 1}>✕</button>
                  </div>
                ))}
```

- [ ] **Step 4: Botón "Cobrar y facturar" — sticky bottom en `<1024px`**

Reemplazar:

```tsx
              <Button className="w-full py-2.5 text-base" disabled={cobrando || Math.abs(faltante) >= 0.005} onClick={() => void cobrar()}>
                {cobrando ? "Cobrando…" : "Cobrar y facturar"} <Kbd>F9</Kbd>
              </Button>
```

por:

```tsx
              <Button className="hidden w-full py-2.5 text-base lg:flex" disabled={cobrando || Math.abs(faltante) >= 0.005} onClick={() => void cobrar()}>
                {cobrando ? "Cobrando…" : "Cobrar y facturar"} <Kbd>F9</Kbd>
              </Button>
```

Y agregar la barra sticky justo antes del cierre del `<Card titulo={venta ? ... : "Cobro"}>` (después del `</div>` que cierra el `space-y-3` interno del cobro, dentro del bloque `{venta && (...)}`, pero fuera del `Card` para que quede fija a la pantalla). Ubicarla al final del `return` del componente `CajaPage`, junto a los otros modales:

```tsx
      {venta && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface p-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
          <Button className="w-full py-2.5 text-base" disabled={cobrando || Math.abs(faltante) >= 0.005} onClick={() => void cobrar()}>
            {cobrando ? "Cobrando…" : "Cobrar y facturar"} <Kbd>F9</Kbd>
          </Button>
        </div>
      )}

      {resultado && <ResultadoCobro r={resultado} onCerrar={() => setResultado(null)} />}
```

(reemplaza la línea existente `{resultado && <ResultadoCobro r={resultado} onCerrar={() => setResultado(null)} />}` agregando el bloque nuevo justo antes).

- [ ] **Step 5: Verificar tipos**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 6: Verificación visual — Caja**

Igual patrón en `/caja`. En 375/390/430px: grid de métodos de pago en 2 columnas, lista de "ventas en preparación" arriba y panel de cobro debajo (una columna), fila de pago apilada con el botón ✕ alineado a la derecha, y al seleccionar una venta aparece la barra sticky "Cobrar y facturar" en la parte inferior sin ocultar el botón "Cobrar y facturar (F9)" de escritorio (que en móvil está oculto). En 1024px+: 2 columnas lado a lado, sin barra sticky, botón dentro de la card como antes.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/(app)/caja/page.tsx"
git commit -m "feat(responsive): Caja (POS) con flujo secuencial y barra de cobro sticky en móvil"
```

---

### Task 18: Validación cruzada final

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Recorrido completo por breakpoint**

Con el dev server corriendo, para cada una de estas rutas — `/login`, `/`, `/vender`, `/caja`, `/productos`, `/inventario`, `/clientes`, `/proveedores`, `/facturas`, `/admin/usuarios`, `/admin/roles`, `/admin/auditoria`, `/admin/configuracion` — repetir el patrón de "Verificación visual" (320, 375, 390, 430, 768, 1024) y registrar cualquier hallazgo de overflow horizontal, solapamiento, texto cortado o acción inalcanzable.

- [ ] **Step 2: Casos de teclado físico (regresión de escritorio)**

En 1024px+, confirmar que los atajos F1-F9 del `Shell` y de `Vender`/`Caja` (búsqueda ↑/↓/Enter, F9 enviar/cobrar) siguen funcionando exactamente igual que antes del plan — no deben haberse tocado en ningún task.

- [ ] **Step 3: Corregir hallazgos**

Si algún hallazgo del Step 1 requiere ajuste, aplicarlo directamente en el archivo correspondiente (mismos patrones de las tareas anteriores: `md:hidden`/`hidden md:block`, `min-h-[44px]`, `overflow-x-auto` contenido). Repetir Step 1 para esa pantalla tras el ajuste.

- [ ] **Step 4: Build de producción**

```bash
cd apps/web && npm run build
```

Expected: build exitoso sin errores ni warnings nuevos de tipo/lint relacionados a los archivos tocados.

- [ ] **Step 5: Commit final (solo si el Step 3 generó cambios)**

```bash
git add -A
git commit -m "fix(responsive): ajustes finales tras validación cruzada por breakpoint"
```

---

## Resumen de cobertura (spec → tareas)

| Sección del spec | Tarea(s) |
|---|---|
| 1. Fundamentos técnicos | Task 1 |
| 2. Shell / navegación | Task 2, Task 3 |
| 3. Modales | Task 4 |
| 4. Tablas de datos | Task 5, 6, 7, 8, 9, 10, 11, 12, 13 |
| 5. Inventario | Task 14 |
| 6. Vender / Caja | Task 16, Task 17 |
| 7. Login y Dashboard | Task 1 (login), Task 15 (dashboard) |
| Plan de pruebas | Task 18 |
