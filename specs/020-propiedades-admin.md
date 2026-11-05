# Spec 020 — Propiedades en el portal admin (datos y publicación)

- **Estado:** en revisión
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

## Hoja de ruta de propiedades (JV, 2026-11-05)
La propiedad es la entidad base de todo lo que sigue; por eso va primero.
1. **020 (esta):** propiedades en el admin y en el home público. `kind = rental` marca las que están disponibles para estadía y `airbnb_url` es el enlace para reservar.
2. **010:** calendario de disponibilidad (iCal de Airbnb) en la landing y en el admin.
3. **Información para huéspedes** (wifi, códigos, horarios de piscinero, instrucciones): campos privados por propiedad, con acceso por reserva o enlace con vencimiento. Reemplaza `/menu/` (spec 011).
4. **Portal de propietarios:** un rol de propietario limitado a sus propiedades, con contratos, calendario, facturas y proyectos.
5. **Reserva directa con pago** (procesador en evaluación, probablemente ONVO): solo cuando estén la 2 y el procesador.

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
- [x] `npm --prefix infra/cloudflare/dev run migrate:local` aplica la 0009 y deja 4 propiedades publicadas + Casa Cielo en borrador.
- [x] `npm run test:contracts` pasa (contratos regenerados).
- [x] Admin: `typecheck`, `lint`, `test`, `build` y `verify:isolation` pasan.
- [x] Backend: `typecheck`, `lint` y las pruebas nuevas pasan (`--test-force-exit`); los fallos previos de Windows/DPAPI y `migration_list_mismatch` no cuentan si no aumentan.
- [x] Landing: `npm run build`, `check`, `test:catalog`, `lint:catalog` y la prueba nueva pasan.
- [x] Prueba: `/v1/properties` nunca contiene `owner`, `contact` ni `internalNotes`.
- [x] Prueba: editar una propiedad publicada no cambia `/v1/properties` hasta publicar.
- [x] Prueba: con `show_on_landing = 0`, la tarjeta desaparece de la landing; con la API caída, la landing muestra las 4 tarjetas estáticas de hoy.
- [x] Prueba: un editor (`editor`) no puede publicar; un `admin` sí.
- [x] Manual local (`dev:admin-test` + admin + landing): cambiar el orden de Villa Maya al primer lugar, publicar y verlo en la landing.

## Decisiones
- **Archivo adicional `infra/cloudflare/dev/src/barrier.ts`:** el Worker público no tiene D1. Se amplía el binding interno existente con `/properties`, que selecciona solo snapshots publicados; sin permisos nuevos ni configuraciones reales.
- **Otros archivos adicionales:** `packages/contracts/test/properties.test.mjs` prueba ambos contratos y la exclusión de campos privados; `infra/cloudflare/dev/package.json` sitúa `--test-force-exit` antes del glob, ya que los argumentos añadidos por npm después de los archivos no activan esa opción de Node. `infra/cloudflare/dev/test/admin-harness.mjs` habilita CORS solo para la landing local (4173) y simula la caída de la API pública. `scripts/test-properties-e2e.mjs` comprueba el flujo local con el harness existente, sin dependencias nuevas.
- **Snapshot de visibilidad:** `published_visibility` conserva el último show_on_landing publicado; evita que guardar una casilla cambie el público antes de pulsar Publicar.
- **Aprobación:** JV aprobó esta spec al fusionar PR #14 el 2026-11-05. Implementación local autorizada; sin migraciones remotas ni despliegues.
- **Baños:** REAL nullable en unidades de 0,5. Se conserva el texto exacto existente: ES «Propiedad administrada», EN «Managed Property», y «Casa Bella Mia» sin añadir acentos.
- **Publicación:** visibilidad y orden publicados se leen del snapshot; editar show_on_landing u orden no afecta al público hasta publicar. Se añade row_version para concurrencia optimista y slug_locked para impedir cambiar el slug incluso tras despublicar.

- **Lectura elegida (Claude, 2026-11-05):** "propiedades" = módulo para gestionar las propiedades que muestra la landing más sus datos internos, análogo a servicios pero más simple. No incluye reservas, calendario ni portal de propietarios.
- **Sin revisiones ni aprobación comercial.** En servicios existen porque hay precios; aquí no hay precios. Un estado de trabajo + `published_json` da "editar sin publicar" con mucho menos código. Si más adelante una propiedad lleva tarifas, se reevalúa.
- **Permisos reutilizados:** `services:publish/unpublish/archive` cubren propiedades. Agregar `properties:*` obliga a reconstruir `admin_role_permissions` (tiene un `CHECK` con la lista cerrada, `0003_access_rbac.sql:8-11`), lo que es una migración más riesgosa sin beneficio hoy: los mismos roles publicarían ambos.
- **Fotos fuera de esta spec (confirmado por JV el 2026-11-05: quedan en Hostinger por ahora).** El flujo de multimedia admite 8 imágenes por revisión (`media.ts`, `maxImagesPerRevision`) y 30 subidas por hora por usuario; las 270 fotos tardarían ≥ 9 h solo en subirse y ocuparían R2/Images (posible costo fuera del nivel gratis). Todas cumplen hoy el límite de 2 MiB y 8 MP (comprobado 2026-11-05).
- **La landing no cambia de aspecto.** El adaptador solo ordena, oculta y renombra tarjetas existentes; mostrar ubicación o capacidad necesita pantalla en `design/` (regla 8).
- **Fallback estático en la landing**, a diferencia del marketplace: las propiedades ya están publicadas en producción y dejar la sección vacía por una caída de la API sería una regresión.

### Verificación local (Codex, 2026-11-05)

- Todos los criterios ejecutados. Suite backend: **main 258/317 pasan, 59 fallan; rama 266/325 pasan, los mismos 59 fallan; 0 fallos nuevos**. Comparación por nombre de prueba, no solo por cantidad. Son los fallos previos de custodia/Windows y policy de migraciones, además de schema_mismatch ya presente en main. Se usó una copia limpia de main en `%TEMP%/kuwago-020-baseline` con dependencias existentes enlazadas, sin modificar el checkout ni secretos.
- El primer npm test se interrumpió al detectar procesos colgados: Node ignoraba `--test-force-exit` después del glob. La ejecución final y la base usan la opción antes del glob.
- `test-properties-e2e.mjs` inicia el mismo harness de `dev:admin-test` con sus dos opt-in, Vite y la landing en loopback; no consume Access real ni escribe fuera de D1 efímera. Se completó el cambio de Villa Maya al primer lugar (resolviendo el empate con Carabao en orden 0), publicación y lectura real en la landing, ocultación publicada y fallback tras caída.
- Capturas inspeccionadas en `.wrangler/properties-e2e/`: lista/editor ES/EN, claro/oscuro, 390 px; no hay desbordamiento horizontal. Se reutilizan tokens y componentes de servicios. `index.html` solo añade el script; CSS de landing idéntico a main. Galerías/fotos siguen intactas.
- Migraciones 0001–0008: archivos y hashes idénticos a main; el manifiesto conserva los bytes originales y añade solo 0009. Contratos públicos regenerados por `contracts:build` (salida ignorada por Git por diseño del repo).
- Revisión React (`vercel:react-best-practices`): hooks incondicionales, cargas cancelables, reinicio por identidad, controles etiquetados, permisos en cliente y servidor, validación de respuesta y concurrencia con If-Match; sin dependencias nuevas.
- Archivos de prueba admin en `apps/admin/src/test/` (ubicación real de la suite). La verificación de contrato público/privacidad y API pública vive en `properties-api.test.mjs`, junto a las transiciones, y en los contratos.
- D1 remota, Worker y landing: sin operaciones ni despliegues. `menu/` sin seguimiento preexistente intacto.

Salidas de los comandos del criterio (código 0 salvo la suite backend completa, código 1 por los 59 fallos previos):

<details>
<summary><code>npm --prefix infra/cloudflare/dev run migrate:local</code></summary>

```text
> @kuwago/cloudflare-dev-preparation@0.1.0 migrate:local
> node scripts/local.mjs migrate


 ⛅️ wrangler 4.152.0
────────────────────
Resource location: local 

Use --remote if you want to access the remote instance.

Migrations to be applied:
┌───────────────────────────────────┐
│ name                              │
├───────────────────────────────────┤
│ 0006_media_lifecycle.sql          │
├───────────────────────────────────┤
│ 0007_single_operator_approval.sql │
├───────────────────────────────────┤
│ 0008_service_discounts.sql        │
├───────────────────────────────────┤
│ 0009_properties.sql               │
└───────────────────────────────────┘
? About to apply 4 migration(s)
Your database may not be available to serve requests during the migration, continue?
🤖 Using fallback value in non-interactive context: yes
🌀 Executing on local database DB (DB) from .wrangler\state\development\v3\d1:
🌀 To execute on your remote database, add a --remote flag to your wrangler command.
🚣 6 commands executed successfully.
┌───────────────────────────────────┬────────┐
│ name                              │ status │
├───────────────────────────────────┼────────┤
│ 0006_media_lifecycle.sql          │ ✅     │
├───────────────────────────────────┼────────┤
│ 0007_single_operator_approval.sql │ 🕒️    │
├───────────────────────────────────┼────────┤
│ 0008_service_discounts.sql        │ 🕒️    │
├───────────────────────────────────┼────────┤
│ 0009_properties.sql               │ 🕒️    │
└───────────────────────────────────┴────────┘
🌀 Executing on local database DB (DB) from .wrangler\state\development\v3\d1:
🌀 To execute on your remote database, add a --remote flag to your wrangler command.
🚣 24 commands executed successfully.
┌───────────────────────────────────┬────────┐
│ name                              │ status │
├───────────────────────────────────┼────────┤
│ 0006_media_lifecycle.sql          │ ✅     │
├───────────────────────────────────┼────────┤
│ 0007_single_operator_approval.sql │ ✅     │
├───────────────────────────────────┼────────┤
│ 0008_service_discounts.sql        │ 🕒️    │
├───────────────────────────────────┼────────┤
│ 0009_properties.sql               │ 🕒️    │
└───────────────────────────────────┴────────┘
🌀 Executing on local database DB (DB) from .wrangler\state\development\v3\d1:
🌀 To execute on your remote database, add a --remote flag to your wrangler command.
🚣 5 commands executed successfully.
┌───────────────────────────────────┬────────┐
│ name                              │ status │
├───────────────────────────────────┼────────┤
│ 0006_media_lifecycle.sql          │ ✅     │
├───────────────────────────────────┼────────┤
│ 0007_single_operator_approval.sql │ ✅     │
├───────────────────────────────────┼────────┤
│ 0008_service_discounts.sql        │ ✅     │
├───────────────────────────────────┼────────┤
│ 0009_properties.sql               │ 🕒️    │
└───────────────────────────────────┴────────┘
🌀 Executing on local database DB (DB) from .wrangler\state\development\v3\d1:
🌀 To execute on your remote database, add a --remote flag to your wrangler command.
🚣 19 commands executed successfully.
┌───────────────────────────────────┬────────┐
│ name                              │ status │
├───────────────────────────────────┼────────┤
│ 0006_media_lifecycle.sql          │ ✅     │
├───────────────────────────────────┼────────┤
│ 0007_single_operator_approval.sql │ ✅     │
├───────────────────────────────────┼────────┤
│ 0008_service_discounts.sql        │ ✅     │
├───────────────────────────────────┼────────┤
│ 0009_properties.sql               │ ✅     │
└───────────────────────────────────┴────────┘
```

</details>

<details>
<summary><code>npm run test:contracts</code></summary>

```text
> grupo-kuwago-landing@0.1.0 test:contracts
> npm --prefix packages/contracts run build && npm --prefix packages/contracts test


> @kuwago/contracts@0.1.0 build
> tsc


> @kuwago/contracts@0.1.0 test
> node --test test/*.test.mjs

✔ model schemas validate complete inputs and reject bad states, dates and types (3.5801ms)
✔ draft translation text may be incomplete, but public translations may not (0.5408ms)
✔ money uses explicit supported currencies and safe integer minor units (0.1917ms)
✔ quote prices cannot silently carry a money amount (0.0962ms)
✔ unapproved commercial content, category and images block readiness (1.111ms)
✔ new work revision does not alter the published revision or public price (1.8686ms)
✔ approval is bound to the exact revision identity (0.1382ms)
✔ revision ownership, duplicate IDs/numbers and dangling pointers are rejected (0.2789ms)
✔ archived/draft/demo services never appear as published public services (0.3405ms)
✔ public projection excludes notes, approvals and working revision data (0.4759ms)
✔ catalog rejects duplicate identity, unknown categories and unvalidated references from an API (1.2128ms)
✔ media rejects executable, credential-bearing, signed and private-preview URLs (0.2091ms)
✔ property contracts separate public projection and private working input (3.212ms)
ℹ tests 13
ℹ suites 0
ℹ pass 13
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 113.5788
```

</details>

<details>
<summary><code>npm --prefix apps/admin run typecheck</code></summary>

```text
> @kuwago/admin@0.1.0 pretypecheck
> npm --prefix ../../packages/contracts run build


> @kuwago/contracts@0.1.0 build
> tsc


> @kuwago/admin@0.1.0 typecheck
> tsc --noEmit
```

</details>

<details>
<summary><code>npm --prefix apps/admin run lint</code></summary>

```text
> @kuwago/admin@0.1.0 lint
> eslint . --max-warnings 0
```

</details>

<details>
<summary><code>npm --prefix apps/admin test</code></summary>

```text
> @kuwago/admin@0.1.0 pretest
> npm --prefix ../../packages/contracts run build


> @kuwago/contracts@0.1.0 build
> tsc


> @kuwago/admin@0.1.0 test
> vitest run


 RUN  v5.0.5 C:/Users/JV/Desktop/Kuwago Landing/grupo-kuwago-landing-source/apps/admin


 Test Files  6 passed (6)
      Tests  50 passed (50)
   Start at  02:24:56
   Duration  5.24s (tests 47%, environment 39%, setup 8%, import 3%, transform 2%)
```

</details>

<details>
<summary><code>npm --prefix apps/admin run build</code></summary>

```text
> @kuwago/admin@0.1.0 build
> npm run typecheck && vite build


> @kuwago/admin@0.1.0 pretypecheck
> npm --prefix ../../packages/contracts run build


> @kuwago/contracts@0.1.0 build
> tsc


> @kuwago/admin@0.1.0 typecheck
> tsc --noEmit

vite v8.3.5 building client environment for production...
transforming...
✓ 1979 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                               0.54 kB │ gzip:   0.32 kB
dist/assets/kuwago-purple-GCqGUntw.svg                       10.39 kB │ gzip:   3.91 kB
dist/assets/kuwago-gold-D7Xg_Jb-.svg                         10.40 kB │ gzip:   3.91 kB
dist/assets/hanken-grotesk-latin-400-normal-BG6hkEXj.woff2   13.46 kB
dist/assets/hanken-grotesk-latin-600-normal-CIXX6EOa.woff2   13.78 kB
dist/assets/hanken-grotesk-latin-500-normal-DrDcrrxK.woff2   13.79 kB
dist/assets/hanken-grotesk-latin-700-normal-CeQ8H3UY.woff2   13.84 kB
dist/assets/hanken-grotesk-latin-400-normal-CjyVwvJV.woff    17.24 kB
dist/assets/hanken-grotesk-latin-600-normal-NEn2C4Q3.woff    17.50 kB
dist/assets/hanken-grotesk-latin-500-normal-Bo-NxEKf.woff    17.51 kB
dist/assets/hanken-grotesk-latin-700-normal-6IGCzoPh.woff    17.54 kB
dist/assets/carabao-CKfqPD8D.webp                           123.01 kB
dist/assets/index-nVIWKjpj.css                               31.92 kB │ gzip:   7.22 kB
dist/assets/index-DmUMhkzU.js                               328.94 kB │ gzip: 100.87 kB

✓ built in 393ms
```

</details>

<details>
<summary><code>npm --prefix apps/admin run verify:isolation</code></summary>

```text
> @kuwago/admin@0.1.0 verify:isolation
> node scripts/verify-isolation.mjs

Isolation passed: separate outputs; no admin/private files in landing; local servers bind to 127.0.0.1.
```

</details>

<details>
<summary><code>npm --prefix infra/cloudflare/dev run typecheck</code></summary>

```text
> @kuwago/cloudflare-dev-preparation@0.1.0 typecheck
> node ../../../apps/admin/node_modules/typescript/bin/tsc --noEmit
```

</details>

<details>
<summary><code>npm --prefix infra/cloudflare/dev run lint</code></summary>

```text
> @kuwago/cloudflare-dev-preparation@0.1.0 lint
> node ../../../apps/admin/node_modules/eslint/bin/eslint.js src scripts test --config ../../../apps/admin/eslint.config.js --max-warnings 0
```

</details>

<details>
<summary><code>npm --prefix infra/cloudflare/dev test -- --test-force-exit</code></summary>

```text
> @kuwago/cloudflare-dev-preparation@0.1.0 pretest
> npm --prefix ../../../packages/contracts run build && npm run build


> @kuwago/contracts@0.1.0 build
> tsc


> @kuwago/cloudflare-dev-preparation@0.1.0 build
> npm run typecheck && node scripts/build.mjs


> @kuwago/cloudflare-dev-preparation@0.1.0 typecheck
> node ../../../apps/admin/node_modules/typescript/bin/tsc --noEmit

Local Worker and security module built; no upload.

> @kuwago/cloudflare-dev-preparation@0.1.0 test
> node --test --test-force-exit test/*.test.mjs --test-force-exit

▶ cryptographic Access verifier
  ✔ only configured Cloudflare team HTTPS issuer and audience accepted (1.0021ms)
  ✔ missing token, email header and malformed token do not fetch keys or authenticate (3.3073ms)
  ✔ valid RS256 signature yields only stable verified issuer and subject (19.7758ms)
  ✔ same kid with incorrect signature is rejected (3.889ms)
  ✔ expired, not-yet-valid, future issued-at and missing claims are rejected (42.2941ms)
  ✔ wrong application audience and issuer cannot be accepted (38.9909ms)
  ✔ algorithm confusion and attacker-controlled key headers are rejected (41.6946ms)
  ✔ unknown kid cannot trigger repeated JWKS fetch within cooldown (16.0897ms)
  ✔ JWKS rotation refreshes after bounded cooldown and caches new key (17.8407ms)
  ✔ unavailable, oversized and malformed JWKS fail closed with generic errors (32.1517ms)
  ✔ JWKS fetch never follows redirects and is restricted to configured issuer (17.5624ms)
✔ cryptographic Access verifier (402.3251ms)
▶ middleware, real local D1 and canonical RBAC
  ✔ migrations do not create privileged principals or migrate legacy grants (83.7017ms)
  ✔ D1 role matrix exactly matches server ceiling (68.8319ms)
  ✔ anonymous direct endpoints and email-only requests cannot bypass middleware (2.8613ms)
  ✔ unknown, disabled and roleless administrators all receive generic denial (75.3811ms)
  ✔ editor identity can read own authorization context, without JWT, email or issuer (53.9675ms)
  ✔ editor publication denied; administrator publication requires version precondition (213.6849ms)
  ✔ admin cannot manage administrators; super admin passes authorization without modifying users (114.8634ms)
  ✔ frontend body, headers and JWT custom role claims cannot elevate an editor (55.539ms)
  ✔ role revocation and disabled principal take effect without identity cache (141.6204ms)
  ✔ unexpected elevated DB grant fails closed instead of broadening static permissions (51.9628ms)
  ✔ CSRF controls reject missing/foreign/null Origin, wrong headers and form requests (283.7341ms)
  ✔ unknown paths and methods denied; private images fail closed without a storage binding and catalog listing is authenticated (181.7696ms)
  ✔ security audit records authorization outcome only, and logs exclude tokens and client input (17.4363ms)
  ✔ missing configuration, wrong execution environment, DB read or audit failures deny access generically (24.7102ms)
  ✔ canonical approval trigger accepts independent admin and rejects historical publisher grants (106.01ms)
✔ middleware, real local D1 and canonical RBAC (3224.4963ms)
{"event":"access_denied","requestId":"aa9693b9-ae17-4043-9571-6ea5ea296ecc","operation":"admin:read","status":401}
{"event":"access_authorized","requestId":"ddeb4dfb-afe1-4a2b-8f44-942e3e88cc99","operation":"admin:read","status":200,"principalId":"fixture-super","role":"super_admin"}
✔ actual bundled Worker verifies a signed JWT and queries D1 inside local workerd (1608.7186ms)
✔ backup once: default remains disabled and a forged permit cannot authorize remote access (1.3253ms)
✔ backup Edit plan: tests never consume a live approval; inactive gate blocks before credentials or network (265.2264ms)
✔ backup Edit preparation: even a more privileged token cannot send SQL writes through the transport (0.9072ms)
✔ backup Edit preparation: form gets the same plan, labels power accurately and disables inputs while unapproved (1.157ms)
✔ backup once: export denied is sanitized and cannot restart within the transport (24.3823ms)
✔ backup once: continuing polling is one export start, never a restarted job (110.6287ms)
✔ backup once: authorization is exclusive on disk, UI masks both secrets, exact stage four enforced (3.4915ms)
✔ backup-only: actual Windows custody has exactly the operator and SYSTEM and resides outside Git (1075.7557ms)
✔ backup-only: nonempty synthetic SQL decrypts and restores in isolated SQLite without applying migration files (1029.364ms)
✔ backup-only: real AES-GCM + DPAPI and independent recovery decrypt; wrong key/ciphertext fail (3026.5565ms)
✔ backup-only: successful pipeline verifies encrypted disk bytes and isolated restore, with no plaintext SQL or URL on disk (2267.9154ms)
✔ backup-only: nonexistent folder and unsafe ACL fail before any source request (2.9631ms)
✔ backup-only: failed encryption and export interruption do not leave SQL, partial ciphertext or retry locks (117.1156ms)
✔ backup-only: corrupted ciphertext or SQL restoration failure cannot promote a backup (2807.409ms)
✔ backup-only: wrong D1 target and partial download are rejected without promotion or automatic retries (30.6722ms)
✔ backup-only: cleanup failure preserves encrypted pending bytes, safe evidence and a retry-blocking lock (1005.9909ms)
✔ backup-only: failure after promotion never deletes an already verified encrypted backup (1416.0156ms)
✔ backup-only: encrypted store has no recursive deletion, rejects duplicate runs and never accepts SQL paths (11.3644ms)
✔ backup-only: import graph and public transport contain no migration/SQL writer and CLI is remotely locked (130.4914ms)
✔ backup: complete empty SQL and Time Travel receipt restore, hash and target verify without writes (1860.1799ms)
✔ backup: full Kuwago schema, bilingual content, history, audit, NUL text and max safe integers survive isolated restore (8634.7817ms)
✔ backup: missing bookmark, empty/malformed/incomplete export and interruptions cannot mint a receipt or reach migration (3648.6627ms)
✔ backup: SQL file corruption/deletion and forged legacy baseline receipt are rejected (956.4138ms)
✔ backup: changed source state/bookmark or target blocks acceptance (1208.5181ms)
✔ backup: export polling stays on same job, requests all schema/data and never forwards API credentials to download (108.3891ms)
✔ backup: export errors, job drift, invalid download origin, redirect, truncation and interruption fail closed (1.825ms)
✔ backup: isolated verifier rejects external file access, extensions, expensive SELECTs and invalid UTF-8 (868.4171ms)
✔ backup: a syntactically valid dump missing data or referenced identities is not considered restored (2241.0307ms)
✔ backup: source content mutation during export prevents a valid receipt even if bookmark mocks remain unchanged (2882.7465ms)
✔ backup: polling and maximum file size are bounded, without restarting an export job (1201.721ms)
✖ stage4 backup: pinned reconciliation, exact fingerprint and disabled fresh ID validate locally (1.4056ms)
✖ stage4 backup: approved complete transition reproduces the actual reconciled fingerprint and restores exactly (2861.4994ms)
✖ stage4 backup: changed catalog state or ledger timestamp cannot silently establish a new fingerprint (1859.2451ms)
✖ stage4 backup: changing bookmarks or incomplete dump fail without automatic retry (1820.7227ms)
✖ stage one: fixed plan is new, disabled and validates original backup and approved 0001 evidence locally (1.446ms)
✔ stage one: valid complete snapshot is encrypted and exactly restored including ledger, seeds and sequence (7175.7031ms)
✔ stage one: empty or stage two database is rejected before starting an export (1809.6929ms)
✔ stage one: unexpected tables, history, seeds or content block before export (3413.1084ms)
✔ stage one: ledger timestamp drift changes full fingerprint and prevents promotion (2723.2541ms)
✔ stage one: missing bookmark, changed bookmark, invalid dump or export interruption cannot promote (7798.871ms)
✖ stage one: CLI blocks before reading input or issuing network requests; graph contains no writer (102.0454ms)
✖ stage-six backup-only: simulated export, exact pinned baseline, encryption and isolated restoration; no remote writes (1022.9331ms)
✖ stage three: evidence pins validate locally, fresh ID stays disabled and no previous backup changes (1.5731ms)
✔ stage three: exact complete schema, history, seeds and full snapshot encrypt and restore in isolated SQLite (8444.6108ms)
✔ stage three: stage one/four, incorrect ledger, seed grants, schema or content blocks before export (5522.8737ms)
✔ stage three: unstable pre-export bookmarks stop before export, without accepting a new baseline (2066.9966ms)
✔ stage three: timestamp drift during export or a truncated dump cannot promote a backup (7235.314ms)
✖ stage three: CLI and private UI remain locked and cannot be enabled with arguments or environment (142.8926ms)
✔ baseline audit: logical equality is separate from moving current bookmark and stable fixed timestamp (4.709ms)
✔ baseline audit: changed logical schema is reported, never accepted as matching (1.0459ms)
✔ baseline audit: read transport exposes no writer/export and rejects mutating SQL before requests (0.7303ms)
✔ baseline audit: credential errors and timestamps remain redacted without retry (21.11ms)
✔ baseline observations: success retains strict triplet equality and the final freshness guard (4261.2023ms)
✔ baseline observations: first/middle and middle/last changes are separately identifiable and still rejected (6498.7188ms)
✔ baseline observations: original-checkpoint mismatch stops before snapshots; no silent rebasing (1493.7877ms)
✔ baseline observations: logical change or failed durable observation cannot produce an accepted baseline (3758.6204ms)
✔ existing DPAPI accepts BKM1 bookmark encoding; rejects textual bookmark length (2268.9373ms)
✖ durable bootstrap: fixed target, single request, verified independent oracle and durable closure (1772.658ms)
✖ durable bootstrap: target mismatch, bookmark race and SQL concurrent change stop without retries (1792.9996ms)
✖ durable bootstrap: commit with ambiguous response, bad readback or checkpoint collision never claims PASS or retries (1559.1122ms)
✖ capabilities: remote gate and recovery evidence; no exports, arbitrary SQL, forged recovery or changed scope (5523.6ms)
✖ bootstrap ACK binds transport, environment, execution, stage, batch and source hash, and is consumed once (1032.9775ms)
✖ stage-six recovery profile validates real closure locally, does not call remote, rejects stage-four/fingerprint mismatch (577.7312ms)
✖ JWT expires or identity ages during request journal persistence: zero mutating fetches (976.742ms)
▶ local administrative catalog workflow and isolated public projection
  ✔ public source starts unavailable, then explicit sync initializes a real empty API catalog (457.3401ms)
  ✔ categories preserve stable IDs, complete ES/EN and optimistic version (508.6275ms)
  ✔ draft creation validates and never leaks unverified content to public API (404.1642ms)
  ✔ input cannot supply provenance, image URLs, approvals, actor IDs or publication state (247.4199ms)
  ✔ commercial approval requires complete ES/EN, valid money, approved media and independent reviewer (1212.3914ms)
  ✔ translation-only revision preserves other fields and rechecks its own DB permission (611.8253ms)
  ✔ approval seals exact hash/revision; publication and audit commit together (1086.2779ms)
  ✔ public categories/services/detail expose only immutable approved DTOs, with no private bindings (98.1326ms)
  ✔ editing a published service creates a new draft revision and cannot edit the published revision (541.6641ms)
  ✔ stale versions and simultaneous writers yield one winner; no false success audit (602.3455ms)
  ✔ SQL injection stays data, foreign references and invalid state transitions are rejected (316.5773ms)
  ✔ unpublish removes public service; archival is final and invalid repeated state changes fail (1199.2009ms)
  ✔ byte limit, body allowlists, missing version and audit pagination are enforced (134.875ms)
  ✔ a failing business audit rolls back publication, command, outbox and version together (867.3527ms)
  ✔ category changes invalidate prior commercial approval rather than silently publishing new category content (607.5679ms)
  ✔ revoked administrator is rechecked inside the SQL transaction, not only middleware (68.9718ms)
  ✔ delivery failure is pending, retry is explicit, and parallel publication cannot overwrite a newer snapshot (2220.3115ms)
  ✔ pending withdrawal preserves only the former approved copy; repeated reconciliation is idempotent (1961.6616ms)
  ✔ public corruption, private URL or unknown fields fail closed without static fallback (310.9464ms)
  ✔ barrier rejects a divergent higher generation and sync restores the authoritative snapshot (320.6073ms)
  ✔ service discounts: validated, sealed with the revision and hidden outside Costa Rica dates (3864.874ms)
✔ local administrative catalog workflow and isolated public projection (19575.7457ms)
✔ 0004 upgrades existing publication commands/outbox without data loss or foreign-key breakage (805.4887ms)
{"event":"access_denied","requestId":"9f0795b7-494d-4c38-a2e1-120db0cf79d1","operation":"admin:read","status":401}
{"event":"access_authorized","requestId":"08063fc3-b8f8-4c08-bc43-3bc406f96831","operation":"drafts:write","status":200,"principalId":"fixture-admin","role":"admin"}
{"event":"access_authorized","requestId":"4cc6b237-ebde-4dd4-8fb7-bf6a9022eeed","operation":"services:publish","status":200,"principalId":"fixture-admin","role":"admin"}
✔ real admin and public Worker bundles run separately in workerd with only a shared local publication bucket (1249.3123ms)
✔ audit: complete fresh local migration chain has clean integrity and no scratch tables (1886.7117ms)
✔ audit: upgrade preserves every prior row, both revisions, approvals and outbox metadata (2782.8059ms)
✔ audit: failure after 0004 table reconstruction rolls back all schema and historical rows (2372.752ms)
✔ audit: every catalog route rejects anonymous, invalid and disabled identities and enforces the role matrix (4936.5182ms)
✖ 0005→0006: exclusive blocked scope, original migrations, projected generated values and durable stage-6 closure (3462.9182ms)
✖ concurrent changes: SQL CAS, postwrite data/epoch, bookmark, transaction output and ACK binding fail closed (1866.9878ms)
✖ ambiguous response after a real local commit: no ACK, no retry, no 0006 and durable unknown outcome (1736.0357ms)
✖ persistence failure after checkpoint write: stop at 0005 or final 0006 and never claim stage-6 closure (1442.6308ms)
✖ versioned SQL matches reviewed checksums (3.7866ms)
✔ local configuration has no real IDs, remote bindings or production/staging environments (0.9339ms)
✔ built Worker has no test identities, key material, simulation flags or authentication bypass (1.3733ms)
✔ public Worker bundle and config contain no administrative/D1/private-media surface (1.6485ms)
✔ wrapper exposes only fixed local operations; arbitrary command/extra remote arguments rejected (0.3763ms)
✔ remote candidate is explicitly pending and not targeted by local scripts (1.3573ms)
✔ preparation worker denies every request without accepting identity or returning private data (39.2655ms)
✔ media storage keys are generated private DEV keys, not user-selected URLs (0.3751ms)
✔ trusted decoder metadata must satisfy limits, MIME and complete normalization (0.3191ms)
✔ media lifecycle never restores retired/deleted content or approves quarantine directly (0.2503ms)
✔ current-admin backup accepts schema six with exact enabled administrator, disabled grantor and audit; rejects unrelated content (34.2195ms)
✔ D1 read diagnostic performs exactly metadata GET then a fixed schema SELECT on one DB (33.569ms)
✔ 10000 stops after metadata and redacts any echoed credential/error message (2.3911ms)
✔ wrong account/DB, missing credential and metadata target mismatch fail closed (2.5438ms)
✔ network errors and redirects never retry, follow or expose diagnostics (2.7587ms)
✔ empty DEV preflight rejects administrative tables, migration history and unknown or filtered names (3.0192ms)
▶ D1 local migrations and relational invariants
  ✔ both versioned migrations apply to an empty local workerd D1 (381.1057ms)
  ✔ deferred circular foreign keys allow atomic service and initial revision creation (183.5423ms)
  ✔ role membership rejects self-grants and unknown roles; no implicit administrator (36.8807ms)
  ✔ money uses safe integer minor units and explicit currencies; quote carries no amount (143.5382ms)
  ✔ locale, option ownership and media order integrity match the shared contract (111.1853ms)
  ✔ draft DTO can round-trip to AdminServiceSchema without inventing public media URLs (32.883ms)
  ✔ approval requires a sealed hash and independent enabled publisher (99.6248ms)
  ✔ sealed revisions and every child collection reject edits, insertion and deletion (301.2683ms)
  ✔ SQL abort rolls back the full batch, including audit event; zero-row update alone is not an abort (64.4211ms)
  ✔ audit is append-only; approval can only be revoked once (102.5462ms)
  ✔ media states and approved-file requirements prevent bypassing quarantine (91.5059ms)
  ✔ final foreign key check is clean (17.6627ms)
✔ D1 local migrations and relational invariants (2961.473ms)
{"event":"access_denied","requestId":"eb3205cc-c1b6-4be0-9175-63221f20eca0","operation":"admin:read","status":403}
{"event":"access_authorized","requestId":"542d9c17-31a6-4331-9984-2b5fbfcb7d01","operation":"admin:read","status":200,"principalId":"fixture-super","role":"super_admin"}
{"event":"access_authorized","requestId":"a7bf54ab-2802-4f1b-abed-a3f79649efc8","operation":"admin:read","status":200,"principalId":"fixture-super","role":"super_admin"}
{"event":"access_authorized","requestId":"9c73bb6f-ce1a-4def-89f2-e54f95c39e4f","operation":"admin:read","status":200,"principalId":"fixture-super","role":"super_admin"}
{"event":"access_authorized","requestId":"6f8dfe72-9883-4129-adba-a6462079f829","operation":"drafts:write","status":200,"principalId":"fixture-super","role":"super_admin"}
{"event":"request_rejected","requestId":"6f8dfe72-9883-4129-adba-a6462079f829","operation":"drafts:write","status":501}
{"event":"access_authorized","requestId":"e2cbbbbe-4282-4bcf-8a5a-496e5d0e6d0c","operation":"drafts:write","status":200,"principalId":"fixture-super","role":"super_admin"}
{"event":"request_rejected","requestId":"e2cbbbbe-4282-4bcf-8a5a-496e5d0e6d0c","operation":"drafts:write","status":422}
{"event":"access_authorized","requestId":"36e09f60-84c7-4a5f-8a01-a4b041a42df3","operation":"admins:manage","status":200,"principalId":"fixture-super","role":"super_admin"}
{"event":"request_rejected","requestId":"36e09f60-84c7-4a5f-8a01-a4b041a42df3","operation":"admins:manage","status":501}
✔ combined DEV ingress protects assets and real D1 reads; mutations stay disabled (2411.3732ms)
✔ remote DEV configuration pins existing resources and invokes authentication before every asset (1.2942ms)
▶ gateway authenticates assets, delegates RBAC and denies alternative routes
  ✔ missing, invalid, expired, incorrect signature/issuer/audience tokens cannot reach assets or API (105.183ms)
  ✔ unknown, disabled and roleless Access identities are denied by private API even for JS (96.3543ms)
  ✔ registered editor can load HTML/bootstrap/assets with secure no-store headers and HEAD (208.6339ms)
  ✔ session keeps role private to API; spoofed role/email/cookie/forwarded headers are stripped (51.1407ms)
  ✔ API ETag and 202 pending survive proxying without permitting browser caches (1.7635ms)
  ✔ editor cannot publish or manage users, even with privileged request headers (88.3306ms)
  ✔ CSRF and CORS preflight rejected without delegating mutating requests (6.5211ms)
  ✔ foreign host, raw private files, source files, public API and local test login never route to a binding (12.2939ms)
  ✔ private previews require registered identity/ownership and are delegated to API without public mapping (52.9248ms)
  ✔ a second enabled editor cannot discover another uploader private preview (225.9986ms)
  ✔ revocation takes effect on next HTML/asset/API request; no cached authorization (98.4357ms)
  ✔ wrong configuration, binding errors, redirects and SPA fallback fail closed (47.9978ms)
✔ gateway authenticates assets, delegates RBAC and denies alternative routes (2887.9675ms)
✔ gateway config has only local assets/API and no private/public storage bindings (2.3744ms)
▶ Images adapter: actual workerd + offline Images binding, never remote
  ✔ full decode/re-encode png to bounded PNG in workerd (46.8032ms)
  ✔ full decode/re-encode jpeg to bounded PNG in workerd (27.1052ms)
  ✔ full decode/re-encode webp to bounded PNG in workerd (29.8645ms)
  ✔ false MIME and disallowed SVG/GIF rejected before decode (14.4947ms)
  ✔ CRC corruption and truncations cannot become validated output (29.4925ms)
  ✔ structurally plausible but damaged compressed payload fails full decode (49.6445ms)
  ✔ dimension/decompression bombs and byte limits rejected before binding (16.1056ms)
  ✔ PNG animation and WebP animation containers cannot silently flatten into approval (23.0546ms)
  ✔ all non-rendering PNG chunks stripped from the normalized result (33.5473ms)
{"event":"offline_images_orientation_6","status":200}
  ✔ EXIF orientation and metadata behavior exercised in local simulator (34.7437ms)
{"event":"offline_images_exif_matrix","observed":[{"orientation":1,"status":200},{"orientation":2,"status":200},{"orientation":3,"status":200},{"orientation":4,"status":200},{"orientation":5,"status":200},{"orientation":6,"status":200},{"orientation":7,"status":200},{"orientation":8,"status":200}]}
  ✔ eight EXIF rotations/reflections compared by asymmetric raster, not just dimensions (264.8244ms)
  ✔ transformation/connection errors, invalid output and deadline fail closed (37.2763ms)
  ✔ production policy gate and absent binding deny processing without Node fallback (8.3578ms)
✔ Images adapter: actual workerd + offline Images binding, never remote (3409.1795ms)
✔ administrative integration: uncertain processor remains quarantined; existing approvals unchanged (2454.0777ms)
{"event":"access_authorized","requestId":"1d82847b-e42e-44c5-b3be-026746932acb","operation":"media:prepare","status":200,"principalId":"fixture-editor","role":"editor"}
{"event":"access_authorized","requestId":"8b49bb86-7618-45db-9d5a-cbe0abddaba8","operation":"media:read-private","status":200,"principalId":"fixture-editor","role":"editor"}
{"event":"access_authorized","requestId":"2483c99b-4c2f-4ef1-9567-536234e616d0","operation":"media:prepare","status":200,"principalId":"fixture-editor","role":"editor"}
{"event":"request_rejected","requestId":"2483c99b-4c2f-4ef1-9567-536234e616d0","operation":"media:prepare","status":403}
{"event":"access_authorized","requestId":"6ee60fab-65b6-4f6f-be6d-ae0b54e59525","operation":"media:prepare","status":200,"principalId":"fixture-admin","role":"admin"}
✔ real administrative Worker in workerd: Images result stays private and requires independent usage approval (1839.8611ms)
✔ isolated Images plan requires explicit authorization and confirmed account plan (1.2851ms)
✔ isolated config permits only Images, loopback and no deployed ingress or account by default (0.4577ms)
✔ prepared probe bundles synthetic corpus without administrative dependencies (475.2757ms)
✔ probe rejects browser/unknown input and enforces a finite request budget (2539.9406ms)
✔ remote-labelled probe without authorization denies before any transform (1284.2561ms)
✔ offline conformance fixes PNG while preserving the legacy JPEG metric and explicit codec profile (1864.0756ms)
✔ runner marks connection failures as failures without retries or fabricated costs (1.1091ms)
✔ single PNG fixture and bundle exclude other codecs, resources and administrative code (113.4729ms)
✔ single runtime budget is never reset after success (1245.1578ms)
✔ single runtime budget is never reset after failure (1304.1861ms)
✖ 0001 only: pinned encrypted backup restores locally without plaintext file; manifest/hash unchanged (2674.4159ms)
✖ verified baseline proposal: reviewed evidence plus fresh equal state permits one local 0001 without replacing historical backup (6649.3863ms)
✖ verified baseline proposal: concurrent bookmark change and absent durable evidence both prevent writing (4401.9449ms)
✖ 0001 only: real local D1 batch applies exactly first migration, records one ledger row and no principals (1399.8516ms)
✔ 0001 only: changed bookmark or unexpected schema prevents all writes (2742.1254ms)
✖ 0001 only: batch failure rolls back locally and network ambiguity never retries (1289.6676ms)
✔ 0001 only: scoped transport cannot export or accept arbitrary batches; entry has no multi-stage loop (1409.7299ms)
✔ batch: disabled release rejects forged permits, env overrides and CLI before reading credentials (483.4264ms)
✖ batch: exact restored stage-one source progresses through only 0002-0006 with guarded real D1 batches (1581.5247ms)
✖ batch: initial logical change, wrong identity or missing evidence prevents all writes (1006.2788ms)
✖ batch: atomic full-data guard catches a ledger-only race after the final bookmark check (911.1255ms)
✖ batch: SQL failure at each stage rolls back and stops before the next stage, no retries (1019.5193ms)
✖ batch: ambiguous network outcome or failed postflight checkpoint never starts the next stage (994.9519ms)
✔ batch: scoped transport has no export and refuses arbitrary writes (1.0528ms)
✖ batch: changed bookmark before writing or between stages stops without renewing that baseline silently (852.9641ms)
✖ batch: postflight rejects modified timestamps in earlier migration history (779.8612ms)
✔ final batch: only the new fixed scope can authorize 0004-0006; disabled CLI ignores env overrides (343.8122ms)
✖ final batch: restored stage-three snapshot progresses only 0004-0006 with observations and postflight checkpoints (1102.5144ms)
✖ final batch: logical mismatch, wrong target or missing durable evidence prevent all writes (1467.36ms)
✖ final batch: SQL failure at each of the three steps rolls back and never retries or advances (966.4433ms)
✖ final batch: bookmark or data race, ambiguous response, or failed checkpoint stops immediately (861.7467ms)
✔ final batch: even simulated scoped transport cannot export or submit arbitrary SQL (1.2766ms)
▶ media: protected local lifecycle, publication and recovery with actual image bytes
  ✔ anonymous and disabled requests denied including binary reads (44.4596ms)
  ✔ real PNG decoded, normalized and stored privately without automatic approval (438.5864ms)
  ✔ MIME spoof, SVG, oversized and corrupt files rejected (397.9706ms)
  ✔ EXIF orientation applied and all metadata removed (11.4583ms)
  ✔ decoder absent leaves quarantine and cannot be approved or previewed (353.708ms)
  ✔ private object ownership checked; arbitrary keys never accepted (387.0513ms)
  ✔ editor cannot approve; independent explicit reviewer required (277.7745ms)
  ✔ reject, retire and idempotent cleanup retain all historical references (852.5804ms)
  ✔ revision API attaches media, stores cover/order and bilingual alt text (358.668ms)
{"event":"catalog_reconciliation","visible":true,"mode":"ready","pendingCount":0,"quarantinedCount":0,"oldestPendingMs":0,"escalatedCount":0}
  ✔ published snapshot serves only approved normalized media bytes (1317.7776ms)
  ✔ storage outage yields 202, barrier prevents stale image delivery, retry recovers (736.4836ms)
  ✔ unlink creates a new revision; historical references prevent physical deletion (511.1721ms)
  ✔ partial restore remains paused with history intact and no automatic republication (3549.3057ms)
  ✔ upload R2 error leaves a tracked quarantine row rather than an untracked object (124.4256ms)
  ✔ JPEG and WebP traverse the real upload validator and become metadata-free PNG (342.286ms)
  ✔ upload same-origin/custom-header checks apply to binary as well as JSON (85.1428ms)
  ✔ server-configured byte limit and decoder failures fail closed (190.1871ms)
  ✔ private preview detects missing or altered bytes rather than trusting metadata (210.2961ms)
  ✔ PNG excess rejects before approval while malformed decoder output remains quarantined (394.9102ms)
  ✔ normalized PNG over 2 MiB returns a specific error and is rejected without approval (182.1963ms)
  ✔ rate limits cover upload and private metadata/preview reads (132.4803ms)
  ✔ integrity and transactional audit remain intact (34.3777ms)
✔ media: protected local lifecycle, publication and recovery with actual image bytes (13423.4884ms)
✔ media migration 0006 preserves existing D1 identities, revisions and media (907.6561ms)
✖ owned checkpoint prototype: genuine local own-write ack and exact expected state establish a fresh stable checkpoint (1808.4579ms)
✖ owned checkpoint prototype: forged acknowledgement, logical difference and unavailable evidence cannot establish checkpoints (1330.403ms)
✖ owned checkpoint prototype: bookmark change after boundary remains terminal, never renewed or retried (883.2196ms)
▶ PNG strict conformance in workerd: complete zlib, raster, filters and critical ordering
  ✔ known CRC vector and independently encoded PNG agree (59.5513ms)
  ✔ legal color/depth combinations and split/empty IDAT remain accepted (118.9958ms)
  ✔ Adam7 exact row sizes include empty passes and packed pixels (111.1969ms)
  ✔ original decompression-excess fixture is rejected before any decoder (73.8335ms)
  ✔ short/long raster and invalid row filters reject even with valid CRC/zlib (58.0972ms)
  ✔ corrupt Adler checksum, truncated zlib, concatenation and trailing compressed data reject (80.1986ms)
  ✔ invalid critical order, palette/transparency, reserved bits and duplicate chunks reject (51.3631ms)
  ✔ palette indices are checked after undoing PNG row filters (12.1653ms)
✔ PNG strict conformance in workerd: complete zlib, raster, filters and critical ordering (1823.0522ms)
✔ PNG invalid data never invokes the local decoder, and policy v1 cannot enable v2 (68.3743ms)
✔ portable recovery restores a nonempty synthetic backup with DPAPI wrapper absent (224.0001ms)
✔ portable recovery rejects wrong key, tampering and wrong target (249.0367ms)
✔ portable CLI restores in a separate process via private pipe without profile DPAPI or secret output (605.5153ms)
✔ portable import graph contains no Windows protector, network, migration writer or backup transport (4.9175ms)
▶ properties: seed, contracts, authorization, snapshots, privacy and mutation guards
  ✔ 0009 hashes intact, exact existing texts and NULL unknown fields (143.1078ms)
  ✔ public contract excludes private fields and input rejects unsafe Airbnb/numbers/unknown metadata (989.0064ms)
  ✔ auth, origin, feature switch and version enforced before mutation (280.5797ms)
  ✔ edit published working data, snapshot immutable until publish, editor forbidden/admin allowed (476.7642ms)
  ✔ working visibility waits for publish, unpublish/archive withdraw and slug remains locked (1004.6644ms)
  ✔ create draft, pagination, duplicate slug and current DB permission guard (495.2472ms)
  ✔ public boundary rejects corrupt/private snapshots, method/query and absent binding (37.8149ms)
✔ properties: seed, contracts, authorization, snapshots, privacy and mutation guards (5396.7094ms)
✖ stage4 reconciliation: exact replay from backup confirms full schema, history, data and fingerprints (1049.8722ms)
✖ stage4 reconciliation: logical differences and wrong identity stop, not hidden by a newly captured fingerprint (0.3311ms)
✖ stage4 reconciliation: moving bookmarks are evidence, not permission to write or a stable checkpoint (0.1892ms)
✖ stage4 reconciliation: invalid fourth migration timestamp or evidence failure blocks confirmation (0.1835ms)
✔ private generator: deterministic bytes use the exact portable verifier format (2.4399ms)
✔ private generator: validator accepts synthetic pipe input without echo and rejects extra fields (438.01ms)
✔ private generator: PowerShell synthetic conversion, verifier bridge, cleanup and parser tests without UI or RNG (2164.1414ms)
✔ private generator: UI has only explicit OS RNG, guarded copy and transient reveal; no file/network/log calls (3.2394ms)
✔ recovery ceremony: exact synthetic rows restore without DPAPI; wrong key and expected content fail (396.6273ms)
✔ recovery ceremony: separate synthetic CLI processes preserve ciphertext, issue sanitized PASS and reject duplicate encryption (4513.521ms)
✔ recovery ceremony: wrong synthetic second-session key yields FAIL, never PASS (2381.2948ms)
✔ recovery ceremony: scripts parse; UI input is masked and launcher waits for independent processes (931.0892ms)
{"event":"catalog_reconciliation","visible":true,"mode":"ready","pendingCount":0,"quarantinedCount":0,"oldestPendingMs":0,"escalatedCount":0}
✔ resilience: real scheduled handler in workerd drains pending events without a manual sync request (4004.5338ms)
{"event":"catalog_reconciliation","visible":false,"mode":"ready","pendingCount":1,"quarantinedCount":0,"oldestPendingMs":951,"escalatedCount":0}
{"event":"catalog_reconciliation","visible":false,"mode":"ready","pendingCount":1,"quarantinedCount":0,"oldestPendingMs":15745,"escalatedCount":0}
{"event":"catalog_reconciliation","visible":false,"mode":"ready","pendingCount":1,"quarantinedCount":0,"oldestPendingMs":45746,"escalatedCount":0}
{"event":"catalog_reconciliation","visible":false,"mode":"ready","pendingCount":1,"quarantinedCount":0,"oldestPendingMs":105747,"escalatedCount":0}
{"event":"catalog_reconciliation","visible":false,"mode":"ready","pendingCount":1,"quarantinedCount":0,"oldestPendingMs":225748,"escalatedCount":0}
{"event":"catalog_reconciliation","visible":false,"mode":"ready","pendingCount":1,"quarantinedCount":0,"oldestPendingMs":465749,"escalatedCount":0}
{"event":"catalog_reconciliation","visible":false,"mode":"ready","pendingCount":1,"quarantinedCount":0,"oldestPendingMs":945750,"escalatedCount":0}
{"event":"catalog_reconciliation","visible":false,"mode":"ready","pendingCount":1,"quarantinedCount":0,"oldestPendingMs":1845751,"escalatedCount":1}
✔ resilience: persistent retry, withdrawal barrier, escalation and audited operator recovery (5240.567ms)
✔ resilience: concurrent/duplicate delivery and publication followed by withdrawal preserve the newest state (2785.5456ms)
✔ resilience: two synchronizers race a pending generation using one persistent lease (2109.9491ms)
✔ resilience: withdrawal between barrier reads rejects an in-flight old snapshot (2172.003ms)
✔ resilience: delayed old synchronization cannot acknowledge or replace a later withdrawal (2060.3766ms)
✔ resilience: restart checkpoint before retry exhaustion is redelivered after the lease expires (2265.0336ms)
✔ resilience: a partial restore never republishes a historical approved revision (4186.3729ms)
✔ resilience: failure between archive and current object is retried without losing the event (1430.709ms)
✔ resilience: outage after confirmed delivery re-enters bounded retry and automatically heals (1491.1827ms)
✔ resilience: corrupt persistent payload escalates instead of disappearing or producing public content (1345.2845ms)
✔ resilience: invalid restored references roll back schema, principals and history in the isolated target (2951.3254ms)
✔ resilience: legacy payloads require explicit quarantine and cannot be silently regenerated (753.1773ms)
{"event":"catalog_reconciliation","visible":false,"mode":"ready","pendingCount":1,"quarantinedCount":0,"oldestPendingMs":91723,"escalatedCount":1}
✔ resilience: interrupted synchronizer recovers its durable lease after a real local runtime restart (1712.0685ms)
✖ safe runner: pinned six-file allowlist and hashes reject alteration, reordering, extra SQL and modified manifest entries (2.3405ms)
✖ safe runner: full six-stage first install uses actual workerd transactional D1 with postflight after each stage (1045.3545ms)
✔ safe runner: wrong resource ID, name, account and storage version prevent all writes (3351.451ms)
✖ safe runner: unexpected schema and pre-existing partial installations cannot start or resume (1604.4001ms)
✔ safe runner: missing/invalid Time Travel blocks backup and writing (2521.8658ms)
✔ safe runner: fabricated, missing, altered backup and fabricated preflight cannot authorize a stage (1098.7553ms)
✖ safe runner: corrupt migration history halts the next stage (562.7431ms)
✖ safe runner: failure within a migration rolls back its SQL and ledger and stops the entire operation (587.5906ms)
✖ safe runner: postflight error stops after the single attempted write, without retry (549.0385ms)
✖ safe runner: one-use stage capability and DB guards prevent duplicate/concurrent batch execution (858.7366ms)
✔ safe runner: persistent process lock prevents double execution and unsafe restart even on a fresh DB (519.4012ms)
✔ safe runner: REST transport has fixed destination, rejects arbitrary SQL, redirections, invalid credentials and never retries (5.0044ms)
✔ safe runner: normal CLI and credential form remain remote-locked and accept no arbitrary arguments (417.1415ms)
✔ safe runner: SQL splitter preserves quoted semicolons and complete trigger/CASE bodies (0.4171ms)
✔ safe runner: complete empty SQL export restores and is tied to a live simulated bookmark (1369.7181ms)
✖ safe runner: complete REST protocol simulation feeds real local D1 and uses exactly six one-shot write requests (498.531ms)
✖ safe runner: a stale read followed by an unexpected row cannot commit the next migration (767.8683ms)
✖ safe runner: corrupted seed grants and unexpected underscore objects fail closed (706.1285ms)
✔ safe runner: expired backups and stale preflights cannot authorize writes (699.1898ms)
✔ super_admin explicit audited self-approval; complete publish/withdraw; other roles retain separation (5685.6419ms)
✔ DEV Images authorization is durable, exact-input and single-use, including transform failures (1632.8124ms)
✔ identity requires real RS256/issuer/audience/subject/email and fresh token; no raw token retained (75.7807ms)
✖ single operator local D1: technical actor disabled, real recipient only super_admin, faithful audit and no self-grant (1545.2793ms)
✖ concurrent data changes and another bootstrap invalidate full-state SQL guard with atomic rollback (1412.2072ms)
✖ missing/fabricated receipts, changed fingerprint and incomplete snapshots are rejected before a batch (1385.4453ms)
✖ ambiguous response and late SQL failure consume plan without retry or partial grant (1176.2832ms)
✖ six original migrations remain SQLite-compatible and SQL CHECK still rejects a self-grant (0.9914ms)
✔ policy migration preserves media and child references; SQL allows only canonical enabled super_admin self approval (90.643ms)
✔ durable policy runner: success (206.8246ms)
✔ durable policy runner: concurrent (200.3996ms)
✔ durable policy runner: ambiguous (132.9613ms)
✔ durable policy runner: persistence (79.9409ms)
ℹ tests 325
ℹ suites 0
ℹ pass 266
ℹ fail 59
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 36847.961

✖ failing tests:

test at test\backup-stage-four.test.mjs:37:1
✖ stage4 backup: pinned reconciliation, exact fingerprint and disabled fresh ID validate locally (1.4056ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageFourPreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-four.mjs:16:2)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/backup-stage-four.test.mjs:38:10)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.start (node:internal/test_runner/test:1177:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17)

test at test\backup-stage-four.test.mjs:41:1
✖ stage4 backup: approved complete transition reproduces the actual reconciled fingerprint and restores exactly (2861.4994ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/backup-stage-four.test.mjs:24:39)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/backup-stage-four.test.mjs:42:10)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)

test at test\backup-stage-four.test.mjs:44:1
✖ stage4 backup: changed catalog state or ledger timestamp cannot silently establish a new fingerprint (1859.2451ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/backup-stage-four.test.mjs:24:39)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/backup-stage-four.test.mjs:45:50)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)

test at test\backup-stage-four.test.mjs:47:1
✖ stage4 backup: changing bookmarks or incomplete dump fail without automatic retry (1820.7227ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/backup-stage-four.test.mjs:24:39)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/backup-stage-four.test.mjs:48:49)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)

test at test\backup-stage-one.test.mjs:28:1
✖ stage one: fixed plan is new, disabled and validates original backup and approved 0001 evidence locally (1.446ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageOnePreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-one.mjs:27:2)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/backup-stage-one.test.mjs:30:15)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.start (node:internal/test_runner/test:1177:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17)

test at test\backup-stage-one.test.mjs:63:1
✖ stage one: CLI blocks before reading input or issuing network requests; graph contains no writer (102.0454ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/backup-stage-one.test.mjs:68:64)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: { code: 'ENOENT' },
    operator: 'throws',
    diff: 'simple'
  }

test at test\backup-stage-six-directed.test.mjs:19:1
✖ stage-six backup-only: simulated export, exact pinned baseline, encryption and isolated restoration; no remote writes (1022.9331ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/backup-stage-six-directed.test.mjs:20:44)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3)

test at test\backup-stage-three.test.mjs:24:1
✖ stage three: evidence pins validate locally, fresh ID stays disabled and no previous backup changes (1.5731ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageThreePreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-three.mjs:15:2)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/backup-stage-three.test.mjs:25:14)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.start (node:internal/test_runner/test:1177:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17)

test at test\backup-stage-three.test.mjs:46:1
✖ stage three: CLI and private UI remain locked and cannot be enabled with arguments or environment (142.8926ms)
  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:
  
    assert.ok(ui.includes('$plan.expectedStage -ne 4'))
  
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/backup-stage-three.test.mjs:49:87)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

test at test\bootstrap-durable.test.mjs:68:1
✖ durable bootstrap: fixed target, single request, verified independent oracle and durable closure (1772.658ms)
  Error: schema_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at Object.inspect (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/read.mjs:22:92)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/bootstrap-durable.test.mjs:30:171)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/bootstrap-durable.test.mjs:69:10)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3)

test at test\bootstrap-durable.test.mjs:77:1
✖ durable bootstrap: target mismatch, bookmark race and SQL concurrent change stop without retries (1792.9996ms)
  Error: schema_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at Object.inspect (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/read.mjs:22:92)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/bootstrap-durable.test.mjs:30:171)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/bootstrap-durable.test.mjs:78:91)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)

test at test\bootstrap-durable.test.mjs:83:1
✖ durable bootstrap: commit with ambiguous response, bad readback or checkpoint collision never claims PASS or retries (1559.1122ms)
  Error: schema_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at Object.inspect (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/read.mjs:22:92)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/bootstrap-durable.test.mjs:30:171)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/bootstrap-durable.test.mjs:84:95)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)

test at test\bootstrap-durable.test.mjs:92:1
✖ capabilities: remote gate and recovery evidence; no exports, arbitrary SQL, forged recovery or changed scope (5523.6ms)
  Error: schema_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at Object.inspect (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/read.mjs:22:92)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/bootstrap-durable.test.mjs:30:171)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/bootstrap-durable.test.mjs:105:10)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)

test at test\bootstrap-durable.test.mjs:115:1
✖ bootstrap ACK binds transport, environment, execution, stage, batch and source hash, and is consumed once (1032.9775ms)
  Error: schema_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at Object.inspect (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/read.mjs:22:92)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/bootstrap-durable.test.mjs:30:171)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/bootstrap-durable.test.mjs:116:10)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)

test at test\bootstrap-durable.test.mjs:126:1
✖ stage-six recovery profile validates real closure locally, does not call remote, rejects stage-four/fingerprint mismatch (577.7312ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageSixClosure (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-six.mjs:8:25)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/bootstrap-durable.test.mjs:127:14)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)

test at test\bootstrap-durable.test.mjs:137:1
✖ JWT expires or identity ages during request journal persistence: zero mutating fetches (976.742ms)
  Error: schema_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at Object.inspect (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/read.mjs:22:92)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/bootstrap-durable.test.mjs:30:171)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/bootstrap-durable.test.mjs:139:11)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)

test at test\completion-0005-0006.test.mjs:38:1
✖ 0005→0006: exclusive blocked scope, original migrations, projected generated values and durable stage-6 closure (3462.9182ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageFourPreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-four.mjs:16:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/completion-backup.mjs:14:25)
      at withCompletionSql (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/completion-backup.mjs:20:97)
      at loadCompletionBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/completion-backup.mjs:21:53)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/completion-0005-0006.test.mjs:19:53)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/completion-0005-0006.test.mjs:41:10)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3)

test at test\completion-0005-0006.test.mjs:48:1
✖ concurrent changes: SQL CAS, postwrite data/epoch, bookmark, transaction output and ACK binding fail closed (1866.9878ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageFourPreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-four.mjs:16:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/completion-backup.mjs:14:25)
      at withCompletionSql (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/completion-backup.mjs:20:97)
      at loadCompletionBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/completion-backup.mjs:21:53)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/completion-0005-0006.test.mjs:19:53)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/completion-0005-0006.test.mjs:49:129)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)

test at test\completion-0005-0006.test.mjs:57:1
✖ ambiguous response after a real local commit: no ACK, no retry, no 0006 and durable unknown outcome (1736.0357ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageFourPreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-four.mjs:16:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/completion-backup.mjs:14:25)
      at withCompletionSql (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/completion-backup.mjs:20:97)
      at loadCompletionBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/completion-backup.mjs:21:53)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/completion-0005-0006.test.mjs:19:53)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/completion-0005-0006.test.mjs:58:10)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)

test at test\completion-0005-0006.test.mjs:60:1
✖ persistence failure after checkpoint write: stop at 0005 or final 0006 and never claim stage-6 closure (1442.6308ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageFourPreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-four.mjs:16:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/completion-backup.mjs:14:25)
      at withCompletionSql (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/completion-backup.mjs:20:97)
      at loadCompletionBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/completion-backup.mjs:21:53)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/completion-0005-0006.test.mjs:19:53)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/completion-0005-0006.test.mjs:61:36)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)

test at test\config-storage.test.mjs:10:1
✖ versioned SQL matches reviewed checksums (3.7866ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  9 !== 6
  
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/config-storage.test.mjs:12:54)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.start (node:internal/test_runner/test:1177:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 9,
    expected: 6,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at test\migration-0001.test.mjs:25:1
✖ 0001 only: pinned encrypted backup restores locally without plaintext file; manifest/hash unchanged (2674.4159ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-0001.test.mjs:26:193)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3)

test at test\migration-0001.test.mjs:29:1
✖ verified baseline proposal: reviewed evidence plus fresh equal state permits one local 0001 without replacing historical backup (6649.3863ms)
  AssertionError [ERR_ASSERTION]: {"status":"stopped_before_write","migration":"0001_admin_catalog.sql","migrationSha256":"33bd2451b568acf1c316fcc5355bca1e1cd87deacace72d3819233a00e670abd","writeAttempted":false,"postflightVerified":false,"credentialDisposed":true,"errorCode":"validation_or_operation_failed_details_omitted","requests":[],"finishedAt":"2026-11-05T08:21:10.846Z"}
  + actual - expected
  
  + 'stopped_before_write'
  - 'completed_0001_only'
  
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-0001.test.mjs:32:10)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 'stopped_before_write',
    expected: 'completed_0001_only',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at test\migration-0001.test.mjs:35:1
✖ verified baseline proposal: concurrent bookmark change and absent durable evidence both prevent writing (4401.9449ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'validation_or_operation_failed_details_omitted'
  - 'live_baseline_concurrent_bookmark_change'
  
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-0001.test.mjs:36:429)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'validation_or_operation_failed_details_omitted',
    expected: 'live_baseline_concurrent_bookmark_change',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at test\migration-0001.test.mjs:38:1
✖ 0001 only: real local D1 batch applies exactly first migration, records one ledger row and no principals (1399.8516ms)
  AssertionError [ERR_ASSERTION]: {"status":"stopped_before_write","migration":"0001_admin_catalog.sql","migrationSha256":"33bd2451b568acf1c316fcc5355bca1e1cd87deacace72d3819233a00e670abd","writeAttempted":false,"postflightVerified":false,"credentialDisposed":true,"errorCode":"validation_or_operation_failed_details_omitted","requests":[],"finishedAt":"2026-11-05T08:21:16.654Z"}
  + actual - expected
  
  + 'stopped_before_write'
  - 'completed_0001_only'
  
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-0001.test.mjs:40:100)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 'stopped_before_write',
    expected: 'completed_0001_only',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at test\migration-0001.test.mjs:49:1
✖ 0001 only: batch failure rolls back locally and network ambiguity never retries (1289.6676ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'stopped_before_write'
  - 'stopped_outcome_requires_review'
             ^
  
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-0001.test.mjs:50:191)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'stopped_before_write',
    expected: 'stopped_outcome_requires_review',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at test\migration-batch.test.mjs:39:1
✖ batch: exact restored stage-one source progresses through only 0002-0006 with guarded real D1 batches (1581.5247ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageOnePreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-one.mjs:27:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/batch-backup-receipt.mjs:20:25)
      at loadBatchBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/batch-backup-receipt.mjs:29:31)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-batch.test.mjs:17:21)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-batch.test.mjs:40:16)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)

test at test\migration-batch.test.mjs:42:1
✖ batch: initial logical change, wrong identity or missing evidence prevents all writes (1006.2788ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageOnePreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-one.mjs:27:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/batch-backup-receipt.mjs:20:25)
      at loadBatchBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/batch-backup-receipt.mjs:29:31)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-batch.test.mjs:17:21)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-batch.test.mjs:43:69)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)

test at test\migration-batch.test.mjs:45:1
✖ batch: atomic full-data guard catches a ledger-only race after the final bookmark check (911.1255ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageOnePreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-one.mjs:27:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/batch-backup-receipt.mjs:20:25)
      at loadBatchBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/batch-backup-receipt.mjs:29:31)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-batch.test.mjs:17:21)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-batch.test.mjs:46:16)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)

test at test\migration-batch.test.mjs:48:1
✖ batch: SQL failure at each stage rolls back and stops before the next stage, no retries (1019.5193ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageOnePreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-one.mjs:27:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/batch-backup-receipt.mjs:20:25)
      at loadBatchBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/batch-backup-receipt.mjs:29:31)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-batch.test.mjs:17:21)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-batch.test.mjs:49:53)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)

test at test\migration-batch.test.mjs:51:1
✖ batch: ambiguous network outcome or failed postflight checkpoint never starts the next stage (994.9519ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageOnePreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-one.mjs:27:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/batch-backup-receipt.mjs:20:25)
      at loadBatchBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/batch-backup-receipt.mjs:29:31)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-batch.test.mjs:17:21)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-batch.test.mjs:52:120)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)

test at test\migration-batch.test.mjs:57:1
✖ batch: changed bookmark before writing or between stages stops without renewing that baseline silently (852.9641ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageOnePreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-one.mjs:27:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/batch-backup-receipt.mjs:20:25)
      at loadBatchBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/batch-backup-receipt.mjs:29:31)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-batch.test.mjs:17:21)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-batch.test.mjs:58:81)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)

test at test\migration-batch.test.mjs:60:1
✖ batch: postflight rejects modified timestamps in earlier migration history (779.8612ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageOnePreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-one.mjs:27:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/batch-backup-receipt.mjs:20:25)
      at loadBatchBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/batch-backup-receipt.mjs:29:31)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-batch.test.mjs:17:21)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-batch.test.mjs:61:16)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)

test at test\migration-final.test.mjs:39:1
✖ final batch: restored stage-three snapshot progresses only 0004-0006 with observations and postflight checkpoints (1102.5144ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageThreePreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-three.mjs:15:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/final-backup-receipt.mjs:14:25)
      at loadFinalBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/final-backup-receipt.mjs:21:48)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-final.test.mjs:17:21)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-final.test.mjs:40:16)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)

test at test\migration-final.test.mjs:42:1
✖ final batch: logical mismatch, wrong target or missing durable evidence prevent all writes (1467.36ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageThreePreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-three.mjs:15:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/final-backup-receipt.mjs:14:25)
      at loadFinalBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/final-backup-receipt.mjs:21:48)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-final.test.mjs:17:21)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-final.test.mjs:43:67)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)

test at test\migration-final.test.mjs:45:1
✖ final batch: SQL failure at each of the three steps rolls back and never retries or advances (966.4433ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageThreePreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-three.mjs:15:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/final-backup-receipt.mjs:14:25)
      at loadFinalBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/final-backup-receipt.mjs:21:48)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-final.test.mjs:17:21)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-final.test.mjs:46:53)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)

test at test\migration-final.test.mjs:48:1
✖ final batch: bookmark or data race, ambiguous response, or failed checkpoint stops immediately (861.7467ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageThreePreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-three.mjs:15:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/final-backup-receipt.mjs:14:25)
      at loadFinalBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/final-backup-receipt.mjs:21:48)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-final.test.mjs:17:21)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/migration-final.test.mjs:49:170)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)

test at test\owned-write-checkpoint.test.mjs:39:1
✖ owned checkpoint prototype: genuine local own-write ack and exact expected state establish a fresh stable checkpoint (1808.4579ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageThreePreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-three.mjs:15:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/final-backup-receipt.mjs:14:25)
      at loadFinalBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/final-backup-receipt.mjs:21:48)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/owned-write-checkpoint.test.mjs:20:21)
      at writtenFixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/owned-write-checkpoint.test.mjs:38:47)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/owned-write-checkpoint.test.mjs:40:16)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)

test at test\owned-write-checkpoint.test.mjs:42:1
✖ owned checkpoint prototype: forged acknowledgement, logical difference and unavailable evidence cannot establish checkpoints (1330.403ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageThreePreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-three.mjs:15:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/final-backup-receipt.mjs:14:25)
      at loadFinalBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/final-backup-receipt.mjs:21:48)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/owned-write-checkpoint.test.mjs:20:21)
      at writtenFixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/owned-write-checkpoint.test.mjs:38:47)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/owned-write-checkpoint.test.mjs:43:67)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)

test at test\owned-write-checkpoint.test.mjs:45:1
✖ owned checkpoint prototype: bookmark change after boundary remains terminal, never renewed or retried (883.2196ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at verifyStageThreePreparation (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/backup-stage-three.mjs:15:2)
      at files (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/final-backup-receipt.mjs:14:25)
      at loadFinalBackup (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/final-backup-receipt.mjs:21:48)
      at fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/owned-write-checkpoint.test.mjs:20:21)
      at writtenFixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/owned-write-checkpoint.test.mjs:38:47)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/owned-write-checkpoint.test.mjs:46:16)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)

test at test\reconcile-stage-four.test.mjs:40:1
✖ stage4 reconciliation: exact replay from backup confirms full schema, history, data and fingerprints (1049.8722ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at stageFourWriteEvidence (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/stage-four-expectation.mjs:14:2)
      at file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/reconcile-stage-four.test.mjs:18:360
      at async run (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/reconcile-stage-four.test.mjs:24:27)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/reconcile-stage-four.test.mjs:41:32)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3)

test at test\reconcile-stage-four.test.mjs:43:1
✖ stage4 reconciliation: logical differences and wrong identity stop, not hidden by a newly captured fingerprint (0.3311ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at stageFourWriteEvidence (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/stage-four-expectation.mjs:14:2)
      at file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/reconcile-stage-four.test.mjs:18:360
      at async run (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/reconcile-stage-four.test.mjs:24:27)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/reconcile-stage-four.test.mjs:41:32)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3)

test at test\reconcile-stage-four.test.mjs:46:1
✖ stage4 reconciliation: moving bookmarks are evidence, not permission to write or a stable checkpoint (0.1892ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at stageFourWriteEvidence (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/stage-four-expectation.mjs:14:2)
      at file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/reconcile-stage-four.test.mjs:18:360
      at async run (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/reconcile-stage-four.test.mjs:24:27)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/reconcile-stage-four.test.mjs:41:32)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3)

test at test\reconcile-stage-four.test.mjs:49:1
✖ stage4 reconciliation: invalid fourth migration timestamp or evidence failure blocks confirmation (0.1835ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at stageFourWriteEvidence (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/stage-four-expectation.mjs:14:2)
      at file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/reconcile-stage-four.test.mjs:18:360
      at async run (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/reconcile-stage-four.test.mjs:24:27)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/reconcile-stage-four.test.mjs:41:32)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3)

test at test\safe-migration-runner.test.mjs:30:1
✖ safe runner: pinned six-file allowlist and hashes reject alteration, reordering, extra SQL and modified manifest entries (2.3405ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/safe-migration-runner.test.mjs:31:14)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.start (node:internal/test_runner/test:1177:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17)

test at test\safe-migration-runner.test.mjs:37:1
✖ safe runner: full six-stage first install uses actual workerd transactional D1 with postflight after each stage (1045.3545ms)
  AssertionError [ERR_ASSERTION]: {"operationId":"891e8ed6-453c-4b93-8998-bab86e41f5f8","target":{"account":"7a8bcd7992a3de359d2aff87df2fb693","id":"c5cfbe44-4fd0-4c2a-83c1-b833935534ba","name":"kuwago-admin-db-development"},"planHash":"0bebf1d252c399103d9313b16bf55f89eeb4010cf5412b1e83c002c6788f7d14","startedAt":1793866864815,"status":"blocked_or_outcome_unknown","stages":[],"attemptedStage":null,"releaseRemoteEnabled":false,"credentialDisposed":true,"finishedAt":1793866864816}
  + actual - expected
  
  + 'blocked_or_outcome_unknown'
  - 'completed'
  
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/safe-migration-runner.test.mjs:38:163)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 'blocked_or_outcome_unknown',
    expected: 'completed',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at test\safe-migration-runner.test.mjs:49:1
✖ safe runner: unexpected schema and pre-existing partial installations cannot start or resume (1604.4001ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  0 !== 2
  
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/safe-migration-runner.test.mjs:51:61)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 2,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at test\safe-migration-runner.test.mjs:63:1
✖ safe runner: corrupt migration history halts the next stage (562.7431ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  0 !== 1
  
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/safe-migration-runner.test.mjs:65:65)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at test\safe-migration-runner.test.mjs:67:1
✖ safe runner: failure within a migration rolls back its SQL and ledger and stops the entire operation (587.5906ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  0 !== 1
  
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/safe-migration-runner.test.mjs:68:149)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at test\safe-migration-runner.test.mjs:70:1
✖ safe runner: postflight error stops after the single attempted write, without retry (549.0385ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  0 !== 1
  
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/safe-migration-runner.test.mjs:71:204)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at test\safe-migration-runner.test.mjs:74:1
✖ safe runner: one-use stage capability and DB guards prevent duplicate/concurrent batch execution (858.7366ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  0 !== 1
  
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/safe-migration-runner.test.mjs:76:106)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at test\safe-migration-runner.test.mjs:98:1
✖ safe runner: complete REST protocol simulation feeds real local D1 and uses exactly six one-shot write requests (498.531ms)
  AssertionError [ERR_ASSERTION]: {"operationId":"a266f023-ced4-4e72-b00f-1511d241c3f9","target":{"account":"7a8bcd7992a3de359d2aff87df2fb693","id":"c5cfbe44-4fd0-4c2a-83c1-b833935534ba","name":"kuwago-admin-db-development"},"planHash":"0bebf1d252c399103d9313b16bf55f89eeb4010cf5412b1e83c002c6788f7d14","startedAt":1793866878779,"status":"blocked_or_outcome_unknown","stages":[],"attemptedStage":null,"releaseRemoteEnabled":false,"credentialDisposed":true,"finishedAt":1793866878779}
  + actual - expected
  
  + 'blocked_or_outcome_unknown'
  - 'completed'
  
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/safe-migration-runner.test.mjs:111:103)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 'blocked_or_outcome_unknown',
    expected: 'completed',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at test\safe-migration-runner.test.mjs:113:1
✖ safe runner: a stale read followed by an unexpected row cannot commit the next migration (767.8683ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at Object.apply (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/write.mjs:20:17)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/safe-migration-runner.test.mjs:114:202)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)

test at test\safe-migration-runner.test.mjs:119:1
✖ safe runner: corrupted seed grants and unexpected underscore objects fail closed (706.1285ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at Object.apply (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/write.mjs:20:17)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/safe-migration-runner.test.mjs:120:202)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)

test at test\single-operator-bootstrap.test.mjs:36:1
✖ single operator local D1: technical actor disabled, real recipient only super_admin, faithful audit and no self-grant (1545.2793ms)
  Error: schema_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at Object.inspect (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/read.mjs:22:92)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/single-operator-bootstrap.test.mjs:26:18)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/single-operator-bootstrap.test.mjs:37:10)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)

test at test\single-operator-bootstrap.test.mjs:47:1
✖ concurrent data changes and another bootstrap invalidate full-state SQL guard with atomic rollback (1412.2072ms)
  Error: schema_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at Object.inspect (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/read.mjs:22:92)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/single-operator-bootstrap.test.mjs:26:18)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/single-operator-bootstrap.test.mjs:49:11)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)

test at test\single-operator-bootstrap.test.mjs:58:1
✖ missing/fabricated receipts, changed fingerprint and incomplete snapshots are rejected before a batch (1385.4453ms)
  Error: schema_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at Object.inspect (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/read.mjs:22:92)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/single-operator-bootstrap.test.mjs:26:18)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/single-operator-bootstrap.test.mjs:59:10)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)

test at test\single-operator-bootstrap.test.mjs:65:1
✖ ambiguous response and late SQL failure consume plan without retry or partial grant (1176.2832ms)
  Error: schema_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at Object.inspect (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/read.mjs:22:92)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async fixture (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/single-operator-bootstrap.test.mjs:26:18)
      at async TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/single-operator-bootstrap.test.mjs:67:11)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)

test at test\single-operator-bootstrap.test.mjs:76:1
✖ six original migrations remain SQLite-compatible and SQL CHECK still rejects a self-grant (0.9914ms)
  Error: migration_list_mismatch
      at requireSafe (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:31:65)
      at approvedSources (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/scripts/safe-d1/policy.mjs:45:2)
      at TestContext.<anonymous> (file:///C:/Users/JV/Desktop/Kuwago%20Landing/grupo-kuwago-landing-source/infra/cloudflare/dev/test/single-operator-bootstrap.test.mjs:78:54)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7)
```

</details>

<details>
<summary><code>node --test --test-force-exit infra/cloudflare/dev/test/properties-api.test.mjs</code></summary>

```text
▶ properties: seed, contracts, authorization, snapshots, privacy and mutation guards
  ✔ 0009 hashes intact, exact existing texts and NULL unknown fields (47.8831ms)
  ✔ public contract excludes private fields and input rejects unsafe Airbnb/numbers/unknown metadata (389.3139ms)
  ✔ auth, origin, feature switch and version enforced before mutation (120.3516ms)
  ✔ edit published working data, snapshot immutable until publish, editor forbidden/admin allowed (189.8291ms)
  ✔ working visibility waits for publish, unpublish/archive withdraw and slug remains locked (371.5545ms)
  ✔ create draft, pagination, duplicate slug and current DB permission guard (198.6843ms)
  ✔ public boundary rejects corrupt/private snapshots, method/query and absent binding (13.3567ms)
✔ properties: seed, contracts, authorization, snapshots, privacy and mutation guards (2011.3165ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2370.6657
```

</details>

<details>
<summary><code>npm run build</code></summary>

```text
> grupo-kuwago-landing@0.1.0 prebuild
> npm run contracts:build


> grupo-kuwago-landing@0.1.0 contracts:build
> node scripts/contracts-build.mjs

Contracts built; public runtime prepared.

> grupo-kuwago-landing@0.1.0 build
> npm run css && node scripts/build.mjs


> grupo-kuwago-landing@0.1.0 css
> tailwindcss -i styles/tailwind.input.css -o assets/css/tailwind.css --minify

Browserslist: caniuse-lite is outdated. Please run:
  npx update-browserslist-db@latest
  Why you should do it regularly: https://github.com/browserslist/update-db#readme

Rebuilding...

Done in 249ms.
Production files created in dist/.
```

</details>

<details>
<summary><code>npm run check</code></summary>

```text
> grupo-kuwago-landing@0.1.0 precheck
> npm run contracts:build


> grupo-kuwago-landing@0.1.0 contracts:build
> node scripts/contracts-build.mjs

Contracts built; public runtime prepared.

> grupo-kuwago-landing@0.1.0 check
> node scripts/check.mjs

Static project checks passed.
All contact destinations are correctly configured.
```

</details>

<details>
<summary><code>npm run test:catalog</code></summary>

```text
> grupo-kuwago-landing@0.1.0 pretest:catalog
> npm run contracts:build


> grupo-kuwago-landing@0.1.0 contracts:build
> node scripts/contracts-build.mjs

Contracts built; public runtime prepared.

> grupo-kuwago-landing@0.1.0 test:catalog
> node --test scripts/test-catalog.mjs

✔ static adapter preserves IDs, translations, images, durations and ambiguous reference amounts (2.5691ms)
✔ empty catalog and categories without results are valid states (0.9399ms)
✔ load errors, aborted loads, invalid JSON shapes and wrong sources never fall back to reference services (0.4528ms)
✔ cart tracks removed services, new revisions, removed options and temporarily unknown availability (0.3633ms)
✔ public catalog runtime rejects mismatched sources and identity corruption (0.6174ms)
✔ public UI preserves selection, category filters, modal editing, removal and ES/EN (1124.1844ms)
✔ service with multiple options draws radios, updates dialog meta, preserves chosen option in cart, and shows From/Desde lowest price on card (44.7424ms)
✔ discount contract: optional, 1-90 %, real calendar dates, end not before start, never on reference prices (0.8371ms)
✔ discount validity uses the Costa Rica calendar day (UTC-6) and rounds minor units (0.262ms)
✔ marketplace shows -15 %, crossed regular price and USD 76.50 for a USD 90 option, and no discount on quotes (21.3711ms)
✔ cart totals: price x travelers per person, x1 per service, discount, from, quote, mixed and reference (0.369ms)
✔ cart summary shows subtotal, total + taxes, line amount and keeps pending for quotes and Stitch reference (23.8194ms)
ℹ tests 12
ℹ suites 0
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1296.5007
```

</details>

<details>
<summary><code>npm run lint:catalog</code></summary>

```text
> grupo-kuwago-landing@0.1.0 lint:catalog
> node apps/admin/node_modules/eslint/bin/eslint.js assets/js/catalog-adapter.js assets/js/catalog-static.js assets/js/marketplace.js assets/js/marketplace-data.js --config scripts/eslint.catalog.config.mjs --max-warnings 0
```

</details>

<details>
<summary><code>npm run test:properties</code></summary>

```text
> grupo-kuwago-landing@0.1.0 test:properties
> npm run contracts:build && node --test scripts/test-properties.mjs


> grupo-kuwago-landing@0.1.0 contracts:build
> node scripts/contracts-build.mjs

Contracts built; public runtime prepared.
✔ landing keeps exact four static cards and content on offline, HTTP, JSON or contract failure (156.573ms)
✔ valid snapshot reorders/hides only existing cards, preserves gallery nodes and uses safe bilingual text (27.5266ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1198.0157
```

</details>

<details>
<summary><code>node scripts/test-properties-e2e.mjs (KUWAGO_PLAYWRIGHT_MODULE apunta al runtime instalado)</code></summary>

```text
{
  "checks": [
    "Admin 390 px: guardar y publicar orden de Villa Maya primero con JWT y D1 locales",
    "Lista y editor: ES/EN y claro/oscuro a 390 px sin desbordamiento horizontal",
    "Landing real: Villa Maya primera tras publicar, usando API local y CORS",
    "show_on_landing=0 publicado oculta la tarjeta",
    "API caída: reaparecen las cuatro tarjetas estáticas en el orden original"
  ],
  "consoleErrors": [],
  "localOnly": true
}
```

</details>

## Resultado de la revisión
<!-- La herramienta revisora pega aquí su veredicto: OK / Cambios requeridos + lista. -->
