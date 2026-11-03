# Kuwago — Fase 1C: contratos y adaptador del catálogo

Revisión local: 23 de octubre de 2026. Sin infraestructura, autenticación,
persistencia, publicación real, commit, push ni deploy.

## Auditoría de las fuentes

| Aspecto | Admin 1B | Marketplace previo | Resolución 1C |
|---|---|---|---|
| Origen | Tres servicios ficticios `demo-*` | Yoga y chef transcritos de Stitch; `confirmed:false` | `demo`, `stitch_reference`, `verified`; no hay oferta real confirmada |
| Identidad | IDs locales y slugs editables | IDs `yoga`, `chef`; sin revisiones | IDs conservados; revisiones/opciones explícitas; slug pertenece a la revisión |
| Categorías | wellness, dining, adventure de ejemplo | wellness, dining, water, land, nature; últimas tres vacías | Entidad Category con ES/EN; no se fusiona adventure con land sin aprobación |
| Idiomas | Nombres y descripciones ES/EN separados | ES/EN dentro del mismo registro | Traducciones tipadas y exigidas para la proyección pública |
| Precios | Cadenas de formulario, importes demo, USD/CRC/EUR | $120 y $350 de referencia; sin moneda declarada | Dinero entero en unidades menores + moneda explícita; referencia conserva `$` y moneda null |
| Cotización | Modo quote | No modelado explícitamente | Quote sin importe; moneda conocida o null |
| Unidad | persona/grupo/servicio | persona/cena | Unión explícita incluye dinner; Admin conserva su subconjunto actual |
| Duración/modalidad | Texto de minutos, privada/compartida, dentro/fuera | 90/180 minutos; etiqueta común privado/en villa | Opciones tipadas; etiquetas de Stitch siguen siendo referencia, no confirmación comercial |
| Multimedia | Imágenes locales/blob, orden y alt ES/EN; Carabao referencial | Dos JPG locales asociados al export | Recursos identificados; aprobación de uso y procedencia administrativas; URLs/alt/orden públicos |
| Estados | Etiquetas demo draft/published/archived | Sin estados/retiros | Estado del servicio + punteros a revisión de trabajo y publicada |
| Revisiones | Sin historial real | Sin historial | Contratos de revisiones; no se crea un historial ficticio ni se persiste ninguno |
| Carrito | No conectado al público | Array en memoria con ID, fecha, viajeros | Añade revisionId y optionId; detecta retiro/cambio; no hay totales ni reservas |

Ningún precio, proveedor, moneda de referencia ni disponibilidad se confirmó como
real durante esta fase. Los importes comerciales no se obtienen del símbolo `$`.

## Estructura y archivos

```text
packages/contracts/
  package.json, package-lock.json, tsconfig.json
  src/models.ts             # Entidades y tipos públicos/administrativos
  src/validation-core.ts    # Schema<T>, parse/safeParse, issues con ruta/código
  src/public.ts             # Validadores y exports del límite público
  src/admin.ts              # Revisiones, aprobación, readiness y proyección
  src/index.ts              # Entrada completa para Admin/futuro backend
  test/contracts.test.mjs
  dist/                     # Generado: ESM + .d.ts; ignorado por Git
assets/js/
  catalog-static.js         # Única fuente estática de referencia
  catalog-adapter.js        # Adaptador, carga validada, estado del carrito, view model
  contracts/                # Generado: solo public.js, models.js, validation-core.js
scripts/
  contracts-build.mjs
  test-catalog.mjs
  eslint.catalog.config.mjs
apps/admin/src/features/services/contract-adapter.ts
apps/admin/src/test/Contracts.test.ts
```

Archivos existentes modificados:
- Raíz: `.gitignore`, `package.json`, `concierge-marketplace.html`.
- Público: `assets/js/marketplace.js`, `assets/js/marketplace-data.js`.
- Build: `scripts/build.mjs`, `scripts/asset-versioning.mjs`, `scripts/test-asset-versioning.mjs`, `scripts/serve.mjs`.
- Admin: `package.json`, `package-lock.json`, `README.md`,
  `src/features/services/model.ts`, `src/features/services/validation.ts`,
  `src/features/services/components/ServiceEditor.tsx`, `scripts/verify-isolation.mjs`.
- Documentación nueva: este informe y `packages/contracts/README.md`.

`index.html`, estilos aprobados, originales de Stitch, DNS, Hostinger, manifest y
service worker no se modificaron. El cambio HTML del marketplace únicamente marca
su controlador como módulo JavaScript. La landing conserva su salida independiente.

## Contratos y validaciones

Implementados: Service, ServiceRevision, ServiceTranslation, Category,
ServiceOption, ServicePrice, MediaAsset, PublicCatalogService, AdminService y
PublicationStatus. También PublicCatalog v1, CatalogAdapter, HttpCatalogAdapter,
CatalogLoadState y CatalogCartItem.

Los esquemas exponen `parse(unknown)` y `safeParse(unknown)`; no requieren una
biblioteca de runtime. TypeScript estricto comprueba la implementación. Se rechazan
claves desconocidas, estados inválidos, IDs duplicados, referencias colgantes,
revisiones de otro servicio, fechas inválidas, importes no enteros/negativos o no
seguros, monedas no soportadas y categorías inexistentes en el catálogo público.

- Importes fijos/desde: `amountMinor` entero seguro, moneda USD/CRC/EUR explícita y
  unidad de cobro. Estas tres monedas usan dos decimales. No se redondean cadenas
  del formulario mediante aritmética de coma flotante.
- Quote: no admite amountMinor. Currency puede ser null; no se asigna USD por defecto.
- ReferencePrice: importe textual existente + `$`, currency null. No es ServicePrice.
  Solo se permite en el catálogo de referencia; una respuesta source=api lo rechaza.
- Borradores: pueden tener textos vacíos, categoría/precio/duración pendientes e
  imágenes sin alt completo. La forma estructural y los tipos siguen validados.
- Publicación: traducciones y nombres de opciones ES/EN completos, slug válido,
  categoría activa, opciones/precios válidos, duración/modalidad, imágenes con alt
  ES/EN y aprobación de uso, procedencia verificada y aprobación comercial de ESA revisión.
- URLs públicas: HTTPS absoluto o rutas locales seguras, sin credenciales, consultas,
  fragmentos ni traversal. Blob solo se admite en multimedia demo administrativa.

La whitelist de monedas y los límites heredados del editor (1440 minutos, ocho
imágenes) no sustituyen la aprobación comercial del modelo. El contrato permite
importe cero; el editor demo mantiene su regla previa de importe positivo.

## Publicación y revisiones

Service identifica la entidad estable. Su workingRevisionId puede apuntar a una
revisión nueva incompleta mientras publishedRevisionId sigue señalando la anterior.
Nombre, descripción, slug, categoría, opciones, precios e imágenes pertenecen a la
revisión. `projectPublicCatalog` utiliza exclusivamente el puntero publicado.

Draft y Archived no entran en la proyección pública. Tampoco los ejemplos demo ni
Stitch. Una revisión publicada verificada inválida produce error; no se reemplaza
por un ejemplo. La proyección construye explícitamente los campos públicos y no
incluye internalNotes, aprobación comercial, revisión de trabajo ni metadatos de uso.

`validateForPublication` es solo readiness: no autoriza, publica, guarda ni cambia
estados. Los esquemas tampoco prueban que una aprobación provenga de una persona
permitida. Esa comprobación corresponderá al backend autenticado. La futura base
necesitará revisiones inmutables y cambio transaccional del puntero publicado; no se
debe editar una revisión ya publicada ni reutilizar su aprobación para contenido nuevo.

## Adaptadores y compatibilidad

`createStaticCatalogAdapter()` devuelve una copia de las dos referencias existentes.
`loadCatalog(adapter, expectedSource, options)` valida toda la respuesta y devuelve
ready, empty o error; la UI muestra loading mientras espera. No hay fetch, URL de
API, credenciales ni conmutación automática a otra fuente.

HttpCatalogAdapter define la futura interfaz `kind:http`, `responseSource:api` y
`load({signal?}):Promise<unknown>`. Su implementación HTTP queda pendiente. Se deberá
pasar explícitamente expectedSource=api y validar la respuesta con PublicCatalogSchema.
Si falla una API futura, no se mostrarán servicios demo o Stitch como sustitución.

El renderizado usa view models a través de `toMarketplaceCard`; la fuente estática
ya no está incrustada en el controlador. Categorías sin servicios siguen filtrables.
Carga/error/vacío no afirman reservas ni disponibilidad comercial confirmada.

El carrito conserva IDs previos y selección local. Añade revisión/opción para señalar:
available, withdrawn, changed, invalid o unverified. Una selección retirada conserva
su fila para que el usuario pueda eliminarla; una revisión/opción modificada requiere
revisión explícita. Una falla de carga no se presenta como retiro confirmado. Antes
de añadir se verifica nuevamente la selección. Sin persistencia ni totales monetarios.
No había carritos persistidos que migrar: recargar siempre vacía la selección.

El Admin reutiliza estados, modos de precio y monedas del paquete. Su formulario
sigue usando cadenas y campos incompletos. `demoToAdminContract` crea un snapshot
administrativo demo de revisión r1, con aprobaciones pendientes. Se valida al aplicar
la demo, pero no se almacena un contrato ni se inventa historial. La lista conserva
la misma experiencia temporal. No importa automáticamente servicios públicos ni
reconcilia categorías comerciales que todavía no se han definido.

## Build y arranque reproducible

Desde la raíz, instalar cada paquete independiente:

```powershell
npm ci
npm --prefix packages/contracts ci
npm --prefix apps/admin ci
npm run check
npm run build
npm --prefix apps/admin run build
npm --prefix apps/admin run verify:isolation
```

La landing genera el runtime público mediante contracts:build antes de dev/check/build.
El Admin compila contratos antes de dev/typecheck/test; su build ejecuta typecheck.
No se incorporaron workspaces ni carpetas de infraestructura vacías. `packages/contracts`
solo añade TypeScript como herramienta de desarrollo; el runtime no tiene dependencias.
El lint del paquete y del catálogo reutiliza ESLint ya instalado en el Admin.

La salida ESM y las declaraciones están en packages/contracts/dist; el Admin consume
`@kuwago/contracts` mediante dependencia file local. Solo tres archivos JS permitidos
llegan a assets/js/contracts y al build público: no hay modelos administrativos de
runtime, pruebas, fuentes TS ni notas internas. El verificador comprueba ese límite.

El servidor local admite PREVIEW_ROOT para revisar dist desde la raíz, evitando que Windows bloquee su eliminación al reconstruir. Sigue escuchando solo en 127.0.0.1 y no cambia la configuración de producción.

Se extendió el versionado de assets al grafo de imports estáticos: cambiar el catálogo
o un validador cambia la versión de la entrada HTML y de sus imports en dist. Esto
conserva la recepción de actualizaciones sin cambiar cachés o configuración de hosting.

## Verificaciones de cierre

- 12 pruebas de contratos: esquema, traducciones, moneda/cotización, revisión visible,
  aprobación, estados/retiros, privacidad, imágenes e integridad de referencias.
- 6 pruebas de catálogo: regresión de contenido, vacío, fallas/respuestas inválidas,
  carrito retirado/cambiado y recorrido DOM real del controlador ES/EN.
- 18 pruebas del Admin: 15 existentes + 3 del límite compartido.
- 24 PWA, 4 loader y 3 versionado de assets (incluye invalidación transitiva de módulos).
- TypeScript del paquete/Admin, lint de contratos/Admin/catálogo, check, ambos builds
  y aislamiento correctos. Las pruebas DOM reutilizan jsdom del Admin.
- Navegador del build público, escritorio y 390px: opciones, carrito, categoría vacía,
  idioma y ambos temas en el recorrido; sin errores de consola ni desbordamiento móvil.
  Admin: aplicar borrador temporal a través del nuevo límite; sin errores de consola.
- Evidencia local en release/contracts-review. No es una prueba en producción.

## Decisiones pendientes antes de infraestructura

1. Confirmar catálogo real, IDs/categorías, traducciones, proveedores y derechos de imágenes.
2. Confirmar moneda de las referencias, precios finales, unidades, impuestos, cotizaciones,
   gratuidad, opciones, duraciones máximas, disponibilidad y reglas de cancelación.
3. Definir roles, quién aprueba comercialmente, segregación de permisos y auditoría.
4. Acordar control de concurrencia (version/ETag), revisión inmutable, publicación,
   despublicación/archivo y política de redirección ante cambios de slug.
5. Diseñar endpoints Workers versionados y validación servidor con errores por campo;
   comprobar Access/JWT y permisos para CADA operación, no solo para abrir la interfaz.
6. Diseñar migraciones D1 con FK/unique para servicios, revisiones, traducciones,
   categorías, opciones e imágenes; aprobación y cambio de puntero en transacción.
7. Definir upload a R2, claves/URLs realmente públicas, aprobación de uso y límites;
   conservar los objetos privados fuera de la proyección y del bucket público.
8. Implementar adaptador HTTP, límites de respuesta, aborto/timeout, errores, paginación
   y estrategia de actualización; probar contra contratos sin fallback silencioso.
9. Aprobar revisión y pruebas de integración/autorización antes de cualquier despliegue.

La infraestructura Cloudflare no se inicia en esta fase. Se requiere revisión de esta
entrega antes de comenzar Workers, D1, R2 o autenticación.

