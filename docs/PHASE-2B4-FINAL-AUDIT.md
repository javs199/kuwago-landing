# Fase 2B.4 — Auditoría final y cierre local

Fecha: 23/10/2026, America/Costa_Rica.

**Dictamen:** aprobado para revisión y uso DEV local. Existen bloqueantes de
operación remota; este cierre no autoriza desplegar ni avanzar a otra fase.

## Git e integridad de la entrega

Se inspeccionaron git status --short, git diff, los archivos no versionados de la
entrega, PHASE-2B4-CATALOG-API.md, migraciones, contratos, autenticación, configs,
scripts y pruebas. No se descartaron cambios.

La entrega anterior contiene **31 archivos, no 30**: 14 preexistentes modificados
y 17 nuevos, enumerados al final. Git muestra nueve tracked con diff y agrupa
directorios untracked; esas cifras no equivalen al alcance de esta fase. Los diffs
del marketplace/build raíz son trabajo previo conservado.

Inventario SHA-256 anterior a la implementación: 465 archivos, 451 intactos,
14 modificaciones esperadas, ninguno perdido. SQL 0001–0003, contratos, fuentes
Admin, landing/PWA, locks y candidato remoto conservan sus hashes. Esto acredita
conservación, no autoría/aprobación de todo el trabajo acumulado sin commit.

Cambios exclusivos de esta auditoría:
- Nuevo test/catalog-audit.test.mjs dentro de infra/cloudflare/dev.
- Ampliación de infra/cloudflare/dev/test/catalog-api.test.mjs.
- Este informe y enlace desde el informe anterior.

No se cambió código de negocio, SQL, dependencias ni configuración. Los builds
regeneraron artefactos locales/ignorados y CSS determinista.

## Hallazgos clasificados

Aprobado: comprobado en local. Pendiente: no impide el cierre local. Bloqueante:
impide el despliegue/operación indicados aunque pasen las pruebas locales.

| ID | Estado | Evidencia y conclusión | Acción requerida |
|---|---|---|---|
| A01 | Aprobado | Git conservado y hashes contrastados; alcance anterior corregido a 31 archivos. | Sin descarte de trabajo. |
| A02 | Aprobado | Cadena 0001–0004 desde cero en workerd y Wrangler --local sobre un directorio nuevo; checksum correcto. | Sin cambio de SQL aprobado. |
| A03 | Aprobado | Upgrade con revisión publicada y borrador, categorías ES/EN, opciones, precios por cotización, metadata multimedia, aprobación, auditoría y comandos/outbox generaciones 7 y 19. Comparación exacta de todas las filas/columnas anteriores. | Sin pérdida; catalog_state inicializa a 19. |
| A04 | Aprobado | foreign_key_check vacío, referencia inexistente rechazada y triggers de sellado conservados. Fallo después de reconstruir tablas revierte schema y todas las filas. | Sin tablas scratch ni migración parcial. |
| A05 | Aprobado | Estado/puntero, comando/outbox y auditoría de negocio en un batch D1 con guardas SQL; fallo de auditoría revierte todo. | La transacción cubre D1, no D1+R2. |
| A06 | Aprobado | If-Match y versiones de entidad/global: escritores/publicaciones concurrentes producen un éxito y un 409. Editar crea revisión, preservando la publicada. | Cliente debe releer y reconciliar conflictos. |
| A07 | Aprobado | JWT RS256, issuer/audience/tiempo/sub y JWKS; identidad issuer+sub y RBAC servidor/D1. Sin roles del cliente ni bypass. | Config local vacía falla cerrada. |
| A08 | Aprobado | Matriz adicional de 19 rutas/114 solicitudes: anónimo y JWT inválido 401, deshabilitado 403, Editor sin aprobación/publicación/auditoría/sync 403; Admin/Super pasan autorización y mantienen validación de entrada. | No equivale a cobertura exhaustiva por líneas. |
| A09 | Aprobado | Aprobación independiente por revisión/hash/categoría; ES/EN, dinero, imágenes y estados inválidos rechazados. SQL parametrizado y campos de entrada acotados. | Solo fixtures sintéticos. |
| A10 | Aprobado | Público sirve DTO validado desde PUBLICATION; sin notas, borradores, claves privadas o datos administrativos. Ausente/corrupto: 503, sin fallback demo. | No certifica ofertas comerciales reales. |
| A11 | Aprobado | Workers reales separados en workerd; público sin D1, PRIVATE_MEDIA, secretos Access ni service binding al Admin. Bundle/config comprobados. | Handler solo lee; el binding R2 no es una ACL nativa de solo lectura. |
| A12 | Aprobado | Existe reconciliación manual idempotente POST /api/v1/catalog/sync, Admin/Super con JWT y controles de origen/header JSON; ETag condicional y generación monotónica. | Tres reintentos por llamada; no es un proceso automático. |
| A13 | Aprobado | Retirada con R2 fallando: 202 pending, D1 draft/puntero nulo, copia pública anterior temporal; sync posterior retira y detalle pasa a 404. Repetir sync no reescribe R2 ni duplica comandos/evento de retirada. | Auditoría de seguridad registra cada solicitud por separado. |
| A14 | Aprobado | Backend y Admin npm audit: cero avisos; sin dependencias/locks nuevos. Escaneo acotado sin claves privadas, JWT literales o asignaciones reconocibles de credenciales. | No certifica historia, ignorados ni vulnerabilidades desconocidas. |
| P01 | Pendiente | npm audit raíz: tres avisos moderados en Tailwind 3.4.19 → postcss-nested/postcss-selector-parser; una causa raíz. | Actualización compatible y regresión CSS por separado; no audit fix --force. |
| P02 | Pendiente | No hay upload, normalización/aprobación de bytes ni entrega /v1/media/:hash; URLs reservadas, ninguna foto real. | Pipeline R2 local antes de catálogo visual real. |
| P03 | Pendiente | React y Hostinger siguen sin conectar a la API. | Adaptador tipado, ETags/409/202, origen HTTPS compatible; sin JWT en localStorage. |
| P04 | Pendiente | Faltan carga, rate limiting, métricas y retención. Cada lectura administrativa autorizada escribe auditoría; lectura pública del snapshot y versión global requieren dimensionamiento. | Medir consumo y contención antes de volumen real. |
| P05 | Pendiente | Registro de rutas conserva duplicados heredados, resueltos primero por catalogRoutes; no omiten middleware. | Limpieza futura con regresiones. |
| B01 | Bloqueante para tráfico remoto | No hay scheduled/queue/consumidor automático ni alerta de backlog. Una retirada puede permanecer pendiente indefinidamente sin intervención. attempts/last_error_code no representan todos los fallos. | Definir SLA y recuperación; consumidor idempotente/reintentos/alertas o revocación fuerte que cumpla ese SLA. Probar fallos prolongados antes de tráfico real. |
| B02 | Bloqueante condicional de upgrade | Outbox legacy preserva catalog_json=NULL; sync no lo regenera silenciosamente. Aprobaciones antiguas quedan con category_version=NULL. | Si existen en el destino, inventariar y regenerar/reaprobar explícitamente antes de activar tráfico. No aplica a una base nueva. |
| B03 | Bloqueante de recuperación remota | Comparador acepta R2 de generación igual/superior. No detecta divergencia semántica válida de igual generación ni cambio de historial por restore aislado de D1. | Restore coordinado/versionado de entorno y pruebas de coherencia antes de operación remota. |

P01 es agotamiento de CPU al analizar selectores CSS no confiables. En este repo
se usa al compilar fuentes locales; no se identificó una ruta HTTP de la API que
ejecute ese parser. No se afirma compromiso de la landing publicada. Fuente:
[GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).

## Publicación, 202 y reconciliación

1. Valida contenido/revisión/aprobación; el batch revalida permisos y versiones.
2. D1 confirma estado, comando, snapshot de outbox y auditoría conjuntamente.
3. La entrega R2 es posterior y condicional por ETag.
4. Fallo de entrega o acknowledgement devuelve 202 pending, sin revertir D1.
   Si falló solo el ack, R2 ya puede contener la copia nueva: pending tampoco
   significa necesariamente invisible.
5. Sync toma la última generación validada y reconoce las anteriores. Una copia
   más nueva puede superar snapshots intermedios: “visible” de un comando no
   acredita que cada estado intermedio se haya mostrado a una persona.
6. Fallos de ack no degradan una copia más nueva; sync repetido sin novedades
   conserva bytes y outbox reconocido, sin nuevos comandos de negocio.

**Idempotencia de reconciliación comprobada; no hay replay de respuesta HTTP del
POST de negocio.** Si se pierde una respuesta, releer estado/versiones antes de
reenviar. El futuro Admin debe distinguir estado D1 de visibilidad pública.

La API pública solo sirve snapshots aprobados al generarse. Al no consultar D1,
no sabe si después se retiró el servicio o se revocó una aprobación. “Aprobado”
no significa reflejo instantáneo del estado vigente bajo fallo de entrega. B01
es una ventana de contenido anteriormente aprobado, no exposición de borradores.

## Pruebas ejecutadas

Se reprodujeron primero las **141 comprobaciones anteriores sin fallos**:
74 backend + 49 contratos/público + 18 Admin. Se añadieron cinco pruebas reportadas:
desde cero, upgrade poblado, rollback de migración, matriz de autorización y
retirada pendiente con reconciliación repetida. Resultado final:

| Grupo | Resultado |
|---|---|
| Backend/seguridad/SQL/API/aislamiento | 79/79 |
| Contratos | 12/12 |
| Marketplace/adaptador/carrito ES/EN | 6/6 |
| Assets | 3/3 |
| Loader | 4/4 |
| PWA/instalador | 24/24 |
| React Admin | 18/18 |
| Total | **146/146, cero fallos u omitidas** |

El conteo Node incluye contenedores, igual que antes. No se midió porcentaje de
cobertura ni se realizó pentest remoto. También pasaron TypeScript estricto y
lint de backend/Admin/contracts, lint catálogo, build backend (tres bundles),
Vite Admin, landing, checks estáticos/contactos, aislamiento y dry-runs Wrangler.
“Total Upload” en dry-run es tamaño calculado: no hubo subida.
La compilación pública advirtió caniuse-lite antiguo, sin fallar.

Comandos desde la raíz:
```powershell
npm --prefix infra/cloudflare/dev test
npm --prefix infra/cloudflare/dev run lint
npm --prefix infra/cloudflare/dev run verify:migrations
npm --prefix infra/cloudflare/dev run validate:config
npm --prefix infra/cloudflare/dev run validate:public
npm --prefix apps/admin test
npm --prefix apps/admin run lint
npm --prefix apps/admin run build
npm --prefix apps/admin run verify:isolation
npm --prefix packages/contracts run lint
npm --prefix packages/contracts run typecheck
npm run test:contracts
npm run test:catalog
npm run test:assets
npm run test:loader
npm run test:pwa
npm run check
npm run lint:catalog
npm run build
npm audit --json
npm --prefix apps/admin audit --json
npm --prefix infra/cloudflare/dev audit --json
```

Desde infra/cloudflare/dev, con credenciales CF retiradas del proceso,
XDG_CONFIG_HOME aislado, telemetría desactivada y CI=true:
```powershell
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --persist-to .wrangler/state/audit-final-20261023 --config wrangler.local.json --env development
```
En esta ejecución la ruta era nueva y se aplicaron las cuatro migraciones.
verify:migrations respondió antes “No migrations to apply” en su ruta existente;
ese noop no se presentó como comprobación desde cero.

Se abrió el archivo SQLite D1 nuevo con node:sqlite readOnly: integrity_check=ok,
foreign_key_check vacío y cuatro entradas d1_migrations. workerd rechaza
integrity_check (SQLITE_AUTH); no se relajó la API. Para el caso poblado se
compararon todas las filas anteriores y relaciones en workerd, sin afirmar un
integrity_check físico remoto. El fallo forzado revierte schema y filas completos.

Log backend: infra/cloudflare/dev/.wrangler/audit-final-expanded-tests.log.
Logs/bases/artefactos permanecen ignorados. Claves y JWT de prueba solo en memoria.
El escaneo de secretos cubre fuentes/configuración no ignoradas por patrones;
no historial completo, credenciales del usuario ni archivos ignorados. No es una
garantía absoluta o sustituto de un detector especializado.

## Inventario de los 31 archivos anteriores

Modificados (14):
```text
infra/cloudflare/dev/README.md
infra/cloudflare/dev/package.json
infra/cloudflare/dev/scripts/build.mjs
infra/cloudflare/dev/scripts/local.mjs
infra/cloudflare/dev/src/auth/types.ts
infra/cloudflare/dev/src/index.ts
infra/cloudflare/dev/src/security.ts
infra/cloudflare/dev/test/auth-fixtures.mjs
infra/cloudflare/dev/test/authorization.test.mjs
infra/cloudflare/dev/test/config-storage.test.mjs
infra/cloudflare/dev/tsconfig.json
infra/cloudflare/dev/wrangler.local.json
packages/database/README.md
packages/database/migrations.sha256.json
```
Nuevos (17):
```text
docs/PHASE-2B4-CATALOG-API.md
infra/cloudflare/dev/src/catalog/categories.ts
infra/cloudflare/dev/src/catalog/delivery.ts
infra/cloudflare/dev/src/catalog/errors.ts
infra/cloudflare/dev/src/catalog/input.ts
infra/cloudflare/dev/src/catalog/projection.ts
infra/cloudflare/dev/src/catalog/publication.ts
infra/cloudflare/dev/src/catalog/repository.ts
infra/cloudflare/dev/src/catalog/routes.ts
infra/cloudflare/dev/src/catalog/services.ts
infra/cloudflare/dev/src/catalog/snapshot.ts
infra/cloudflare/dev/src/catalog/transaction.ts
infra/cloudflare/dev/src/catalog/types.ts
infra/cloudflare/dev/src/public.ts
infra/cloudflare/dev/test/catalog-api.test.mjs
infra/cloudflare/dev/wrangler.public.local.json
packages/database/migrations/0004_catalog_operations.sql
```

## Cierre

No se detectó un defecto bloqueante para cerrar DEV local ni pérdida de revisiones
en los casos probados. No corresponde declarar el sistema listo para producción.
Antes de despliegue: resolver B01/B03, comprobar B02 y aprobar por separado recursos,
configuración, SQL remoto, bootstrap, Access, backups y recuperación.

No hubo commit, push, deploy, migraciones remotas, conexión D1/R2 remota ni cambios
en Cloudflare, Access, Hostinger o DNS. Red limitada a avisos npm y documentación
pública de seguridad. La fase se detiene para revisión.
