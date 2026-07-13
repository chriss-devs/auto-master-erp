# Compatibilidad móvil completa — Auto Master ERP

**Fecha:** 2026-07-12
**Estado:** Aprobado, pendiente de implementación

## Objetivo

Que toda la aplicación web (login, dashboard, POS/vender, caja, inventario, clientes,
proveedores, facturas, productos, admin) se vea, funcione y sea cómoda de usar en
celulares, con un excelente soporte de escritorio intacto. Tablet se resuelve como
extensión simple del layout móvil, sin diseño dedicado.

Rango de validación: 320px, 375px, 390px, 430px, 768px, desktop (≥1024px).

No se toca lógica de negocio, permisos, APIs ni datos — solo interfaz, estilos y
comportamiento de presentación (salvo ajustes mínimos indispensables, ej. mover
"cambiar contraseña"/"salir" del pie del sidebar al drawer móvil).

## Breakpoints

Se usan los breakpoints por defecto de Tailwind, mobile-first (sin prefijo = base
móvil, luego se agregan overrides):

- **base (< 640px)**: teléfonos.
- **sm (≥640px)**: teléfonos grandes / modales dejan de ser hoja completa.
- **md (≥768px)**: tablets verticales — tablas de datos vuelven a formato tabla;
  Inventario vuelve a mostrar todas las columnas de sucursal.
- **lg (≥1024px)**: layout de escritorio — vuelve el sidebar fijo actual, desaparece
  la barra inferior/drawer móvil.

## 1. Fundamentos técnicos (transversales)

- Reemplazar `h-screen overflow-hidden` del shell por `h-dvh` (`100dvh`), para que el
  teclado móvil no corte contenido ni deje huecos.
- `Input`/`Select` en `ui.tsx`: `text-base` en base, `sm:text-sm` desde 640px — evita
  el auto-zoom de iOS Safari (dispara con inputs <16px).
- `Button` y acciones de tabla (links `editar`/`kardex`/`cancelar`/`✕`): tamaño
  táctil mínimo ~44px de alto/ancho en base, vuelve al tamaño denso actual desde `md`.
- `overflow-x-hidden` a nivel de `body`/contenedor raíz; cualquier scroll horizontal
  queda contenido y explícito solo donde el diseño lo defina (Kardex, ciertas tablas).

## 2. Shell / navegación (`app/(app)/layout.tsx`)

**`< 1024px`:**
- Header compacto: logo, selector de sucursal (mismo `Select`, ancho completo o
  casi), botón hamburguesa (☰) que abre el drawer.
- Barra inferior fija (con `env(safe-area-inset-bottom)`): 5 accesos directos —
  Dashboard, Vender, Caja, Productos, Inventario (los que hoy tienen atajo F1-F6) —
  ícono FontAwesome + etiqueta corta, resaltando ruta activa.
- Drawer lateral (desde la izquierda, overlay): resto de `NAV` (Clientes,
  Proveedores, Facturas, Admin/*), datos de usuario, "Cambiar contraseña" y "Salir".
- El filtrado por `puede(permiso)` no cambia — solo el contenedor visual.
- Atajos de teclado (F1-F9) se mantienen sin cambios (no afectan táctil).

**`≥ 1024px`:** sin cambios — sidebar fijo actual.

## 3. Modales (`Dialogo` en `ui.tsx`)

- **`< 640px`**: hoja de pantalla completa — desliza desde abajo, ocupa `100dvh`,
  header fijo arriba (título + ✕), contenido con scroll interno, footer fijo abajo
  con el botón de acción principal (para que nunca quede oculto tras el teclado).
- **`≥ 640px`**: sin cambios — modal centrado actual (`pt-[8vh]`, anchos `max-w-*`).
- Se preserva: cierre con Escape (salvo `forzado`), foco inicial automático,
  `forzado` sin botón de cierre.

## 4. Tablas de datos (Clientes, Proveedores, Productos, Facturas, Admin/*)

Nuevo componente reutilizable en `components/ui.tsx`: **`TablaResponsive`**.

- Recibe las filas + una función de render de tarjeta (para `<768px`) y usa
  internamente `Tabla`/`Th`/`Td` para `≥768px` — una sola fuente de datos por
  pantalla, sin duplicar lógica.
- Tarjeta: campo principal destacado (nombre/SKU), 2-3 datos secundarios, badges de
  estado, acciones como botones táctiles en vez de links de texto pequeño.
- `Paginador`: botones con tamaño táctil ≥44px en base.
- Aplica a: Clientes, Proveedores, Productos, Facturas, Admin (Usuarios, Roles,
  Auditoría).

## 5. Inventario (caso especial — columnas dinámicas por sucursal)

- **`< 768px`**: tarjeta por producto — SKU, nombre, stock de la **sucursal activa**
  (la ya seleccionada en el header) + badge "bajo mínimo" si aplica. Acción "ver
  otras sucursales" expande inline el resto de columnas como lista.
- **`≥ 768px`**: tabla actual sin cambios (todas las columnas de sucursal).
- Diálogo de Ajuste: usa el patrón de modal responsive (sección 3).
- Kardex: modal responsive, pero el contenido interno (tabla ancha, solo lectura)
  mantiene scroll horizontal controlado dentro del modal en vez de convertirse en
  tarjetas — es consulta puntual, no un flujo de edición.

## 6. Flujos POS críticos

### Vender (`app/(app)/vender/page.tsx`)

- Buscador: ancho completo, resultados como lista táctil con filas más altas
  (mantiene navegación ↑/↓/Enter en teclado físico).
- Tabla de líneas → tarjetas apiladas en `<768px`: nombre/SKU arriba; fila de
  cantidad/precio/descuento con inputs de tamaño táctil; importe destacado; botón
  quitar con área táctil clara. `≥768px`: tabla actual sin cambios.
- Panel "Totales" + botón "Enviar a caja": en `<1024px` se vuelve **barra inferior
  sticky** (siempre visible sobre la barra de navegación inferior, sin necesidad de
  scroll) en vez de columna lateral fija de 300px. `≥1024px`: sin cambios.
- "En preparación": ya es lista de tarjetas, solo ajustes de tamaño táctil.

### Caja (`app/(app)/caja/page.tsx`)

- Grid de métodos de pago: `grid-cols-2` en base en vez de `md:grid-cols-5`.
- Lista "ventas en preparación" + panel de cobro: en `<1024px` pasan de 2 columnas
  lado a lado a **flujo secuencial** (selecciono venta arriba → panel de cobro
  aparece debajo, con scroll a la vista). `≥1024px`: sin cambios (2 columnas).
- Fila de pago (grid `130px/1fr/1fr/32px`): se apila en columna en `<640px`
  (método, monto, referencia, con el botón quitar alineado a la derecha).
- Botón "Cobrar y facturar": barra inferior sticky en `<1024px`, igual que en Vender.

## 7. Login y Dashboard

- **Login**: ya es una card centrada de `max-w-sm`; solo aplica fundamentos
  técnicos (input 16px, botón táctil) — sin cambios estructurales.
- **Dashboard**: grids ya usan `grid-cols-2 lg:grid-cols-4` / `lg:grid-cols-3` /
  `lg:grid-cols-2` — mobile-first casi completo. Ajustes menores: gráfico de barras
  de 7 días y tablas internas (`Stock bajo mínimo`, `Más vendidos`) usan
  `TablaResponsive` de la sección 4.

## Fuera de alcance

- Lógica de negocio, permisos, endpoints, formato de datos.
- Rediseño visual/de marca (colores, tipografía) fuera de lo necesario para
  legibilidad táctil.
- Modo offline / PWA.
- Reportes/gráficos avanzados no mencionados arriba (se listan como pendiente si
  aparecen pantallas no cubiertas al implementar).

## Plan de pruebas

Para cada pantalla modificada, verificar en 320px, 375px, 390px, 430px, 768px y
desktop:
- Sin overflow horizontal no intencional.
- Sin solapamientos ni texto cortado.
- Modales no quedan cortados ni ocultan su acción principal.
- Botones y acciones críticas alcanzables y no ocultas tras teclado/barra inferior.
- Navegación por teclado (Tab/Escape) y atajos F1-F9 siguen funcionando en desktop.
