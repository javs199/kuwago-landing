# Esquema D1 de DEV — Fases 2B.2 a 2B.4R

0005_publication_resilience.sql añade epoch/head de publicación, estado de
reintentos y leases al outbox, alertas y registro de recuperación. 0001–0004
permanecen intactos. Historial existente entra pausado/cuarentenado hasta revisión.
El head se modifica con publicación y auditoría en el mismo batch. R2 no participa
en esa transacción: una barrera primaria impide servir snapshots obsoletos.
Ver [operación, restore y pruebas 2B.4R](../../docs/PHASE-2B4R-RESILIENCE.md).

Migraciones forward-only, sin aplicación remota. No editar archivos ya aplicados;
añadir el siguiente número. El manifiesto migrations.sha256.json identifica los SQL
revisados. No hay seeds de personas, credenciales, categorías, servicios ni precios;
solo se define la matriz de roles/permisos candidata de Fase 2A.

Actualización 2B.3: 0003_access_rbac.sql añade admin_role_definitions,
admin_role_permissions y administrator_roles. El middleware usa exclusivamente
estos roles canónicos: editor, admin, super_admin. Las tablas históricas se conservan
y NO conceden permisos al nuevo backend ni se convierten automáticamente.
Un principal tiene como máximo una asignación canónica; su clave sigue siendo
issuer+subject de Access, nunca el email. No hay seeds de administradores.
El trigger de aprobación exige ahora un admin/super_admin independiente habilitado.
Los SQL 0001/0002 y sus checksums originales permanecen intactos.

Actualización 2B.4: nueva 0004_catalog_operations.sql, sin editar 0001–0003.
catalog_state serializa mutaciones y comienza en la máxima generación existente.
mutation_guards convierte precondiciones/permiso inválidos en errores SQL reales:
el batch se revierte, no deja auditoría exitosa de una actualización de cero filas.
La tabla es interna efímera por operación y queda vacía al terminar.

Se justifica ampliar publication_commands.action para incluir unpublish (el CHECK
anterior no lo permitía). La migración copia el outbox a scratch sin FK, elimina
primero el hijo, reconstruye el padre con la restricción ampliada y restaura hijo,
FK e índice; todo en la transacción de migración. No deja tablas duplicadas ni datos
perdidos. Existe una prueba de upgrade con historial no vacío y foreign_key_check.
publication_outbox.catalog_json contiene SOLO DTO público validado; no notas ni
aprobaciones. commercial_approvals.category_version invalida una aprobación si
cambia su categoría antes de publicar. Aprobaciones legacy no se revalidan solas.

El documento histórico 2B.3 describe el estado previo sin CRUD. Actualmente el
backend local utiliza los modelos SQL existentes y los contratos 1C, sin duplicarlos.
Editar crea revisión nueva, aprobar sella hash, y publicar/retiro/archivo escriben
estado, auditoría y outbox en un único batch con roles y versión revalidados.
El exportador R2 separado es eventual, NO parte de la transacción D1.

## Modelo y contratos 1C

| Contrato | Tablas | Decisiones |
|---|---|---|
| Administradores / roles | principals, admin_role_definitions, admin_role_permissions, administrator_roles; tablas legacy conservadas | Identidad issuer+sub; disabled por defecto; sin credenciales ni primera visita admin |
| Category | categories, category_translations | ES/EN, slug único, estado activo independiente de publicaciones |
| Service / AdminService | services | ID estable, procedencia, estado, working/published revision, versión optimista y notas privadas |
| ServiceRevision | service_revisions, service_translations | Revisión por servicio/número, ES/EN, categoría, slug, hash y sellado |
| ServiceOption | option_identities, service_options, option_translations | ID estable pertenece al servicio; contenido/orden por revisión; máximo 100 opciones |
| ServicePrice | option_prices | Sin fila = borrador incompleto; fixed/from = entero menor + moneda; quote = importe NULL, moneda conocida o NULL |
| MediaAsset | media_assets, revision_media, revision_media_translations | DTO privado de almacenamiento; orden/alt por revisión; sort_order=0 es principal |
| Aprobación | commercial_approvals | Hash/revisión sellada, revisor independiente admin/super_admin activo desde 0003, revocación preservada |
| Publicación futura | publication_commands, publication_outbox | Idempotencia por actor, generación segura, pending/visible/failed fuera de PublicationStatus |
| Auditoría | audit_events | Actor, acción, entidad, revisión, request ID, resultado; sin JWT, cuerpos o claves |

Las tablas son privadas; NO son un contrato público ni un API. No existe mapper
público implementado. MediaAsset.url se construirá por el backend desde una ruta
autorizada de preview o un derivado aprobado; no se almacena URL pública ni presign.
El bucket único kuwago-media-development nunca se entrega al catálogo público.
No se ha creado el bucket de publicación/backup propuesto para otra fase.

Los contratos 1C se conservan sin cambios. SQL comprueba integridad relacional,
locales, monedas USD/CRC/EUR, rangos y estados. Validación exacta de IDs/slugs/fechas,
traducciones completas, readiness comercial y máximo de respuesta siguen requiriendo
los esquemas 1C y validación del backend, antes de cualquier mutación/publicación.

## Invariantes probadas

- Crear Service + primera revisión en el mismo batch: sus referencias compuestas
  diferidas resuelven el ciclo y no permiten revisión ajena o puntero colgante.
- draft sin publishedRevisionId; published exige puntero. archived puede conservar
  la revisión histórica sin hacerla pública.
- Dinero seguro entero 0..Number.MAX_SAFE_INTEGER, moneda explícita y quote sin importe;
  duration 1..1440 o NULL; modalidad y tipo privado/compartido o NULL en borrador.
- Revisión sellada y sus seis colecciones hijas rechazan cambios, inserciones y
  borrados; ni mover una fila fuera de la revisión permite eludir el sellado.
- Aprobación ligada a hash sellado; no autor del contenido ni principal deshabilitado
  o sin rol admin/super_admin canónico. La aprobación se revoca una vez, sin reescribir historia.
- La guarda SQL de publicación exige procedencia verificada, categoría activa,
  revisión sellada con aprobación vigente y slug publicado único. NO comprueba toda
  la preparación comercial del contrato: no habilita publicar por sí sola.
- Un error SQL real revierte todo db.batch, incluida auditoría. UPDATE de cero filas
  no produce error: la futura operación CAS debe incluir guarda SQL abortante;
  en 2B.4 esa guarda y la transacción están implementadas y probadas localmente.
- Auditoría append-only por triggers; no es inmutable frente a un administrador D1
  capaz de cambiar el esquema. Retención y exportado deben diseñarse sin saltar esto.

Las tablas por sí solas NO autorizan requests: el middleware 2B.3 verifica permiso y
principal activo. La matriz canónica concede media:read-private y media:prepare a
los tres roles; sus handlers de almacenamiento siguen deshabilitados. media:approve
y media:cleanup aún no se asignan ni implementan. No heredar permisos legacy.
Bootstrap: operador identifica al menos dos personas individuales y registra sus
roles con revisión independiente en una operación futura autorizada, nunca con seeds
de emails o credenciales ni primera visita del navegador.

## Ejecución exclusivamente local

Desde la raíz del repositorio, con dependencias instaladas:

```powershell
npm --prefix infra/cloudflare/dev run validate:config
npm --prefix infra/cloudflare/dev run migrate:local
npm --prefix infra/cloudflare/dev run migrations:list:local
npm --prefix infra/cloudflare/dev test
```

Wrangler mantiene historial d1_migrations y solo aplica lo pendiente. Los tests crean
otra D1 efímera workerd y prueban las migraciones desde cero con fixtures sintéticos;
no usan la base local persistente de desarrollo ni abren R2 remoto.
Estado local ignorado: infra/cloudflare/dev/.wrangler/state/development.

Antes de una futura migración remota: comprobar cuenta y D1 ID, checksum/SQL exacto,
backup/bookmark, resultados locales y autorización explícita de ambiente/base/archivo.
No hay script remoto en esta fase. No considerar DOWN destructivo como rollback:
restauración aislada/forward-fix con respaldo y autorización propios.
