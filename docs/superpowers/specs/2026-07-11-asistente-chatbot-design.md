# Asistente — chatbot sobre la base de datos (diseño)

**Fecha:** 2026-07-11 · **Estado:** aprobado por el dueño

## Qué es

Un chat flotante ("Asistente") disponible en todas las pantallas del ERP. Cualquier usuario autenticado pregunta en lenguaje natural ("¿cuánto stock hay del filtro de aceite?", "¿cuánto vendimos hoy?") y el bot responde con datos vivos de la base de datos, **acotado a lo que el rol y la sucursal del usuario ya permiten**, e incluye enlaces para saltar a la pantalla relevante ("Ver producto →").

**Patrón elegido:** tool calling (agente con herramientas curadas), NO RAG. Los datos son estructurados y vivos; se necesitan números exactos, no similitud semántica. RAG queda descartado para v1.

**LLM:** DeepSeek `deepseek-chat` (V3) vía API compatible con OpenAI (`/chat/completions` con `tools`). Llamado con `fetch` — cero SDKs nuevos. Clave en `DEEPSEEK_API_KEY` (env del api + Vercel), nunca en código ni git. El dueño debe **rotar la clave** que compartió por chat tras configurarla.

## Alcance v1

- **Solo lectura + navegación.** El bot responde preguntas y enlaza pantallas. NO ejecuta acciones de escritura (crear productos, ajustar stock, cobrar). Escritura = fuera de alcance.
- **Todos los usuarios, acotado por RBAC.** Un vendedor sin `caja:ver` no puede preguntar por la caja: la herramienta ni siquiera se le presenta al modelo.
- **Sin streaming** (respuestas cortas; indicador "Pensando…"). Streaming = v2.
- **Sin persistencia de conversaciones en BD.** Historial en el cliente (`sessionStorage`). v2 si se quiere auditoría de preguntas.
- Descartado para v1: WhatsApp/Telegram, herramienta SQL restringida (híbrido), acciones de escritura.

## Arquitectura

Nuevo módulo NestJS `apps/api/src/asistente/` con un endpoint:

```
POST /api/v1/asistente/chat      (autenticado; cualquier usuario logueado)
body: { mensajes: [{ rol: 'user'|'assistant', contenido: string }] }
resp: { respuesta: string }   // enlaces inline en el texto: [etiqueta](/ruta-interna)
```

### Flujo por pregunta

1. `AuthGuard` adjunta `Ctx` (usuarioId, tenantId, `permisos: Set<string>`, `sucursalIds`, `sucursalId` efectiva).
2. `AsistenteService` construye el system prompt: identidad del negocio, usuario y sucursal activa, fecha/hora en `America/Panama`, moneda `B/.`, instrucciones de formato (respuestas breves en español, enlaces internos), y **solo las herramientas cuyo permiso posee el usuario**.
3. Llama a DeepSeek. Si devuelve `tool_calls`, el ejecutor corre cada herramienta contra Prisma/servicios existentes y devuelve los resultados al modelo. Bucle hasta respuesta final.
4. Devuelve el texto final al widget.

### Límites duros (serverless)

- `maxDuration: 60` en la config Vercel del api para este endpoint.
- Máximo **5 rondas** de tool calls por pregunta; `max_tokens` acotado (~1000).
- Historial entrante: máximo 10 mensajes, ~2.000 caracteres c/u.

### Seguridad

- **Sanitización del historial:** el servidor solo acepta roles `user`/`assistant` con `contenido` string; descarta cualquier mensaje `system`/`tool` del cliente. El system prompt y los mensajes de herramienta los construye siempre el servidor.
- **Defensa en profundidad:** las herramientas se filtran por permiso ANTES de presentarse al modelo Y cada herramienta re-verifica `ctx.permisos` al ejecutarse.
- **Alcance por sucursal:** herramientas de dinero (ventas, caja, por cobrar) se acotan a `ctx.sucursalId` activa. `stock_de_producto` muestra stock de **todas** las sucursales en `ctx.sucursalIds` (visibilidad cruzada D-030). El modelo nunca elige IDs de sucursal libremente.
- Todo filtrado por `tenantId` como el resto del api.
- Sin clave configurada → error claro "Asistente no configurado" (no 500 genérico).

## Herramientas v1

| Tool | Respaldo | Permiso | Responde |
|---|---|---|---|
| `buscar_producto(q)` | búsqueda existente (código exacto/prefijo/trigram) | `productos:ver` | top 5 coincidencias + precio + stock resumido |
| `stock_de_producto(productoId)` | `stock` por sucursal | `productos:ver` | stock por sucursal visible + stock mínimo |
| `productos_bajo_minimo()` | query de dashboard | `inventario:ver` | lista de alertas (top 15) |
| `ventas_del_dia(fecha?)` | queries del dashboard | `ventas:ver` | total, #ventas, utilidad, por método de pago |
| `estado_caja()` | `caja_sesion` abierta + movimientos | `caja:operar` o `caja:ver_todas` | abierta/cerrada, efectivo esperado |
| `ventas_pendientes()` | ventas en PREPARACION | `ventas:ver` | pendientes de cobro en ventanilla (no existe crédito en el modelo de datos; "por cobrar" = PREPARACION) |
| `top_productos(dias?)` | agregado de ventas | `ventas:ver` | más vendidos últimos N días |
| `buscar_cliente(q)` | búsqueda de clientes | `clientes:ver` | cliente + últimas compras |

Cada herramienta declara `permisos: string[]` — el usuario necesita **alguno** de ellos (los códigos reales del seed no siempre tienen un `x:ver` único).

Convenciones de resultado: JSON compacto; dinero como string decimal; cantidades como número; fechas en TZ Panamá; cada entidad incluye `url` interna (`/productos/{id}`, `/clientes/{id}`, …) para que la respuesta lleve "Ver →". Errores de herramienta devuelven `{ error }` al modelo (se disculpa, no alucina).

## Widget (web)

`AsistenteWidget` — client component montado en `(app)/layout.tsx`:

- Botón flotante abajo-derecha → panel ~380×520 px (pantalla completa en móvil).
- Render seguro de respuestas: **negritas y enlaces internos únicamente** — parser propio mínimo que reconoce `**texto**` y `[etiqueta](/ruta)` solo si la ruta empieza con `/` (rutas internas); todo lo demás se muestra como texto plano. Sin markdown/HTML crudo → sin inyección.
- Chips de sugerencia al abrir: "¿Cuánto vendimos hoy?", "Productos bajo mínimo", "¿Está abierta la caja?".
- Enter envía; indicador "Pensando…"; errores amigables ("No pude procesar tu pregunta, intenta de nuevo").
- Historial en `sessionStorage` (clave por usuario), se limpia al cerrar sesión.
- Reusa primitivas de `components/ui.tsx` y tokens de diseño existentes.

## Pruebas

- **Unitarias (mock del LLM):** ejecutor de herramientas — filtrado por permiso, re-chequeo al ejecutar, alcance por sucursal/tenant, sanitización de historial, tope de rondas.
- **Integración:** un round-trip completo del endpoint contra un servidor DeepSeek falso (respuestas fijas con `tool_calls`), con la BD de test.
- **Sin LLM real en CI.** Verificación manual end-to-end con la clave real antes de desplegar.

## Extensiones futuras (no v1)

Streaming de respuestas; página dedicada; persistencia/auditoría de conversaciones; herramienta SQL restringida solo-admin sobre vistas seguras; WhatsApp; más herramientas según preguntas reales que fallen.
