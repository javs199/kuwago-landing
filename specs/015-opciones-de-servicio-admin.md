# Spec 015 — Agregar, duplicar y quitar opciones de un servicio en el admin

- **Estado:** lista
- **Ejecuta:** Codex
- **Revisa:** Antigravity (`/revisar-diff`)
- **Diseño:** n/a (no hay pantalla en `design/`; ver Decisiones)
- **Rama:** `spec/015-opciones-de-servicio` (crearla desde `claude/project-thread-e16hp4` o desde `main` si esta spec ya está mergeada)

## Objetivo
En el editor de servicios del admin (`#services/<id>/edit` y `#services/new`), quien tenga `drafts:write` puede **agregar**, **duplicar** y **quitar** opciones (precio/duración/variante) de un servicio y guardarlas en el borrador. Hoy el editor solo muestra las opciones que ya existen, así que no se pueden cargar servicios con varias opciones (por ejemplo, 13 variantes de masaje). Además, cuando una foto se rechaza porque su PNG normalizado supera 2 MiB, el admin debe decirlo con un mensaje claro en vez de mostrar `decoder_invalid_response`.

## Archivos que toca
- `apps/admin/src/features/services/ApiServiceEditor.tsx`: dentro del panel "Información comercial" (línea ~53):
  - Botón **"Agregar opción"** al final de la lista. Crea una opción nueva con `id: crypto.randomUUID()`, nombres vacíos, `durationMinutes: null`, `experienceType: 'private'`, `venue: 'in_property'` y `price: {kind:'quote', currency:null, unit:'service'}` (los mismos valores por defecto que `newDraft()` en `apps/admin/src/api/admin-client.ts:88`).
  - En cada `fieldset` de opción, un botón **"Duplicar"**: inserta debajo una copia con `id` nuevo (`crypto.randomUUID()`) y los demás campos iguales.
  - En cada `fieldset`, un botón **"Quitar"** que pide confirmación (`confirm`, igual que "Desvincular" en `MediaLibrary.tsx`) y elimina esa opción. Desactivado cuando solo queda una opción.
  - "Agregar" y "Duplicar" quedan desactivados al llegar a **100 opciones** (límite del contrato, `packages/contracts/src/admin.ts:32`).
  - Todos los botones respetan `readonly`/`writable` como el resto del formulario y marcan el borrador como modificado (`change(...)`).
  - Al agregar o duplicar, el foco pasa al primer campo de la opción nueva (accesibilidad).
- `apps/admin/src/features/services/api-copy.ts`: textos ES/EN: `addOption` ("Agregar opción" / "Add option"), `duplicateOption` ("Duplicar" / "Duplicate"), `removeOption` ("Quitar" / "Remove"), `removeOptionConfirm` ("¿Quitar esta opción del borrador?" / "Remove this option from the draft?"), `optionLimit` ("Máximo 100 opciones" / "100 options maximum").
- `apps/admin/src/features/services/services.css`: solo si hace falta alinear los botones; reutiliza las clases `button` y `button-quiet` existentes.
- `apps/admin/src/test/ApiEditor.test.tsx`: pruebas nuevas (ver verificación).
- `infra/cloudflare/dev/src/images/processor.ts`: en `checkedOutput` (línea ~28), si el error es `ApiFailure` con código `file_too_large`, relanzarlo como `ApiFailure(422,'normalized_image_too_large')` en vez de convertirlo a `decoder_invalid_response`. El resto de errores sigue igual.
- `infra/cloudflare/dev/test/multimedia.test.mjs`: prueba de que un PNG normalizado de más de 2 MiB devuelve `normalized_image_too_large`.
- `apps/admin/src/features/services/MediaLibrary.tsx`: agregar al mapa `errors` (línea 25) `normalized_image_too_large`: "La imagen convertida supera 2 MiB. Reduce su resolución (por ejemplo, a 1200 px de ancho) y súbela de nuevo." / "The converted image exceeds 2 MiB. Reduce its resolution (e.g. 1200 px wide) and upload it again."

## Restricciones
- No tocar contratos (`packages/contracts/`), migraciones, `wrangler*.json`, la API de catálogo ni la landing.
- No añadir dependencias.
- No cambiar el orden ni los IDs de las opciones existentes al guardar: las opciones conservan su `id`; las nuevas usan `crypto.randomUUID()`.
- ES/EN y tema claro/oscuro en todo texto nuevo.
- **Deploy solo con permiso explícito de JV** (regla 3 y tabla de comandos de `AGENTS.md`). El admin y la API están en el mismo Worker, así que un deploy cubre las dos partes.

## Criterio de verificación
- [x] `npm --prefix apps/admin run typecheck`, `run lint`, `test` y `run build` pasan.
- [x] `npm --prefix apps/admin run verify:isolation` pasa.
- [x] `npm --prefix infra/cloudflare/dev run typecheck`, `run lint` y `test` pasan.
- [x] Prueba: en un borrador con 1 opción, "Agregar opción" deja 2 y "Quitar" está desactivado cuando queda 1.
- [x] Prueba: "Duplicar" crea una opción con `id` distinto y mismos nombre, duración, experiencia, lugar y precio.
- [x] Prueba: al guardar, el cuerpo enviado a `adminApi.save` contiene todas las opciones en el orden de la pantalla.
- [x] Prueba: con 100 opciones, "Agregar" y "Duplicar" están desactivados.
- [ ] Manual (`npm --prefix infra/cloudflare/dev run dev:admin-test` + `npm --prefix apps/admin run dev`): crear un borrador con 3 opciones, guardar, recargar y ver las 3; quitar 1, guardar, recargar y ver 2.
- [ ] Manual en remoto (después del deploy autorizado): abrir `masajes-en-la-villa`, agregar una opción, guardar, recargar y comprobar que sigue ahí.

## Decisiones
- No hay pantalla de Stitch para este control. Se implementa como botones dentro del panel existente, con las clases actuales del admin, porque es un control menor de un formulario que ya existe (regla 9). Si luego llega un diseño, se ajusta.
- "Duplicar" se incluye aunque no se pidió explícitamente: sirve para cargar variantes que solo cambian en duración o precio (masajes de 60/90 min), que son la mayoría de las 41 opciones pendientes de la planilla `servicios-kuwago.xlsx`.
- Sin reordenar opciones con flechas en esta spec: el orden lo da la carga (agregar al final o duplicar debajo). Si hace falta, va en otra spec.
- El error de foto grande se corrige en el Worker porque es el Worker quien convierte `file_too_large` en `decoder_invalid_response` (`processor.ts:28-31`).

## Resultado de la revisión

**Veredicto:** `OK`

- **Cumplimiento del objetivo y restricciones:**
  - `apps/admin/src/features/services/ApiServiceEditor.tsx:18-19,45-50,61-71`: implementa `insertOption` (agregar al final con los valores por defecto de `newDraft().options[0]` o duplicar debajo con `structuredClone` e `id: crypto.randomUUID()`), `removeOption` (con confirmación `c.removeOptionConfirm`, deshabilitado cuando queda 1 opción), límite de 100 opciones con aviso `role="status"` (`c.optionLimit`), traslado de foco al primer `input` de la opción nueva/duplicada y respeto de `readonly`.
  - `apps/admin/src/features/services/api-copy.ts:4,20`: añade `addOption`, `duplicateOption`, `removeOption`, `removeOptionConfirm` y `optionLimit` en EN y ES.
  - `infra/cloudflare/dev/src/images/processor.ts:30`: convierte `ApiFailure` con código `file_too_large` en `checkedOutput` a `ApiFailure(422, 'normalized_image_too_large')`, que `multimedia.ts:110` registra como `rejected`.
  - `apps/admin/src/features/services/MediaLibrary.tsx:25`: añade el mensaje claro en ES/EN para `normalized_image_too_large`.
- **Archivos tocados (`git status --short`):** `apps/admin/src/features/services/ApiServiceEditor.tsx`, `apps/admin/src/features/services/MediaLibrary.tsx`, `apps/admin/src/features/services/api-copy.ts`, `apps/admin/src/test/ApiEditor.test.tsx`, `infra/cloudflare/dev/src/images/processor.ts` e `infra/cloudflare/dev/test/multimedia.test.mjs` (todos dentro de la lista de la spec; `services.css` no requirió cambios al reutilizar `.media-actions`). Nota: los cambios están aún sin commit en el árbol de trabajo de `spec/015-opciones-de-servicio`, y `?? menu/` es un remanente sin seguimiento de la spec 001 cancelada.
- **Verificación ejecutada:**
  - `npm --prefix apps/admin run typecheck` → PASS (exit 0).
  - `npm --prefix apps/admin run lint` → PASS, 0 warnings (exit 0).
  - `npm --prefix apps/admin test` → PASS, 5 archivos / 42 tests pasando (`ApiEditor.test.tsx`: 11/11 tests, incluyendo agregar, duplicar, quitar con confirmación, orden en `adminApi.save`, límite de 100 opciones, modos `readonly`, idioma EN y mensaje `normalized_image_too_large` en ES/EN).
  - `npm --prefix apps/admin run build` → PASS, `built in 464ms` (exit 0).
  - `npm --prefix apps/admin run verify:isolation` → PASS (`Isolation passed: separate outputs; no admin/private files in landing; local servers bind to 127.0.0.1.`).
  - `npm --prefix infra/cloudflare/dev run build` (incluye `typecheck`) → PASS (`Local Worker and security module built; no upload.`).
  - `npm --prefix infra/cloudflare/dev run lint` → PASS, 0 warnings (exit 0).
  - `node --test --test-force-exit --test-timeout=60000 infra/cloudflare/dev/test/multimedia.test.mjs` → PASS, 24/24 tests pasando (incluido `normalized PNG over 2 MiB returns a specific error and is rejected without approval`).
