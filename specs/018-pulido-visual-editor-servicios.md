# Spec 018 — Pulido visual del editor de servicios (admin)

- **Estado:** en revisión
- **Ejecuta:** Claude Code (Codex sin cuota; cambio pequeño de CSS y JSX)
- **Revisa:** Antigravity (`/revisar-diff`)
- **Diseño:** n/a (no hay pantalla en `design/`; ajustes pedidos por JV sobre capturas del 2026-11-04, ver Decisiones)
- **Rama:** `claude/project-thread-mmfmiz` (rama asignada a la sesión; ver Decisiones)

## Objetivo
El editor de servicios del admin se lee mejor y nada tapa el contenido:
1. En el admin desplegado en Cloudflare no aparecen los avisos obsoletos de "Cloudflare DEV · Solo pruebas…" ni la tarjeta "Identidad administrativa" con el hash de Access y la lista de permisos.
2. El descuento tiene su propia sección, separada de las opciones, con una casilla de tamaño normal alineada con su texto.
3. La barra "Guardar borrador" ya no flota sobre el formulario.
4. Las tarjetas de la columna derecha ("Publicación" y "Sincronización") tienen separación.
5. Cada opción del servicio se ve como un bloque delimitado ("Opción 1", "Opción 2"…) con espacio entre una y otra.

## Archivos que toca
- `apps/admin/src/components/AdminShell.tsx` — el aviso superior (`local-notice`) solo se muestra en builds locales.
- `apps/admin/src/features/services/ApiServicesModule.tsx` — el aviso grande (`demo-disclaimer`) solo en builds locales; la tarjeta de identidad solo aparece si no hay sesión o hay error (en local se mantiene siempre).
- `apps/admin/src/features/services/ApiServiceEditor.tsx` — descuento en un `Panel` propio; leyenda "Opción N"; la barra de guardado pasa a ser el primer bloque de la columna derecha.
- `apps/admin/src/features/services/api-copy.ts` — clave `optionLegend` (ES "Opción" / EN "Option").
- `apps/admin/src/features/services/services.css` — estilos de los 5 puntos.
- `specs/018-pulido-visual-editor-servicios.md` — esta spec.

## Restricciones
- Sin dependencias nuevas. Sin cambios de API, contratos, D1 ni Worker.
- No cambian etiquetas accesibles de los campos (las pruebas buscan "Opción · Español N", "Guardar borrador", "Aplicar descuento").
- ES/EN, tema claro y oscuro, 390 px.
- Sin deploy: desplegar el admin requiere permiso explícito de JV (`wrangler.services-development.candidate.json`).

## Criterio de verificación
- [x] Admin: `typecheck`, `lint`, `test`, `build` y `verify:isolation` pasan.
- [x] Build Cloudflare (`VITE_DEPLOYMENT_TARGET=cloudflare-development`): el editor no muestra "CLOUDFLARE DEV · Solo pruebas" ni "Identidad administrativa".
- [x] Build local: los avisos de API local y la tarjeta de identidad siguen visibles.
- [x] La casilla "Aplicar descuento" mide ~20 px y está en la misma línea que su texto; el descuento es una sección aparte con título.
- [x] En ≥1440 px la barra de guardado no se superpone a ningún campo al hacer scroll.
- [x] "Publicación" y "Sincronización" tienen 24 px de separación.
- [x] Cada opción tiene borde, título "Opción N" y 24 px de separación con la siguiente.

## Decisiones
- **Avisos (punto 1):** el texto dice "Solo pruebas", "sin conexión al sitio público" y "PNG sintética", y ya es falso: el admin se usa como producción y publica al marketplace. Se ocultan en el build de Cloudflare y se conservan en el build local, donde sí informan. La tarjeta de identidad muestra el hash de Access, que no le sirve al usuario; el rol ya está en el pie de la barra lateral. Se mantiene si falta la sesión o hay error, porque ahí está el botón "Reintentar".
- **Guardar (punto 3):** se descartó dejarla fija abajo con relleno, porque igual tapa lo que pasa por detrás al hacer scroll. La barra pasa a ser el primer bloque de la columna derecha: en pantallas anchas esa columna ya es fija (sticky) y queda siempre a la vista sin tapar el formulario; en pantallas angostas queda justo después de los campos, antes de las acciones de publicación. Hay un solo botón "Guardar borrador".
- **Opciones (punto 5):** cada opción es una tarjeta con borde y la leyenda "Opción N". La biblioteca de imágenes usa la misma clase (`api-option`), así que las imágenes adjuntas también quedan separadas; se acepta porque la captura muestra el mismo problema ahí.
- **Rama:** se usa la rama asignada a la sesión en lugar de `spec/018-…` porque el entorno solo permite empujar a esa rama.
- Fuera de alcance (deuda anotada): textos con "DEV" o "local" en mensajes del editor ("catálogo DEV protegido", "Confirmar operación de API local") y el nombre "Cloudflare DEV" en el pie de la barra lateral.

- **Verificación (2026-11-04):** admin `typecheck`, `lint`, `test` (45/45), `build` y `verify:isolation` pasan. Revisión visual con Playwright a 1600 px y 390 px sobre el build Cloudflare con API simulada. La barra de guardado tiene `padding` de 16 px dentro de la columna derecha.

## Resultado de la revisión
<!-- La herramienta revisora pega aquí su veredicto: OK / Cambios requeridos + lista. -->
