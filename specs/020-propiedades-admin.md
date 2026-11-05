# Spec 020 — Propiedades en el portal admin (datos y publicación)

- **Estado:** borrador (espera aprobación de JV)
- **Ejecuta:** Codex (migración, API, admin, adaptador de la landing). Aplicar la 0009 en D1 remota y desplegar: solo JV o con su autorización explícita por operación (regla 10).
- **Revisa:** Antigravity (`/revisar-diff`)
- **Diseño:** n/a para la landing (no cambia lo que se ve). Admin: sin pantalla en `design/`; se reutilizan los componentes y el patrón del módulo de servicios (ver Decisiones).
- **Rama:** `spec/020-propiedades-admin`
- **Depende de:** la spec que actualiza `scripts/safe-d1/policy.mjs` (hoy lista 6 migraciones y el repo tiene 8). Sin ella no se puede aplicar ninguna migración remota, ni la 0008 ni esta 0009.

## Objetivo
Un administrador ve en el admin la lista de propiedades de Grupo Kuwago (Carabao Villa, Villa Maya, Casa Bella Mía, Casa Heliconia; Casa Cielo como borrador oculto), edita sus datos en español e inglés, decide cuáles se muestran en la landing y en qué orden, y publica. La landing lee las propiedades publicadas desde la API; si la API falla, sigue mostrando las tarjetas estáticas de hoy. Esta spec deja la base para la spec 010 (calendarios) y para el futuro acceso de propietarios.

## Fuera de alcance (specs posteriores)
- **Fotos de las propiedades.** Las 270 fotos (≈191 MB) siguen en Hostinger, en `assets/images/properties/<slug>/`. Moverlas al flujo de multimedia del admin es otra spec (ver Decisiones: límite de 8 imágenes por revisión, 30 subidas por hora y costo de R2/Images).
- Calendario y disponibilidad (spec 010). El enlace iCal privado **no** se guarda en esta spec.
- Acceso de propietarios ("Propietarios · Próximamente" en la landing) y del panel de resumen.
- Cambios visuales en la landing (ubicación, capacidad, etc. en la tarjeta): requieren pantalla en `design/` (spec 004).

## Modelo
Tabla `properties` (una fila por propiedad; sin revisiones selladas como en servicios):

| Campo | Tipo | Público | Notas |
|---|---|---|---|
| `id` | TEXT PK | no | UUID |
| `slug` | TEXT UNIQUE | sí | `^[a-z0-9-]{2,60}$`. Para las 4 actuales es la clave de `PROPERTY_DATA` y de la carpeta de fotos; no se puede cambiar una vez publicada |
| `status` | `draft` \| `published` \| `archived` | — | |
| `kind` | `rental` \| `managed` | sí | "En alquiler" o "Administrada" |
| `show_on_landing` | 0/1 | — | |
| `sort_order` | INTEGER ≥ 0 | sí | orden en la landing |
| `location` | TEXT ≤ 120 | sí | p. ej. "Uvita, Puntarenas" (igual en ES/EN) |
| `max_guests`, `bedrooms`, `bathrooms` | INTEGER NULL | sí | `bathrooms` admite medios (guardar ×2 o REAL; elegir y anotar) |
| `airbnb_url` | TEXT NULL | sí | solo `https://www.airbnb.*/rooms/...` |
| `owner_name`, `owner_contact`, `internal_notes` | TEXT NULL | **no** | nunca salen en la API pública |
| `updated_at`, `updated_by`, `published_at`, `published_by` | | no | |

Tabla `property_translations(property_id, locale IN ('es','en'), name ≤ 80, tagline ≤ 120, description ≤ 2000)`.

Publicación simple: al publicar, el Worker valida y copia el estado actual a `properties.published_json` (JSON del DTO público). La API pública solo lee `published_json` de filas `published` con `show_on_landing = 1`. Editar una propiedad publicada no cambia lo público hasta volver a publicar (el admin muestra "Cambios sin publicar").

## Archivos que toca
**Base de datos**
- (Nuevo) `packages/database/migrations/0009_properties.sql`: las dos tablas, `STRICT`, con los `CHECK` del modelo. Inserta las 4 propiedades actuales como `published` y `show_on_landing = 1` con los datos que ya están en `index.html`/`i18n.js` (nombre, subtítulo "Administrada"/"Managed Property", orden actual) y Casa Cielo como `draft` oculta. Campos desconocidos (`location`, capacidad, dueño) quedan `NULL` para que JV/Nahomy los completen.
- `packages/database/migrations.sha256.json`: agregar el hash de la 0009. **No tocar 0001–0008.**

**Contratos (`packages/contracts/src/`)**
- `models.ts`: `PropertyKind`, `PublicProperty`, `AdminProperty`.
- `public.ts` y `admin.ts`: validación de ambos DTO. El público no admite `owner*` ni `internalNotes`.
- Regenerar `assets/js/contracts/` con el comando del repo (no editar a mano).

**API / Worker (`infra/cloudflare/dev/src/`)**
- (Nuevo) `properties/routes.ts`, `properties/repository.ts`, `properties/input.ts`:
  - `GET /api/v1/properties`, `GET /api/v1/properties/:id` (`admin:read`)
  - `POST /api/v1/properties`, `PUT /api/v1/properties/:id` (`drafts:write`)
  - `POST /api/v1/properties/:id/publish`, `.../unpublish`, `.../archive` (`services:publish`, `services:unpublish`, `services:archive`; ver Decisiones)
  - Cada escritura respeta `MUTATIONS_ENABLED` y los guardas de mutación existentes, y deja un `audit_events` con `entity_type = 'property'`.
- `index.ts` (o el router del gateway que corresponda): montar las rutas.
- `public.ts`: `GET /v1/properties` → `{ properties: PublicProperty[] }` ordenadas por `sort_order`, con la misma política de caché y cabeceras que `/v1/services`.
- Pruebas: (nuevo) `infra/cloudflare/dev/test/properties-api.test.mjs` y casos en la prueba de la API pública.

**Admin (`apps/admin/src/`)**
- `navigation.ts`: `properties` pasa a `available: true`.
- (Nuevo) `features/properties/PropertiesModule.tsx` (lista con estado, visible en landing, orden y "Cambios sin publicar"), `PropertyEditor.tsx` (bloques: General ES/EN · Datos · Interno · Publicación), `copy.ts` (ES/EN).
- `api/admin-client.ts`: métodos de propiedades.
- `App.tsx` / `routing.ts`: ruta `#properties` y `#properties/:id`.
- (Nuevo) `test/Properties.test.tsx`.

**Landing**
- (Nuevo) `assets/js/properties-adapter.js`: pide `/v1/properties` con la misma base que el catálogo (`assets/js/config.js`), valida con el contrato generado y, si todo es válido, reordena/oculta las tarjetas de `#properties-grid` y reemplaza nombre y subtítulo por los publicados. Las tarjetas cuyo `slug` no exista en `PROPERTY_DATA` se ignoran (no hay fotos para ellas todavía).
- `index.html`: cargar el adaptador (sin cambios de maquetación).
- `scripts/` (nuevo `test-properties.mjs` o casos en `test-catalog.mjs`) y `package.json` si hace falta un script `test:properties`.

## Restricciones
- No editar migraciones aplicadas ni sus hashes; no tocar `menu/` ni `.htaccess`; nunca `git add -A`.
- **D1 remota:** nada de escritura ni migración sin respaldo completo vigente y autorización explícita de JV por operación (regla 10). Destino: el de `scripts/safe-d1/policy.mjs`.
- Deploy del Worker: `wrangler.services-development.candidate.json`, nunca `wrangler.development.json`. Solo con permiso explícito.
- **Orden de despliegue:** 1) respaldo + 0009 remota; 2) Worker; 3) landing. La landing debe seguir igual si `/v1/properties` no existe o falla (sin parpadeo visible: ocultar/reordenar solo tras validar).
- Los datos internos (`owner_*`, `internal_notes`) no pueden salir en `/v1/*` ni en `published_json`; debe haber una prueba que lo compruebe.
- Sin dependencias nuevas. ES/EN, claro y oscuro, 390 px en el admin.

## Criterio de verificación
- [ ] `npm --prefix infra/cloudflare/dev run migrate:local` aplica la 0009 y deja 4 propiedades publicadas + Casa Cielo en borrador.
- [ ] `npm run test:contracts` pasa (contratos regenerados).
- [ ] Admin: `typecheck`, `lint`, `test`, `build` y `verify:isolation` pasan.
- [ ] Backend: `typecheck`, `lint` y las pruebas nuevas pasan (`--test-force-exit`); los fallos previos de Windows/DPAPI y `migration_list_mismatch` no cuentan si no aumentan.
- [ ] Landing: `npm run build`, `check`, `test:catalog`, `lint:catalog` y la prueba nueva pasan.
- [ ] Prueba: `/v1/properties` nunca contiene `owner`, `contact` ni `internalNotes`.
- [ ] Prueba: editar una propiedad publicada no cambia `/v1/properties` hasta publicar.
- [ ] Prueba: con `show_on_landing = 0`, la tarjeta desaparece de la landing; con la API caída, la landing muestra las 4 tarjetas estáticas de hoy.
- [ ] Prueba: un editor (`editor`) no puede publicar; un `admin` sí.
- [ ] Manual local (`dev:admin-test` + admin + landing): cambiar el orden de Villa Maya al primer lugar, publicar y verlo en la landing.

## Decisiones
- **Lectura elegida (Claude, 2026-11-05):** "propiedades" = módulo para gestionar las propiedades que muestra la landing más sus datos internos, análogo a servicios pero más simple. No incluye reservas, calendario ni portal de propietarios.
- **Sin revisiones ni aprobación comercial.** En servicios existen porque hay precios; aquí no hay precios. Un estado de trabajo + `published_json` da "editar sin publicar" con mucho menos código. Si más adelante una propiedad lleva tarifas, se reevalúa.
- **Permisos reutilizados:** `services:publish/unpublish/archive` cubren propiedades. Agregar `properties:*` obliga a reconstruir `admin_role_permissions` (tiene un `CHECK` con la lista cerrada, `0003_access_rbac.sql:8-11`), lo que es una migración más riesgosa sin beneficio hoy: los mismos roles publicarían ambos.
- **Fotos fuera de esta spec.** El flujo de multimedia admite 8 imágenes por revisión (`media.ts`, `maxImagesPerRevision`) y 30 subidas por hora por usuario; las 270 fotos tardarían ≥ 9 h solo en subirse y ocuparían R2/Images (posible costo fuera del nivel gratis). Todas cumplen hoy el límite de 2 MiB y 8 MP (comprobado 2026-11-05).
- **La landing no cambia de aspecto.** El adaptador solo ordena, oculta y renombra tarjetas existentes; mostrar ubicación o capacidad necesita pantalla en `design/` (regla 8).
- **Fallback estático en la landing**, a diferencia del marketplace: las propiedades ya están publicadas en producción y dejar la sección vacía por una caída de la API sería una regresión.

## Resultado de la revisión
<!-- La herramienta revisora pega aquí su veredicto: OK / Cambios requeridos + lista. -->
