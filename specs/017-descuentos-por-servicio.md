# Spec 017 — Descuentos por servicio con fechas de vigencia

- **Estado:** lista
- **Ejecuta:** Codex (código y migración local). Aplicar la 0008 en D1 remota y desplegar: solo JV o con su autorización explícita por operación (regla 10).
- **Revisa:** Antigravity (`/revisar-diff`)
- **Diseño:** n/a (no hay pantalla en `design/`; ver Decisiones)
- **Rama:** `spec/017-descuentos` (después de mergear la spec 016, porque las dos tocan `marketplace.js`)

## Objetivo
Un administrador puede poner en un servicio un **descuento en porcentaje** que se aplica a **todas sus opciones con precio** (fijo o "desde"), con **fecha de inicio y de fin opcionales**. Mientras el descuento está vigente, el huésped ve en el marketplace el precio rebajado y el precio normal tachado, más una etiqueta "-15 %". Fuera de las fechas, el marketplace muestra el precio normal sin que nadie tenga que quitar el descuento. Los cambios de descuento pasan por la misma aprobación comercial y publicación que el resto del servicio.

## Modelo
- `discount: { percent: number; startsOn: string | null; endsOn: string | null } | null` a nivel de **revisión** del servicio.
  - `percent`: entero de 1 a 90.
  - `startsOn` / `endsOn`: fechas `YYYY-MM-DD` o `null` (sin límite). Si las dos existen, `endsOn >= startsOn`.
  - Las fechas se interpretan en hora de Costa Rica (UTC−6, sin horario de verano): vigente desde `startsOn 00:00` hasta `endsOn 23:59:59`.
- Precio rebajado = `round(amountMinor * (100 - percent) / 100)` en unidades menores (centavos). Las opciones "Por cotizar" no cambian.

## Archivos que toca
**Base de datos**
- (Nuevo) `packages/database/migrations/0008_service_discounts.sql`: tabla `revision_discounts(revision_id TEXT PRIMARY KEY REFERENCES service_revisions(id), percent INTEGER NOT NULL CHECK(percent BETWEEN 1 AND 90), starts_on TEXT, ends_on TEXT, CHECK(...formato YYYY-MM-DD...), CHECK(starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)) STRICT`. Debe tener los mismos candados de revisión sellada que `option_prices` (triggers `*_sealed_insert/update/delete`, ver `0002_integrity_guards.sql:84-92`), para que una revisión aprobada o publicada no cambie su descuento.
- `packages/database/migrations.sha256.json`: agregar el hash de la 0008. **No tocar 0001–0007.**
- `infra/cloudflare/dev/scripts/safe-d1/policy.mjs`: solo si la verificación local de migraciones lo exige para la 0008. Anotar en Decisiones si se tocó.

**Contratos**
- `packages/contracts/src/models.ts`: tipo `ServiceDiscount`; campo `discount` en `ServiceRevision` y en `PublicCatalogService`.
- `packages/contracts/src/public.ts` y `admin.ts`: validación (`percent` 1–90, fechas válidas, fin ≥ inicio, `null` permitido).
- Regenerar `assets/js/contracts/` con el comando del repo (no editar a mano).

**API / Worker (`infra/cloudflare/dev/src/`)**
- `catalog/input.ts`, `catalog/services.ts`, `catalog/repository.ts`: leer y escribir el descuento de la revisión de trabajo.
- `catalog/projection.ts`: incluir `discount` en el servicio publicado.
- `public.ts`: al responder, **omitir `discount`** (enviarlo como `null`) si la fecha actual en Costa Rica está fuera de `startsOn`–`endsOn`. Así un descuento vencido no se muestra aunque el snapshot no haya cambiado.
- Pruebas en `infra/cloudflare/dev/test/catalog-api.test.mjs` (o el archivo de pruebas de catálogo que corresponda).

**Admin (`apps/admin/src/`)**
- `features/services/ApiServiceEditor.tsx`: en "Información comercial", bloque "Descuento" con casilla "Aplicar descuento", porcentaje y fechas "Desde" y "Hasta" (opcionales). Muestra de ejemplo: "USD 90 → USD 76,50" con la primera opción con precio.
- `features/services/api-copy.ts`: textos ES/EN.
- `api/admin-client.ts`: incluir `discount` en `DraftInput`, `newDraft()` (con `null`) y `draftFromDocument`.
- `test/ApiEditor.test.tsx`: pruebas.

**Landing**
- `assets/js/catalog-adapter.js` y `assets/js/marketplace.js`: si `discount` no es `null`, mostrar en la tarjeta y en el diálogo el precio rebajado, el precio normal tachado (`<s>`) y la etiqueta `-N %`. El "Desde" de la tarjeta (spec 016) se calcula con los precios rebajados.
- `assets/js/i18n.js`: claves `mp.discount` ("Descuento" / "Discount") y `mp.regularPrice` ("Precio normal" / "Regular price"), y la etiqueta de lector de pantalla para el precio tachado.
- `assets/css/marketplace.css`: estilo de la etiqueta (dorado de marca `bright-gold` sobre morado o viceversa, contraste AA en claro y oscuro).
- `scripts/test-catalog.mjs`: pruebas.

## Restricciones
- No editar migraciones aplicadas (0001–0007) ni sus hashes.
- **D1 remota:** nada de escritura ni migración sin un respaldo completo vigente y la autorización explícita de JV para esa operación (regla 10). El destino es la D1 de `scripts/safe-d1/policy.mjs`.
- Deploy del Worker: `wrangler.services-development.candidate.json`. **Nunca `wrangler.development.json`**, que tiene `MUTATIONS_ENABLED=false`. Solo con permiso explícito.
- Deploy de la landing: ZIP de `dist/` a Hostinger, conservar `public_html/menu`. Solo con permiso explícito.
- **Orden de despliegue:** 1) respaldo y migración 0008 remota; 2) deploy del Worker; 3) deploy de la landing. La landing debe funcionar si `discount` no viene en la respuesta (por ejemplo, con el Worker anterior).
- Sin dependencias nuevas. ES/EN, claro y oscuro, 390 px.

## Criterio de verificación
- [x] Migración local: `npm --prefix infra/cloudflare/dev run migrate:local` aplica la 0008 sin errores y el hash está en `migrations.sha256.json`.
- [x] `npm run test:contracts` pasa (contratos regenerados).
- [x] Admin: `typecheck`, `lint`, `test`, `build` y `verify:isolation` pasan.
- [x] Backend: `typecheck`, `lint` y las pruebas de catálogo/público (con `--test-force-exit`) pasan. Los 59 fallos previos de `migration_list_mismatch` no cuentan, salvo que esta spec los cambie (anotarlo).
- [x] Landing: `npm run build`, `check`, `test:catalog` y `lint:catalog` pasan.
- [x] Prueba: un descuento del 15 % sobre USD 90 da USD 76,50 en la API pública y en la tarjeta.
- [x] Prueba: con `endsOn` en el pasado, la API pública devuelve `discount: null`; con `startsOn` en el futuro, también.
- [x] Prueba: una opción "Por cotizar" no muestra descuento.
- [x] Prueba: cambiar el descuento de un servicio publicado crea una revisión nueva que requiere aprobación; la publicada no cambia hasta publicarla.
- [ ] Manual local (`dev:admin-test` + admin + landing): poner 20 % de hoy a mañana en un servicio, aprobar, publicar y ver el precio tachado en el marketplace.

## Decisiones
- Modelo elegido por JV el 2026-11-04: porcentaje por servicio con fechas opcionales (en vez de precio de oferta por opción o porcentaje sin fechas).
- La vigencia se calcula en la API pública al responder, no solo en el navegador: así un descuento vencido no depende del reloj del huésped ni de republicar.
- Tope del 90 % para evitar errores de tipeo (por ejemplo, 100 % o 150 %).
- El descuento es parte de la revisión, así que pasa por la aprobación comercial como cualquier cambio de precio.
- No hay pantalla de Stitch. Se usa el patrón habitual de precio tachado más etiqueta, con los tokens de marca (regla 9).
- **Implementación (2026-11-04, Claude Code, porque Codex no estaba disponible):**
  - `discount` es **opcional** en el contrato. La API pública **omite la clave** cuando no hay descuento o no está vigente (en vez de enviar `null`). Así un servicio sin descuento conserva exactamente la forma JSON anterior a la 0008.
  - **Orden de despliegue corregido:** 1) landing, 2) respaldo y 0008 remota, 3) Worker. La landing en producción (v1.2) rechaza claves desconocidas, así que debe llevar el contrato nuevo **antes** de que exista un descuento vigente. El Worker no puede ir antes de la 0008 porque consulta `revision_discounts`.
  - Se tocaron 3 archivos que la spec no listaba, porque sin ellos el descuento se perdía o se rompía la aprobación:
    - `catalog/publication.ts`: el hash de aprobación incluye `discount` solo si existe. Los hashes de revisiones ya selladas no cambian.
    - `catalog/routes.ts`: la edición solo de traducciones conserva el descuento.
    - `assets/js/marketplace-data.js`: ahí viven las claves `mp.*`; `assets/js/i18n.js` no las tiene.
  - Las pruebas de contrato del descuento están en `scripts/test-catalog.mjs`, que la spec sí lista; `packages/contracts/test/` no se tocó.
  - La landing vuelve a comprobar la vigencia con `activeDiscount`. Así una página abierta no sigue mostrando un descuento después de la medianoche de Costa Rica.
  - `scripts/safe-d1/policy.mjs` no se tocó: la verificación local no lo exige. **Para aplicar la 0008 en remoto hay que actualizar esa política en una spec aparte**; hoy ya está desfasada respecto a la 0007.
  - Suite completa del backend: los mismos 84 fallos que `main` (pruebas de Windows/DPAPI/PowerShell que no corren en Linux) y ningún fallo nuevo. La prueba de catálogo pasa 24/24, una más que en `main`.

## Resultado de la revisión
<!-- La herramienta revisora pega aquí su veredicto: OK / Cambios requeridos + lista. -->
