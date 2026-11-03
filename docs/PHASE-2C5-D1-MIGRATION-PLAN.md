# Fase 2C.5 — Plan final de migraciones D1 DEV

24/10/2026 · America/Costa_Rica · Inspección y pruebas locales, sin operaciones sobre la cuenta remota.

**GO para revisar el plan. NO-GO para ejecutar migraciones hoy:** faltan autorización de credencial, preflight actualizado, respaldo verificable y autorización del lote. El bootstrap y cualquier recuperación remota requieren aprobaciones independientes. No se crearon tokens ni administradores, no se ejecutó SQL remoto y no se cambió D1/R2 remoto, Access, Workers, DNS ni Hostinger. Sin commit ni push.

## 1. Objetivo y evidencia de partida

| Destino único autorizado para una fase futura | Valor |
|---|---|
| Cuenta | `7a8bcd7992a3de359d2aff87df2fb693` |
| Nombre D1 | `kuwago-admin-db-development` |
| UUID | `c5cfbe44-4fd0-4c2a-83c1-b833935534ba` |

La Fase 2C.4 verificó el 24/10/2026 a las 22:34 de Costa Rica dos HTTP 200: GET de metadatos y SELECT del esquema. Solo existía `_cf_KV`, sin tablas de aplicación ni `d1_migrations`. La credencial fue retirada del entorno del proceso, que terminó. Esta fase leyó esa evidencia local; **no repitió consultas remotas**. El estado observado no sustituye el preflight de la futura ventana.

Referencias locales: `docs/PHASE-2C3-D1-BOOTSTRAP-READINESS.md`, `docs/PHASE-2C4-D1-READ-DIAGNOSTIC.md`, `packages/database/README.md`, manifiesto de hashes y código de recuperación. Se preservan los nueve archivos tracked previamente modificados y los árboles no versionados existentes. No se modifica el esquema ni el frontend.

## 2. Inventario y orden obligatorio

Hay **seis** migraciones, no cinco. Todas coinciden byte a byte con `packages/database/migrations.sha256.json`. No añadir seeds comerciales, usuarios, categorías, imágenes o contraseñas al lote. No editar SQL aprobado/aplicado; cualquier cambio de esquema exige otro archivo y revisión.

| Orden / archivo | Dependencia y efecto | Riesgo/control |
|---|---|---|
| 0001_admin_catalog.sql | Esquema inicial: identidad, roles históricos, categorías ES/EN, servicios y revisiones, opciones/precios, media, aprobaciones, auditoría y outbox | Relaciones circulares service/revision diferidas. Solo seeds de roles/permisos; personas deshabilitadas por defecto, sin altas |
| 0002_integrity_guards.sql | Requiere 0001; 32 triggers de inmutabilidad, transición multimedia, aprobación independiente y auditoría append-only | Verificar triggers; no deshabilitar FK ni guardas para superar un error |
| 0003_access_rbac.sql | Requiere 0001–0002; roles canónicos `editor/admin/super_admin` y reemplazo de la guarda de aprobación | Roles legacy no conceden acceso canónico. Asignación prohíbe autoconcesión |
| 0004_catalog_operations.sql | Requiere anteriores; CAS/versionado, mutation guards, acción unpublish, snapshot DTO y versión de categoría en aprobación | Reconstruye commands/outbox preservando datos, hijo primero; scratch debe desaparecer. Auditoría y revisiones intactas |
| 0005_publication_resilience.sql | Requiere 0004; época/head, leases, reintentos, alertas y recuperación | Historial previo queda cuarentenado; si existe publicación/outbox, inicia pausado. No reactivar automáticamente |
| 0006_media_lifecycle.sql | Requiere anteriores; procesamiento y límites de media, guardas para adjuntos y media publicada | Aditiva; no procesa ni aprueba archivos existentes por sí sola; no activa Images ni R2 |

SHA-256 que deben volver a comprobarse antes de ejecutar:

```text
0001_admin_catalog.sql          33bd2451b568acf1c316fcc5355bca1e1cd87deacace72d3819233a00e670abd
0002_integrity_guards.sql       47abe773445a464a7a25b412a11d35799aa1a704e14d6b7846885dff35d41ed4
0003_access_rbac.sql            19ba25557c88f509927cd1fea912da3d3d4a815b56733e310be51dd155719336
0004_catalog_operations.sql    dfa41753ca3e91628077ceec2557ec8d77a02ef59062439e8adaf7780a19550b
0005_publication_resilience.sql 464b69f3df0a5e85ff960a95aa937c718a69578aaf1235b877e6130381354d3a
0006_media_lifecycle.sql        ed8fcd76c51fc8050c5b5bd676e4eb98323b62e81fc312e99589bcdb9314ac4c
```

Los comentarios históricos que dicen que aún no existe publicación o API no describen el backend actual. Se contrastó el SQL con la implementación y pruebas posteriores, sin reescribir esos originales.

## 3. Pruebas repetidas en esta fase

| Prueba | Resultado actual |
|---|---|
| Build contratos | Aprobado |
| Build backend / TypeScript | Aprobado; genera bundles locales, sin upload |
| Lint backend | Aprobado |
| Regresiones seleccionadas | **85/85 aprobadas**, 0 fallos, omitidas o canceladas |
| Cadena completa en D1 local vacía por Wrangler | 6/6 aplicadas; segunda pasada sin pendientes |
| Restauración coordinada aislada | Aprobada; nueva época, pausada, 0 publicaciones, FK limpias, ledger conservado, archivo multimedia local consistente |
| Aplicación por etapas con `migrations_pattern` exacto | 6/6; una migración por etapa; repetición inmediata de cada etapa sin cambios |
| Integridad de cada etapa | `PRAGMA quick_check = ok`, `foreign_key_check = []`, ledger igual al prefijo esperado |
| Personas/servicios/auditoría en ensayo vacío | 0; ningún administrador real creado |

Se reutilizó `scripts/d1-readiness-local.mjs`, que elimina credenciales Cloudflare/Wrangler del entorno de hijos, fija `--local`, usa config aislada y destinos nuevos. Aunque su reporte conserva la etiqueta histórica `phase: 2C.3`, se ejecutó nuevamente para 2C.5. Evidencia nueva: `infra/cloudflare/dev/.wrangler/phase2c3/run-a0bf64313c69/result.json`.

Se preparó exclusivamente como artefacto de ensayo ignorado `.wrangler/phase2c5/staged.mjs`: aplica cada SQL original mediante Wrangler 4.152.0, con un patrón de archivo exacto, lo repite y examina el estado persistido con workerd/Miniflare. No usa UUID real ni binding remoto. Salida: `.wrangler/phase2c5/788ec64c/result.json`, seis esquemas por etapa y logs locales. No es un ejecutor remoto ni se incorpora como módulo de infraestructura.

Las 85 regresiones cubren configuración/aislamiento/checksums, SQL, RBAC, preservación de filas y revisiones en 0004, rollback tras fallo en su reconstrucción, restauración con contenido sintético, pérdida de objetos, restauración parcial, cuarentena legacy, reintentos, concurrencia y reinicio del sincronizador. También cubren la preservación de identidades/revisiones/media por 0006 y el diagnóstico de lectura. Las personas y bytes de esos tests son fixtures locales, no personas o imágenes reales.

Comandos reproducibles desde la raíz, con dependencias ya instaladas:

```powershell
npm --prefix packages/contracts run build
npm --prefix infra/cloudflare/dev run build
node infra/cloudflare/dev/scripts/d1-readiness-local.mjs
npm --prefix infra/cloudflare/dev run lint
```

Desde `infra/cloudflare/dev`:

```powershell
node --test test/config-storage.test.mjs test/database.test.mjs test/catalog-audit.test.mjs test/authorization.test.mjs test/resilience.test.mjs test/multimedia.test.mjs test/d1-read-diagnostic.test.mjs
node .wrangler/phase2c5/staged.mjs
```

Log nuevo de regresiones: `.wrangler/phase2c5-regression-tests.txt`. Todos los ensayos quedan excluidos por Git. No se migró la persistencia local habitual. No se repitieron pruebas visuales/E2E del frontend ni el build de la landing: no cambió código de aplicación. No se afirma validación remota de migraciones, recuperación ni permisos Write.

## 4. Permisos mínimos y credencial propuesta — no creada

| Operación futura | Permiso mínimo previsto | Observación |
|---|---|---|
| GET D1 y SELECT de esquema | Account / D1 / Read | Ya funcionó con la credencial temporal de 2C.4; vigencia actual no reconsultada |
| DDL/DML de seis migraciones y ledger | Account / D1 / Edit, denominado **D1 Write** en la API | No necesita Workers, R2, Access, DNS, Images ni Analytics |
| Time Travel info/export | Validar permiso documentado y aceptación para cada herramienta en la fase autorizada de respaldo | No ampliar permisos automáticamente ante un rechazo; no se probó con el token de lectura |
| Restauración / bootstrap | Capacidad D1 Write y autorizaciones distintas | No están incluidos en migrar |
| Creación y revocación del token | Operador humano en Dashboard | No conceder administración de tokens al propio credential de migración |

Diseño propuesto: token separado del Read existente, nombre `kuwago-d1-dev-migrations-<fecha>`, **una cuenta específica**, exclusivamente D1 Edit/Write, comienzo de vigencia y caducidad de **una hora** alrededor de la ventana. Si el selector no admite ese plazo, aprobar explícitamente el menor disponible y revocar inmediatamente al cerrar. No reutilizar los siete días del token Read como duración de Write. Restricción IP solo con salida de red conocida/estable; no adivinarla.

El permiso D1 es de cuenta: no se ha demostrado una ACL de token por UUID. Por tanto **puede permitir acceso y escritura a otras D1 de esa cuenta**, incluso si nuestro proceso solo apunta a Kuwago. El límite operativo debe rechazar cuenta/UUID/nombre distintos, endpoints de listado/otras bases, config alternativa, otros comandos y SQL no revisado. No prometer aislamiento criptográfico por base. Si ese alcance resulta inaceptable, detenerse y elegir otra separación de cuenta/operador aprobada; no crear una cuenta automáticamente.

Introducción por mecanismo local enmascarado, solo memoria y entorno del hijo; nunca argumentos, chat, `.env`, `.dev.vars`, archivos o logs, ni `VITE_*`. **El formulario 2C.4 permanece exclusivamente de lectura y no se convierte en ejecutor SQL genérico.** Antes de ejecutar migraciones habrá que revisar un lanzador de alcance fijo para los comandos aprobados, sin otro sistema persistente de credenciales ni reutilización silenciosa de OAuth. Esa preparación y su prueba local requieren revisión; no se implementan en esta fase documental.

Cierre: retirar las variables del proceso y objetos de lanzamiento en `finally`, cerrar hijos y limpiar cualquier material temporal sensible; después el operador revoca el token en el Dashboard y registra ID/nombre no secreto, fecha UTC y responsable. La limpieza local no equivale a revocación. Comprobar la revocación mediante el estado del token en Dashboard; no volver a ejecutar escrituras para probarla. Revocar también ante fallo, cancelación o cierre temprano; si expira la ventana, no prolongarla sin aprobación.

## 5. Procedimiento remoto futuro, paso a paso — NO EJECUTADO

### A. Congelar y preparar el lote

1. Aprobar responsable, revisor, ventana, cuenta/UUID, nombres/hashes de los seis archivos, respaldo y política de incidentes. Bloquear otros operadores y mutaciones concurrentes durante la intervención. Si eso exige cambiar un Worker o Access, obtener autorización aparte; no hacerlo implícitamente.
2. Conservar Hello World/backend actual sin desplegar la API ni activar Cron, uploads o frontend administrativo remoto. No conectar el catálogo Hostinger.
3. Fijar Node instalado y **Wrangler 4.152.0 local**; no `npx` que descargue otra versión. Revisar Git/checksums otra vez; cualquier cambio requiere repetir pruebas y actualizar aprobación.
4. Preparar un archivo D1 de operación separado dentro de `infra/cloudflare/dev`, sin entrypoint de Worker, R2, Images, rutas, secrets, staging ni production. No alterar `wrangler.local.json`, wrappers locales ni el ejemplo remoto bloqueado.

Candidato de contenido, **solo documentado, todavía no creado** como `wrangler.d1-development.operation.json`:

```json
{
  "name": "kuwago-d1-development-operation-only",
  "account_id": "7a8bcd7992a3de359d2aff87df2fb693",
  "compatibility_date": "2026-07-30",
  "workers_dev": false,
  "preview_urls": false,
  "send_metrics": false,
  "d1_databases": [{
    "binding": "DB",
    "database_name": "kuwago-admin-db-development",
    "database_id": "c5cfbe44-4fd0-4c2a-83c1-b833935534ba",
    "migrations_table": "d1_migrations",
    "migrations_dir": "../../../packages/database/migrations",
    "migrations_pattern": "../../../packages/database/migrations/0001_admin_catalog.sql"
  }]
}
```

La ausencia de código no es una prohibición universal de Cloudflare; el control efectivo será permitir únicamente comandos D1 revisados. `remote:false` tampoco protege contra un CLI `--remote`. No usar aliases de binding ambiguos: nombre estable más validación del UUID.

### B. Preflight remoto únicamente de lectura, con autorización propia

5. GET de la base exacta, cotejar nombre y UUID; guardar hora/status depurados. No listar otras bases. No llamar `whoami`, analytics o ampliar OAuth para descubrir un account ID ya conocido.
6. Ejecutar SELECT de `sqlite_schema`, incluyendo SQL de objetos no internos para comparar; no retener tokens/headers en evidencia. No ejecutar `migrations list`: puede inicializar el ledger mediante CREATE antes de listar. No usar tampoco `migrations apply` como simulación/preflight: inicializa ese ledger antes de la confirmación.
7. Para una primera ejecución se exige el estado de 2C.4: solo objetos internos conocidos, **sin objetos de aplicación ni ledger**. Cualquier diferencia suspende este plan de instalación vacía; no borrar ni adoptar datos automáticamente. Si existe ledger tras un incidente autorizado, seguir un plan de reanudación revisado, no esta rama inicial.
8. Si existe ledger durante una recuperación revisada, leer solamente después de comprobar su existencia:

```sql
SELECT id, name, applied_at FROM d1_migrations ORDER BY id;
PRAGMA quick_check;
PRAGMA foreign_key_check;
```

Debe ser un prefijo exacto, sin nombres desconocidos, huecos o duplicados. Comparar esquema real contra la etapa local equivalente, no confiar exclusivamente en el ledger (no almacena nuestros hashes). Conteos/hashes de revisiones y auditoría son obligatorios si aparece contenido; eso exige otra aprobación de upgrade, no seguir como base vacía.

### C. Respaldo antes de cualquier escritura

9. Autorizar la obtención de bookmark Time Travel **previo incluso a crear `d1_migrations`**, inventario y export SQL del estado remoto. Mantener la ventana sin escritores entre preflight, respaldo y migración. Registrar cuenta, UUID, UTC y SHA-256 de export/config/SQL; revisar que el respaldo terminó y pertenece al objetivo.
10. Guardar export y evidencias en destino local protegido/cifrado fuera del repositorio y carpetas sincronizadas no aprobadas. Retención propuesta: 30 días después de aceptación, con propietario y eliminación aprobados. Una exportación puede contener datos privados y URLs efímeras de descarga: no volcarlas en logs ni incorporarlas al informe.

Comandos de referencia para la fase autorizada, desde `infra/cloudflare/dev`; no fueron ejecutados:

```text
node node_modules/wrangler/bin/wrangler.js d1 time-travel info kuwago-admin-db-development --config wrangler.d1-development.operation.json --json
node node_modules/wrangler/bin/wrangler.js d1 export kuwago-admin-db-development --remote --config wrangler.d1-development.operation.json --output <RUTA_PROTEGIDA_EXPORT_SQL>
```

Time Travel info opera remotamente sin `--remote`. El export puede bloquear consultas mientras dura. Si una herramienta expone salida sensible o necesita permisos adicionales, detenerse y revisar el mecanismo/permiso; no ampliar automáticamente el token. Importar la exportación en **D1 local nueva**, con herramientas y SQL revisados, y cotejar el esquema lógico/estado esperado. No manipular ni intentar recrear objetos internos Cloudflare como `_cf_KV`. Si un export vacío o su restauración no son utilizables, documentar el caso y aprobar otro respaldo verificable; no omitir ese gate.

**Límite importante:** `createLogicalBackup` de la aplicación requiere `publication_control`, que no existe antes de migrar. Por ello no sirve para respaldar el estado remoto actual vacío. Para ese estado se necesita export/bookmark; el restore lógico coordinado se utiliza después de tener un esquema compatible y contenido. No confundir la prueba local de backup posterior a seis migraciones con una prueba del export remoto previo.

### D. Autorizar y aplicar de una en una

11. Presentar preflight/respaldo y obtener autorización de **ejecución** distinta de la creación del token. Revalidar credencial/objetivo sin escrituras. La pantalla de confirmación de Wrangler no reemplaza esta autorización.
12. Usar `migrations_pattern` con **un solo archivo exacto** por etapa, empezando por 0001. El patrón debe comenzar con `migrations_dir/`, como el ejemplo. No cambiar/copiar SQL, renombrar archivos, insertar ledger a mano ni usar un comodín que aplique los seis sin pausa.
13. Verificar inmediatamente antes de cada etapa: hashes originales, config fijada, ledger prefijo esperado y aceptación de la etapa anterior. Ejecutar una sola vez el comando siguiente mediante el lanzador aprobado:

```text
node node_modules/wrangler/bin/wrangler.js d1 migrations apply kuwago-admin-db-development --remote --config wrangler.d1-development.operation.json
```

14. La primera invocación autoriza expresamente la creación del ledger por Wrangler. Esperar finalización, inspeccionar status y hacer todas las comprobaciones de la sección 6. Solo tras aceptación cambiar el patrón a 0002 y repetir, hasta 0006. No CI, auto-confirmación ni reintentos remotos automáticos. La repetición local sin pendientes demuestra control por ledger, no que sea seguro repetir a ciegas tras un timeout remoto.
15. Un fallo de migración revierte esa migración según la documentación; las anteriores permanecen. La cadena completa no es atómica. Si se pierde la respuesta, clasificar el resultado como **desconocido**, consultar ledger/esquema bajo autorización de lectura y reconciliar antes de decidir cualquier reejecución. No presumir rollback por un error de red.

### E. Cierre

16. Confirmar seis nombres ordenados en ledger, esquema final, integridad y cero entidades/privilegios inesperados. Conservar resultado depurado, hashes, operador, revisor, tiempos y decisiones por etapa. El ledger de Wrangler no es por sí solo auditoría humana de cambio ni verificación de checksum.
17. Capturar punto posterior si estaba autorizado; retirar credencial de procesos y revocarla mediante operador. Mantener backend remoto actual y bucket privado sin cambios. Presentar informe de ejecución. No desplegar Admin/API ni hacer bootstrap como parte del cierre.

## 6. Comprobaciones posteriores a cada migración

Siempre: `quick_check=ok`, FK sin filas, ledger igual al prefijo, esquema de objetos equivalente a la captura local, ninguna tabla temporal de 0004 y cero personas/servicios/revisiones/media/aprobaciones/auditoría/comandos/outbox en esta instalación vacía. Excluir solo objetos internos identificados y ledger al comparar objetos de aplicación. Las diferencias de formato SQL deben revisarse, no aprobarse automáticamente por similitud de conteos.

Conteos obtenidos con Wrangler local; índices explícitos, sin autoíndices SQLite; tablas sin internos/ledger:

| Etapa | Tablas | Índices | Triggers | Aceptación adicional |
|---|---:|---:|---:|---|
| 0001 | 21 | 7 | 0 | 4 roles legacy y 7 permisos; 0 principals y asignaciones; ciclos FK correctos |
| 0002 | 21 | 7 | 32 | Inmutabilidad de revisiones/aprobaciones/auditoría y transición media presentes |
| 0003 | 24 | 7 | 32 | 3 roles canónicos, 24 permisos de rol; 0 administrator_roles; guarda usa RBAC canónico |
| 0004 | 26 | 7 | 32 | catalog_state.version=0; mutation_guards vacío; sin `%v4%`; commands permite unpublish; category_version existe |
| 0005 | 29 | 8 | 32 | publication_control con 1 fila, época hex de 32 caracteres, ready, generation/payload_hash NULL en base vacía; alertas/recovery/outbox vacíos |
| 0006 | 32 | 8 | 34 | media_processing/media_upload_limits/media_read_limits vacíos; guardas nuevas presentes; revisiones intactas |

Consultas de lectura que se revisarán para la ejecución, nunca enviadas en esta fase:

```sql
SELECT type, name, sql FROM sqlite_schema
WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
AND name NOT GLOB '_*' AND name <> 'd1_migrations'
ORDER BY type, name;
SELECT COUNT(*) AS n FROM principals;
SELECT COUNT(*) AS n FROM services;
SELECT COUNT(*) AS n FROM service_revisions;
SELECT COUNT(*) AS n FROM audit_events;
```

Desde 0003: contar `administrator_roles`, `admin_role_definitions` y `admin_role_permissions`. Desde 0004: leer catalog_state y contar mutation_guards. Desde 0005: leer publication_control y contar alertas/recovery. Desde 0006: contar las tres tablas nuevas. No consultar una tabla antes de su etapa ni crearla para satisfacer un check. No insertar registros de prueba en DEV remoto para probar guardas; su verificación funcional fue local.

## 7. Respaldo, recuperación y rollback

**Primera instalación vacía:** conservar export y bookmark previos al ledger, además de cada resultado de etapa. Ante un fallo, dejar backend sin conectar, conservar la base y detenerse. No ejecutar DOWN ni DROP de tablas/ledger para volver a intentar. Decidir forward-fix o restauración mediante autorización específica, con el estado real de los archivos aplicados.

Time Travel según documentación: hasta 30 días con Workers Paid o 7 con Free; es una capacidad pública documentada, **no una nueva comprobación de la cuenta en esta fase**. Obtener y verificar el bookmark en la ventana autorizada, no calcular uno ficticio. Restaurar sobrescribe el estado de la misma D1 y no restaura R2; no es una clonación en destino nuevo. Evitar escribir o conceder roles mientras el esquema sea parcial. Tras restore revisar también el ledger, que puede retroceder con la base.

Comando de recuperación **solo con autorización nueva** y bookmark real aprobado:

```text
node node_modules/wrangler/bin/wrangler.js d1 time-travel restore kuwago-admin-db-development --config wrangler.d1-development.operation.json --bookmark <BOOKMARK_PREVIO_APROBADO>
```

No confundir el backup automático que documenta Wrangler al aplicar migraciones con el respaldo previo validado. Antes de cualquier restore: capturar estado del incidente si se autoriza, identificar escrituras que se perderían, confirmar objetivo/bookmark y el plan de aceptación.

**Cuando exista contenido D1–R2:** congelar escritores y reconciliadores, registrar época/generación/hash, manifest/snapshot y objetos privados/derivados con hashes. Los respaldos D1 y R2 no comparten transacción. Restaurar primero en destino aislado compatible; aplicar migraciones para crear su ledger, no copiar el del backup lógico. El restore lógico probado conserva historial, cambia época, retira publicaciones, revoca aprobaciones y pone outbox en cuarentena. Verificar almacenamiento y barrera pública; solo reanudar vacío mediante operación aprobada, y publicar de nuevo tras revisión/aprobación explícita.

El script `recovery.mjs` actual es **solo local**, no una herramienta remota autorizada. No se crearán recursos ni se tocará R2 en la fase de migraciones vacías. Si el preflight detecta contenido u objetos acoplados inesperados, suspender y preparar la operación coordinada específica. Límites actuales de backup lógico: documento D1 20 MB; archivo media 50 MB/1.000 entradas, máximo serializado 70 MB. Superarlos exige otro diseño, no saltar verificaciones.

Objetivos propuestos: RPO cero durante la ventana congelada respecto al respaldo previo; RTO inicial objetivo de 60 minutos para DEV vacío. **No son SLA ni tiempos de recuperación remota medidos.** Un método de restauración remota nunca ejecutado sigue siendo riesgo residual, aunque los ensayos locales hayan pasado.

## 8. Bootstrap del primer Super Admin — preparación, sin ejecución

El bootstrap no forma parte de los seis SQL. Nunca conceder privilegios por el primer login, email, claims enviados por React o un seed del catálogo.

1. Aprobar destinatario y concedente/revisor humano distintos. `administrator_roles` exige `principal_id <> granted_by`: no crear operador ficticio ni desactivar esa constraint para resolver el inicio.
2. Adquirir evidencia de Access de forma efímera y segura, validar firma RS256/JWKS fijo, issuer, AUD y tiempos; vincular **issuer + sub** con las personas aprobadas. No pedir JWT por chat ni almacenarlos. Revalidar issuer/AUD para el destino final; el App Launcher no sustituye la AUD de la aplicación.
3. Cotejar principals existentes por par único; no usar upsert para activar o cambiar un rol de forma silenciosa. Fijar IDs internos y un ID de operación auditado con precondición de instalación inicial. Si la operación ya existe, comprobar resultado exacto; si difiere, detenerse.
4. Preparar un lote de operador que cree/active explícitamente los principals necesarios, conceda el rol canónico al destinatario con concedente real y añada auditoría con motivo/aprobación, request ID y resultado. El concedente no recibe otro rol automáticamente. No usar `INSERT OR REPLACE`, múltiples comandos sueltos ni una ruta HTTP de bootstrap.
5. Probar localmente **ese lote y su mecanismo de ejecución exactos**: rollback completo si falla auditoría/precondición, dos intentos concurrentes, identidad duplicada o discrepante, autoconcesión, usuario deshabilitado y repetición idempotente. El `db.batch` actual es transaccional; eso no prueba que cualquier secuencia Wrangler/REST nueva lo sea.
6. Obtener autorización independiente con las identidades verificadas y lote concreto. Tras ejecución futura, revisar FK, auditoría, permiso super_admin y denegación de otros sujetos; no habilitar la interfaz hasta que Access/gateway también estén aprobados.
7. Recuperación/revocación: deshabilitar principal y retirar/cambiar rol con auditoría y nueva autorización; tratamiento de sesiones Access aparte. Mantener segundo humano y recuperación de operador con MFA. Nunca recuperar por coincidencia de email ante un cambio de issuer/sub.

**Pendientes bloqueantes para bootstrap:** identidades reales verificadas, concedente, mecanismo de adquisición de claims y lote atómico del operador probado. Se diseñó el procedimiento; no se generaron datos reales ni SQL de altas. No bloquean preparar el esquema vacío si el bootstrap queda expresamente excluido.

## 9. Condiciones de parada

- Cuenta, nombre o UUID distintos; hash nuevo; versiones/configuración no revisadas; patrón que seleccione más de un archivo.
- Esquema remoto distinto al vacío esperado, ledger desconocido o no contiguo, contenido inesperado o escritor concurrente.
- Respaldo incompleto, bookmark no disponible/verificable, import local no utilizable o ausencia de custodio/plan de recuperación.
- 10000, 401, 403 u otro fallo de permisos: detenerse; no ampliar OAuth o token ni probar otras cuentas/bases.
- Error SQL, FK no vacías, quick_check distinto de ok, pérdida/cambio inesperado de revisiones/auditoría, scratch superviviente o privilegios inesperados.
- Timeout/respuesta ambigua: no reintentar automáticamente. Lectura diagnóstica autorizada y decisión humana antes de seguir.
- Token fuera de vigencia, exposición accidental de credencial o salida sensible: detener hijos, retirar variables y coordinar revocación; no guardar secretos como evidencia.

## 10. Matriz GO / NO-GO y autorizaciones pendientes

| Gate | Estado hoy | Qué lo cierra |
|---|---|---|
| Orden, seis hashes y pruebas locales | **GO** | Volver a validar si cambia algún archivo/dependencia |
| Ensayo escalonado y restore local | **GO** | Evidencias citadas; no equivalen a restore remoto |
| Acceso remoto Read | **Confirmado en 2C.4** | Revalidar en ventana con autorización de lectura |
| Plan de credencial Write mínima | **Listo para aprobar** | Operador y autorización A; no se creó token |
| Config/launcher de operación exactos | **Pendiente** | Preparación local revisada, allowlist, redacción de errores y pruebas antes de usar Write |
| Preflight remoto actualizado | **NO-GO hasta verificar** | Autorización B y resultado esperado |
| Export/bookmark/custodia y ensayo local del export real | **NO-GO hasta verificar** | Autorización C y evidencia del respaldo, sin migraciones |
| Aplicar 0001–0006 a DEV | **NO-GO sin aprobación** | Autorización D, gates previos completos, aceptación por etapa |
| Bootstrap | **NO-GO independiente** | Autorización E, identidades/lote/mecanismo probado |
| Restore remoto | **NO-GO independiente** | Autorización F con incidente, destino y punto exactos |
| Deploy/bindings/Cron/Admin/Images/R2 | **Fuera de alcance** | Otras fases y aprobaciones |

Autorizaciones separadas propuestas:

- **A — Credencial:** permitir al operador crear y revocar un token D1 Write temporal para esta cuenta, reconociendo su alcance a otras D1 y los controles del ejecutor. No autoriza SQL.
- **B — Lectura:** permitir preflight de metadatos/esquema/ledger condicional de la D1 exacta. No autoriza crear ledger ni migrar.
- **C — Respaldo:** permitir Time Travel info y export SQL de esta D1, descarga protegida y prueba de importación local. No autoriza restore ni migraciones remotas.
- **D — Ejecución:** permitir inicialización de `d1_migrations` y los seis archivos/hashes exactos, una etapa por vez, más sus checks de lectura, en la ventana aprobada. Ante fallo, detenerse.
- **E — Bootstrap:** permitir exclusivamente el lote posterior revisado para identidades reales verificadas y auditoría. No implícito en D.
- **F — Recuperación:** aprobar por incidente forward-fix o restore exacto, con alcance de pérdida de datos y verificaciones; no implícito en disponer de Write.

**Próximo paso recomendado:** revisar este plan y aprobar primero la preparación local del ejecutor fijo y, por separado, A/B/C. Solo con preflight y respaldo aceptados solicitar D. No crear credenciales ni ejecutar escrituras remotas durante la revisión actual.

## 11. Fuentes oficiales y archivos de esta fase

Documentación pública consultada; no son consultas autenticadas de la cuenta:

- [Migraciones D1](https://developers.cloudflare.com/d1/reference/migrations/): historial, nombre de base y configuración de patrones.
- [Comandos Wrangler D1](https://developers.cloudflare.com/d1/wrangler-commands/): apply, confirmación, rollback de una migración y comandos Time Travel.
- [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/): bookmarks, retención por plan, restauración sobre la misma base.
- [Importación y exportación](https://developers.cloudflare.com/d1/best-practices/import-export-data/): export SQL, importación y bloqueo durante export.
- [Permisos API](https://developers.cloudflare.com/fundamentals/api/reference/permissions/): D1 Read/Write como permisos de cuenta.

También se inspeccionó el código de Wrangler instalado: `initMigrationsTable`, `buildMigrationQuery`, selección por `migrations_pattern` y aplicación. No se instaló ni actualizó dependencia alguna.

Único archivo nuevo entregable de esta fase: `docs/PHASE-2C5-D1-MIGRATION-PLAN.md`. Los demás artefactos nuevos son ensayos y salidas locales ignorados bajo `.wrangler`; los builds regeneraron salidas locales ignoradas. SQL, manifiesto, configuraciones existentes y scripts de aplicación permanecen sin cambios. **Se detiene para revisión.**
