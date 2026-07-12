# Rediseño estético del widget del Asistente

## Contexto

`apps/web/src/components/asistente.tsx` implementa el chat flotante del Asistente
(BL-024): botón FAB, panel con historial por pestaña (sessionStorage), sugerencias
iniciales, render seguro de negritas/enlaces internos, y un formulario de envío.
La lógica y el contrato con `/asistente/chat` funcionan bien; el problema es
puramente visual — colores y componentes genéricos (emoji como ícono, texto
"Pensando…" plano, aparición/desaparición abrupta del panel).

## Alcance

**Solo estética.** No se toca:
- Lógica de `preguntar()`, historial, sessionStorage, límite de 30 mensajes.
- `renderizarRespuesta()` (render seguro de negritas y enlaces internos).
- Contrato con el backend (`POST /asistente/chat`).
- Posición (`fixed bottom-4 right-4`), breakpoint mobile (`max-sm:fixed inset-2`).
- Tokens de color del tema (`--color-primary`, `--color-surface`, etc. en `globals.css`) — no se agregan colores nuevos.
- Dependencias — todo con Tailwind, sin librerías nuevas.
- **Lenguaje de íconos:** el resto del ERP usa glifos Unicode planos, no SVG
  (`✕` en `ui.tsx` y en varias pantallas, `→`, `▲`/`▼`, `✔`). El rediseño respeta
  esa convención — nada de SVG inline nuevo, para no introducir un lenguaje visual
  distinto al del resto de la app.

## Cambios visuales

1. **Botón FAB:** mismo emoji 💬 (ya es el ícono establecido del asistente); al
   abrir el panel, el mismo botón transiciona a "✕" (mismo elemento, sin duplicar
   botones, mismo glifo que ya usa el resto del ERP para cerrar). Transición de
   escala sutil al hover (`hover:scale-105`), sombra más suave.

2. **Apertura/cierre del panel:** transición CSS de opacity+scale (`transition-all
   duration-150`) en vez de aparecer/desaparecer abrupto. Se implementa con clases
   condicionales sobre el mismo nodo (mantenido montado brevemente durante el cierre
   no es necesario — basta con transición al montar/desmontar vía CSS, sin librería
   de animación).

3. **Contenedor del panel:** `rounded-2xl` (antes `rounded-xl`), sombra más
   pronunciada y suave (`shadow-2xl` con tinte sutil), mismo tamaño 380×520.

4. **Header:** círculo pequeño con el mismo emoji 💬 sobre fondo `primary-light`
   (avatar decorativo) + "Asistente"; el botón "Limpiar" gana un área de click más
   clara y hover con fondo sutil (`hover:bg-page rounded-md`); el botón cerrar
   sigue siendo "✕", con el mismo tratamiento de hover.

5. **Burbujas de mensaje:** `rounded-2xl`, con la esquina inferior correspondiente
   al emisor menos redondeada (efecto "pico" sutil vía `rounded-br-md` /
   `rounded-bl-md`). Mensajes del asistente llevan el mismo círculo con 💬 del
   header, en miniatura, alineado arriba a la izquierda de la burbuja. Mejora de
   espaciado vertical entre mensajes (`space-y-3` en vez de `space-y-2`).

6. **Indicador "Pensando…":** se reemplaza el texto plano por tres puntos
   animados dentro de una burbuja tipo asistente (mismo estilo visual que un
   mensaje entrante), usando una animación CSS simple (`animate-bounce` con
   `animation-delay` escalonado por punto).

7. **Sugerencias iniciales:** mismos 3 pills, con hover que agrega una sombra leve
   además del cambio de fondo actual, y mejor espaciado (`gap-2` flex-wrap en vez
   de bloques apilados).

8. **Barra de entrada:** el `Input` y el `Button` de envío se combinan
   visualmente en una barra tipo "pill" (fondo `bg-page`, borde redondeado
   completo). El botón de envío usa el glifo "➤" en vez del texto "Enviar"
   (mismo lenguaje de glifos Unicode que "→" ya usado en otras pantallas).
   Estado deshabilitado con opacidad reducida, igual que hoy.

## Fuera de alcance (explícitamente, por decisión del usuario)

- No se agregan funciones nuevas (reacciones, timestamps, markdown enriquecido,
  adjuntos).
- No se cambia el layout general (sigue siendo panel flotante, no lateral).
- No se agrega modo oscuro (el ERP no lo tiene — Q-046, tema claro por defecto).

## Verificación

- `npx tsc --noEmit` limpio en `apps/web`.
- Verificación visual manual: abrir/cerrar el panel, enviar una pregunta y ver el
  indicador de "pensando", revisar sugerencias iniciales, probar en viewport móvil
  (`max-sm`), confirmar que enlaces internos y negritas se siguen renderizando
  igual que antes.
