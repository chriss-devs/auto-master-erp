# Rediseño de descuentos en Vender: presets configurables + precio editable

## Contexto

En `apps/web/src/app/(app)/vender/page.tsx`, el descuento por línea es hoy un
input de texto libre (`l.descuento`, acepta `"1.50"` o `"10%"`), parseado por
`montoDescuento()`. No existe forma de aplicar un descuento al total de la
venta ni de elegir un % con un clic — el usuario debe escribirlo a mano en
cada línea. Tampoco hay forma de editar el precio unitario de una línea.

El backend (`apps/api`) solo soporta descuento **por línea**, en monto B/.
(`LineaVentaDto.descuento`, validado `MONEY`). No existe un campo de
descuento a nivel de venta, ni un campo de precio unitario editable —
`ventas.service.ts` siempre calcula `precioUnitario` desde `producto.precioBase`
o el precio especial del cliente (D-024). El umbral de autorización de
descuentos (RN-160) se calcula sobre `descuentoTotal / subtotal` de todas las
líneas.

## Decisiones (confirmadas con el usuario)

1. El "descuento al total" **no** es un campo nuevo en el backend: se reparte
   aplicando el mismo % a cada línea (matemáticamente equivalente a un
   descuento parejo sobre el total), reutilizando el campo `descuento` que ya
   existe por línea.
2. Los presets son **solo porcentajes**, compartidos entre el popover de línea
   y el del total (un solo conjunto configurable).
3. El precio unitario editable **no** se manda como precio al backend: se
   traduce a un descuento en monto B/. equivalente (`precioLista − precioNuevo`)
   y se envía por el campo `descuento` existente — así pasa por la misma
   autorización RN-160 que cualquier otro descuento, sin abrir un hueco de
   seguridad. Nunca permite un precio *mayor* al de lista (sería un cargo
   extra, no soportado).
4. Los presets se ajustan en Admin → Configuración (mismo lugar que el umbral
   RN-160), no dentro del flujo de venta.

## Cambios de backend

- **Nueva clave de configuración** `descuento_presets_pct`: JSON array de
  números (ej. `[5, 10, 15, 20]`), en la tabla `configuracion` existente
  (mismo mecanismo que `descuento_max_pct_sin_autorizacion`). Si no está
  configurada, se usa el default `[5, 10, 15, 20]`.
- **Nuevo endpoint** `GET /ventas/config-descuentos` en `VentasController`,
  gated por `RequierePermiso('ventas:crear')` (el mismo permiso que ya
  necesita el vendedor para armar una venta — NO `admin:config`, que el
  vendedor no tiene). Devuelve `{ presets: number[] }`.
- **Nada más cambia**: `LineaVentaDto`, `calculo.ts`, `ventas.service.ts` y la
  lógica de autorización RN-160 quedan exactamente igual.

## Cambios de frontend

### Admin → Configuración (`admin/configuracion/page.tsx`)
- Se agrega `descuento_presets_pct` a `EDITABLES` con un tipo nuevo `"lista"`:
  se edita como texto separado por comas (`"5,10,15,20"`), se guarda como
  array JSON de números al hacer submit, se muestra unido por comas al cargar.

### Vender (`vender/page.tsx`)
- **Componente nuevo** `DescuentoPopover` (archivo separado, reutilizado en
  línea y en total): botón trigger + panel flotante con pastillas de los
  presets (%), un input "personalizado" (acepta `%` o monto, mismo parser
  `montoDescuento` de hoy) y una acción "Quitar descuento". Cierra al
  seleccionar una opción o al hacer clic afuera.
- **Columna "Precio"**: pasa de texto fijo a un `<input>` con el precio
  unitario efectivo actual (`precioLista − descuento_por_unidad`). Al editarlo,
  se recalcula `l.descuento` como monto B/. equivalente para toda la línea,
  clamped a `[0, bruto]` (no permite precio > lista).
- **Columna "Desc."**: el input de texto libre se reemplaza por el botón que
  abre `DescuentoPopover`; sigue mostrando un badge/label del descuento
  aplicado (ej. "10%" o "B/.2.50") cuando hay uno.
- **Tarjeta "Totales"**: nuevo botón "Descuento" (mismo `DescuentoPopover`,
  mismos presets) — al elegir un %, sobrescribe `descuento = "{n}%"` en
  **todas** las líneas actuales. Acción de una sola vez, no persistente:
  líneas agregadas después no lo heredan.
- Los presets se cargan una vez al montar la página vía
  `GET /ventas/config-descuentos`; si falla, se usa el fallback local
  `[5, 10, 15, 20]` para que la función no se rompa.

## Fuera de alcance

- No se agrega un campo de descuento a nivel de venta en el backend.
- No se permite subir el precio por encima del de lista desde esta UI.
- El descuento "al total" no queda pegajoso para líneas agregadas después de
  aplicarlo.
- Presets de monto fijo (B/.) — solo porcentajes, según lo decidido.

## Verificación

- `npx tsc --noEmit` y `npm run lint` limpios en `apps/api` y `apps/web`.
- Tests existentes de `ventas.service`/`calculo` siguen pasando sin cambios
  (no se tocó esa lógica).
- Nuevo test de backend para `GET /ventas/config-descuentos` (default y valor
  configurado).
- Verificación manual/visual en `apps/web` (dev server): aplicar preset por
  línea, aplicar preset al total, editar precio de una línea, editar presets
  en Admin → Configuración y confirmar que se reflejan en Vender.
