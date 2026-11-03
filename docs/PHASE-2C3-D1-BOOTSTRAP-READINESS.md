# Fase 2C.3 — Preparación D1 DEV y bootstrap

24/10/2026 · America/Costa_Rica · Lecturas remotas de metadata y preparación/pruebas locales.

**Resultado: preparación local aprobada; NO-GO para migrar o dar de alta administradores remotamente.** Las seis migraciones se aplicaron desde cero a destinos aislados, su segunda aplicación no encontró migraciones pendientes y la restauración local quedó pausada, con nueva época y sin publicaciones. El acceso D1 mediante la sesión Wrangler existente sigue devolviendo 10000 aun con cuenta y UUID explícitos. No se creó ninguna credencial ni se amplió OAuth.

El usuario comunica que, después de 2C.2, Google Authenticator funciona, la cuenta Google autorizada llega a Hello World y otra cuenta es rechazada. También confirmó reutilización de la política para App Launcher sin crear otra política. Se acepta como **evidencia manual actualizada del usuario**; no se repitieron logins ni se cambió Access. La ausencia de MFA observada en 2C.2 no se presenta como el estado actual. Eso no concede permisos D1 a Wrangler ni roles en la aplicación.

## 1. Inventario y diagnóstico del acceso

Metadatos documentados y verificados en 2C.2:

| Recurso | Identificador |
|---|---|
| Cuenta | `7a8bcd7992a3de359d2aff87df2fb693` |
| D1 DEV | `kuwago-admin-db-development` |
| D1 UUID | `c5cfbe44-4fd0-4c2a-83c1-b833935534ba` |
| Worker existente | `kuwago-admin-api-development` |
| R2 privado | `kuwago-media-development` |

El último Dashboard auditado mostró D1 sin tablas y Time Travel disponible. No se certifica un nuevo estado de tablas en esta fase porque **no se ejecutó SQL remoto**. Antes de migrar debe actualizarse ese inventario.

### Comprobaciones nuevas

- Wrangler instalado: **4.152.0**; sesión OAuth existente autenticada, una cuenta accesible que coincide con la documentada.
- Scopes declarados: `user:read`, `offline_access`, `account:read`, `workers:write`, `workers_scripts:write`, `workers_routes:write`, `zone:read`. No aparece D1. Los scopes son evidencia de la sesión, no una prueba universal de las capacidades de todos los productos.
- No se encontraron overrides en las variables comprobadas de cuenta, API token/key/email, perfil o endpoint Cloudflare/Wrangler. Solo se imprimió su presencia/ausencia, nunca valores sensibles.
- Se ejecutaron las consultas desde cwd temporal, fuera del repositorio, para excluir carga accidental de sus configuraciones/archivos de entorno.

| Consulta de metadata | Resultado |
|---|---|
| `d1 list --json`, selección normal de cuenta | Error Cloudflare **10000**, autenticación/autorización |
| Mismo listado con cuenta explícita en config temporal | Mismo 10000 |
| `d1 info DB --json`, binding temporal con nombre/UUID exactos | Mismo 10000 sobre endpoint D1 |

La configuración temporal contenía únicamente metadatos, sin secretos ni código de Worker, y no se guardó en el repositorio. Los errores reportaron `/d1/database`, no timeout ni fallo de parseo local. La lectura `info` falló en D1 antes del paso adicional de analítica.

### Diagnóstico diferencial

| Hipótesis | Evaluación |
|---|---|
| Sesión completamente ausente/caducada | No respaldada por `whoami` actual; no excluye un problema específico de autorización D1 |
| Cuenta incorrecta por selección automática | Se redujo esta posibilidad al fijar la cuenta documentada y reproducir el mismo fallo |
| Variables o config del proyecto equivocadas | No explican por sí solas el fallo del listado fuera del repositorio; no hubo overrides observados |
| Nombre/binding/UUID incorrectos | La consulta con binding y UUID de 2C.2 falla igual; sigue siendo obligatorio cotejarlos antes de escribir |
| Autorización efectiva D1 insuficiente | **Explicación principal compatible con los datos**, dada la ausencia de D1 declarado y el rechazo del endpoint |
| Defecto de Wrangler o de su integración OAuth | **No demostrado ni descartado por completo**. No se comparó el mismo credential contra REST con otro cliente ni se instaló otra versión |
| Access/MFA del Worker | Es otro plano de identidad. Un login correcto del usuario no otorga permisos de gestión Cloudflare API a la sesión CLI |

El código 10000 es genérico: no se declara una causa exclusiva con certeza. Próxima discriminación, con una credencial de lectura **previamente autorizada**: comparar GET de la D1 exacta con REST y Wrangler. Si ambos fallan, revisar autorización/restricciones/cuenta; si REST funciona y Wrangler falla, revisar resolución de credencial/configuración/CLI. No extraer el token interno OAuth ni pedir secretos por chat para hacer esa comparación.

### Dos particularidades de Wrangler verificadas en el código instalado

1. **`d1 migrations list` no es una lectura pura sobre una base sin historial.** Su handler llama a `initMigrationsTable`, que ejecuta `CREATE TABLE IF NOT EXISTS d1_migrations`, antes de listar pendientes. No se ejecutó remotamente. Para inspección read-only, comprobar primero `sqlite_schema` y leer el ledger solo si existe, mediante consultas de lectura explícitas cuando estén autorizadas.
2. **`d1 info` incluye analítica GraphQL además de GET de metadata.** Un fallo posterior en métricas podría ser una capacidad adicional del CLI; no justificar ampliar permisos Analytics para obtener un UUID. En esta fase el error se produjo en el endpoint D1, no en GraphQL. Preferir GET directo de metadata para una aceptación mínima de permisos.

Referencia de implementación: `infra/cloudflare/dev/node_modules/wrangler/wrangler-dist/cli.js`, módulos `src/d1/info.ts` y helpers/handlers de migraciones. Son dependencias instaladas, no fuentes modificadas.

## 2. Permisos exactos y alcance mínimo

| Necesidad | Permiso mínimo propuesto | Límites |
|---|---|---|
| A. Listar/get metadata D1 | **Account / D1 / Read** | GET de listado o D1 exacta; sin SQL ni cambios |
| B. Inspeccionar esquema/datos necesarios con SELECT | **Account / D1 / Read** | Solo sentencias de lectura revisadas; no usar `migrations list` como sustituto |
| C. Aplicar migraciones después de autorización | **Account / D1 / Edit**, llamado **D1 Write** en la referencia API | Permite escribir, no solo aplicar un archivo. Exige controles de objetivo y aprobación separados |
| Bootstrap o revocación D1 por operador | D1 Edit/Write | Autorización independiente de migrar; identidad y lote exacto revisados |
| Runtime administrativo | Binding D1 + JWT/RBAC del servidor | No colocar un API token D1 en React o en el bundle Worker para sustituir el binding |

Fuentes oficiales: [permisos](https://developers.cloudflare.com/fundamentals/api/reference/permissions/), [listar D1](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/list/), [metadata de D1](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/) y [query D1](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/). El endpoint query acepta Read/Write, pero eso **no** significa que Read autorice SQL mutante: las [notas oficiales](https://developers.cloudflare.com/d1/platform/release-notes/#2025-05-02) explican que las escrituras requieren Edit tras corregir un bug previo.

Una consulta SQL de lectura usa POST `/query`; el verbo HTTP por sí solo no determina si cambia datos. Esta fase prohíbe SQL remoto, por lo que no se envió ni siquiera un SELECT. En la fase de inspección autorizada posterior, limitar a consultas concretas de catálogo/ledger y PRAGMA de lectura admitidas. No considerar todo PRAGMA read-only: `optimize`, cambios de constraints y otras variantes pueden modificar comportamiento o datos.

### Granularidad real del credential

La documentación pública de [políticas de token](https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/#resources) define recursos User, Account y Zone. D1 aparece como permiso de cuenta. **No se encontró una restricción documentada de ese permiso a un único UUID D1.** No prometer un token «solo esta base» si el selector real solo ofrece cuenta.

Propuesta: una sola cuenta concreta, nunca «todas las cuentas», sin Workers Edit, R2, Access, DNS, Images, administración de tokens o usuarios. El aislamiento de una D1 dentro de esa cuenta se completa con un operador/herramienta que rechace cualquier UUID distinto; eso no convierte el permiso Cloudflare subyacente en una ACL por base. Si el selector real ofrece una capacidad más granular verificable al prepararlo, evaluarla y documentarla sin inventar su sintaxis.

## 3. Procedimiento de credenciales mínimas — sin ejecutarlo

1. Aprobar primero el propósito **solo lectura** y el recurso/cuenta exactos. Un administrador de cuenta prepara, fuera del chat, una credencial D1 Read limitada a esa cuenta y con caducidad acotada. No ampliar automáticamente el OAuth existente para todo Wrangler.
2. Elegir token de usuario o de cuenta según las capacidades del administrador y la organización; revisar el resumen efectivo de permisos y recursos. Usar TTL y restricción de IP solo si la salida de red es conocida/estable. No añadir permisos de creación de tokens al credential de uso.
3. Guardar y utilizar el valor mediante el mecanismo seguro del operador/CI aprobado; nunca en Git, archivos de ejemplo, argumentos de comando, logs, `VITE_*` o mensajes. No se solicita ningún secreto en esta fase.
4. Fijar `account_id` y D1 UUID en una configuración DEV separada y revisada. No modificar `wrangler.local.json`, que prohíbe IDs reales y debe seguir aislada. La candidata remota actual conserva placeholders y entrypoint bloqueado: aún no es un archivo ejecutable aprobado.
5. Comprobar GET de la base exacta y después inspección SQL de lectura **con autorización expresa para esa fase**. No añadir permisos globales solo para que `whoami` o analítica accesoria funcionen; conocer el account ID evita descubrimiento innecesario.
6. Solo al autorizar migraciones, utilizar otra credencial de duración corta con D1 Edit/Write y cuenta fijada. Su permiso también puede modificar otras D1 de esa cuenta: el procedimiento debe rechazar objetivos arbitrarios.
7. Retirar la capacidad temporal al terminar la intervención, según el procedimiento de revocación aprobado; conservar evidencia de quién, cuándo, cuenta, DB, acción y resultado, sin credential. Revocar o crear tokens son acciones futuras de seguridad, no realizadas aquí.

Para backups/exportaciones, validar los requisitos del endpoint/herramienta en su fase específica; no asumir que todo comando auxiliar funciona con el mismo Read. Un respaldo no debe ser motivo para conceder Workers/Access/DNS innecesarios.

## 4. Migraciones, dependencias y repetibilidad

| Archivo | Dependencia / función relevante |
|---|---|
| 0001_admin_catalog.sql | Principals, roles históricos, catálogo ES/EN, revisiones, precios, imágenes y auditoría; referencias circulares de servicio/revisión diferidas |
| 0002_integrity_guards.sql | Refuerza integridad, revisión inmutable y controles de aprobación/publicación sobre 0001 |
| 0003_access_rbac.sql | Roles canónicos `editor/admin/super_admin`; no hereda grants legacy, no crea personas; concesión a sí mismo prohibida |
| 0004_catalog_operations.sql | Versiones/CAS, comandos y reconstrucción conservadora de tablas de publicación; requiere preservar revisiones y referencias existentes |
| 0005_publication_resilience.sql | Épocas/generaciones, outbox recuperable, leases, alertas y recuperación sobre el modelo anterior |
| 0006_media_lifecycle.sql | Procesamiento y versiones multimedia, guardas de estado y límites; depende de catálogo, principals y media existentes |

Se detectan exactamente esos seis archivos; todos coinciden con `packages/database/migrations.sha256.json`. No se cambiaron SQL, orden ni hashes.

Wrangler usa `d1_migrations` como historial, con nombre único y fecha de aplicación. **Repetir `migrations apply` no equivale a volver a ejecutar los seis SQL manualmente.** Los archivos no pretenden ser individualmente reentrantes; el ledger controla pendientes. La segunda pasada local mostró que no había migraciones por aplicar, aunque el CLI siga comprobando/inicializando el ledger internamente.

La [documentación de comandos](https://developers.cloudflare.com/d1/wrangler-commands/#d1-migrations-apply) indica rollback de la migración fallida y permanencia de las anteriores correctas. No asumir que la cadena completa 0001–0006 es una sola transacción. Un fallo exige detenerse, examinar historial e integridad y aprobar la recuperación/forward-fix; no borrar el ledger para forzar un replay.

### Prueba nueva, reproducible y local

Se creó `infra/cloudflare/dev/scripts/d1-readiness-local.mjs`:

- Acepta **cero argumentos**, comprueba la configuración local y la lista exacta de seis SQL/checksums.
- Solo invoca Wrangler con `--local`, config local validada y persistencia en directorios nuevos, separados de la D1 local habitual.
- Elimina variables Cloudflare/Wrangler de los subprocess y utiliza directorio de configuración aislado; no requiere autenticación para los tests.
- Aplica las seis migraciones al origen vacío y repite la aplicación; crea otro destino vacío con las seis migraciones.
- Comprueba ledger, `PRAGMA quick_check`, FK y ausencia de principals/asignaciones.
- Genera respaldo lógico y archivo multimedia del origen **vacío local** y restaura solo al otro destino local.
- Comprueba nueva época, modo pausado, cero publicaciones, ledger preservado, almacenamiento local consistente y origen sin modificar.

Resultado final:

```json
{
  "localOnly": true,
  "remoteOperations": 0,
  "checksumCount": 6,
  "freshMigrationCount": 6,
  "secondApplyNoop": true,
  "ledgerPreserved": true,
  "quickCheck": "ok",
  "foreignKeyViolations": 0,
  "principalsCreated": 0,
  "administratorsCreated": 0,
  "restore": {
    "isolated": true,
    "mode": "paused",
    "newEpoch": true,
    "publishedCount": 0,
    "mediaComplete": true,
    "sourceUnchanged": true
  }
}
```

La prueba nueva vacía no sustituye la cobertura con contenido existente. Se ejecutaron además **81/81 pruebas** de configuración/checksums, SQL relacional, auditoría/actualización, autorización, resiliencia y multimedia. Usan fixtures sintéticos efímeros: cubren preservación de filas/revisiones, fallos de reconstrucción, integridad, restauración parcial, objetos ausentes, cuarentena y no republicación. No constituyen altas de personas reales ni bootstrap en DEV habitual.

Build/TypeScript backend y lint correctos. No se repitieron frontend/E2E porque no cambiaron. No se instalaron dependencias ni se tocó el esquema.

### Fallos locales encontrados y separados del 10000 remoto

- El primer destino de restore generó un `internal error` en Wrangler con rutas SQLite/sidecars de hasta aproximadamente 256 caracteres. Acortar el identificador del directorio aislado permitió aplicar la cadena en ese destino. Es evidencia de sensibilidad de ruta/entorno Windows local; no se demuestra la función nativa exacta que falló ni que ese sea el origen del 10000 remoto.
- `PRAGMA integrity_check` por el binding D1 local devolvió `SQLITE_AUTH`. Se sustituyó por **`PRAGMA quick_check` + `foreign_key_check`**, admitidos por la [API SQL de D1](https://developers.cloudflare.com/d1/sql-api/sql-statements/#pragma-quick_check). No se declara haber pasado un integrity_check completo ni se desactivaron constraints.

Estas diferencias muestran por qué no se debe interpretar cualquier «not authorized» o error de Wrangler como un problema de OAuth: aquí ocurrieron en bases locales sin credenciales remotas.

Desde la raíz:

```powershell
npm --prefix packages/contracts run build
npm --prefix infra/cloudflare/dev run build
node infra/cloudflare/dev/scripts/d1-readiness-local.mjs
npm --prefix infra/cloudflare/dev run lint
```

Regresiones ejecutadas, desde `infra/cloudflare/dev`:

```powershell
node --test test/config-storage.test.mjs test/database.test.mjs test/catalog-audit.test.mjs test/authorization.test.mjs test/resilience.test.mjs test/multimedia.test.mjs
```

Evidencias ignoradas por Git: `.wrangler/phase2c3/regression-tests.txt` y `.wrangler/phase2c3/run-f5c6d942b0b4/result.json`, backup vacío y logs locales. Se conservan los ensayos fallidos previos para diagnóstico; el resultado final es el JSON de esa carpeta. Ningún destino es la persistencia habitual de DEV ni una base remota.

## 5. Plan previo de respaldo, migración y recuperación

### Preflight de lectura futuro

1. Confirmar cuenta/DB/UUID y ventana de intervención; evitar otras mutaciones y observar que no haya otra migración en curso.
2. Con acceso aprobado, leer metadata y schema real, comprobar si existe el ledger y leerlo solo si existe. Comparar nombre/orden de migraciones, no marcar manualmente archivos como aplicados.
3. Registrar conteos de servicios, revisiones, media, aprobaciones, auditoría, outbox y principals cuando existan. Verificar FK y checks de lectura soportados. No asumir que continúa vacía por el informe anterior.
4. Validar backups/destino/retención y el lote exacto antes de solicitar Write. No usar una credencial Write para descubrir a ciegas el objetivo.

### Respaldo antes de B

En una fase **autorizada para respaldo**, capturar un bookmark Time Travel fresco, exportación SQL/lógica e inventario R2 coherente, con hashes y acceso protegido. La documentación de [import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/) y Time Travel complementa, no reemplaza, el procedimiento coordinado. No se ejecutó respaldo remoto aquí.

Congelar escrituras durante la ventana coherente. Registrar época/generación/hash de publicación y objetos originales/derivados; D1 no respalda R2. Definir propietario de copias, cifrado, retención, RPO/RTO y forma de verificar que realmente pueden recuperarse. El backup automático asociado a una migración, si aplica, no sustituye el punto previo revisado.

### Migración futura

Autorizar expresamente cuenta, D1 UUID, seis SQL/checksums, lista real de pendientes, credential temporal, ventana y rollback. Usar configuración DEV independiente y nombre estable de base; no reutilizar un binding ambiguo ni cambiar `remote:false` del entorno local creyendo que es una barrera contra un comando CLI remoto.

Ejemplo conceptual **no ejecutado**, válido solo después de revisar ese archivo y autorización:

```text
wrangler d1 migrations apply kuwago-admin-db-development --remote --config <DEV_CONFIG_REVISADO>
```

No usar `--yes` o CI como sustituto de revisión/autorización. Al finalizar: historial exacto, quick_check/FK, conteos previos frente a posteriores, revisiones intactas, triggers/índices y cero altas privilegiadas inesperadas. No habilitar el backend o publicar contenido durante un esquema parcial.

### Recuperación

El procedimiento local conserva revisiones y auditoría, excluye el ledger del backup lógico de aplicación, restaura sobre un destino vacío compatible, cambia la época, pausa publicación, revoca aprobaciones y deja servicios retirados/borrador. El ledger del destino se crea aplicando sus migraciones: no copiar el del origen para simular que se aplicaron.

No mezclar indiscriminadamente una importación SQL completa con ese restore lógico y migraciones previamente aplicadas. Elegir y probar el método exacto. El actual CLI `recovery.mjs` es **local**, no una herramienta remota aprobada.

Ante fallo remoto futuro: mantener mantenimiento/escrituras cerradas, conservar origen/errores, comprobar qué archivos sí quedaron aplicados y decidir forward-fix o restauración autorizada. Recuperar D1 y objetos R2 a un destino aislado coherente, verificar hashes/referencias y volver con nueva época, sin republicar snapshots históricos. Time Travel sobre la base activa sobrescribe su estado: requiere autorización específica, no un clic rutinario de rollback.

Los límites actuales del restore lógico/local son 20 MB para su documento de DB; archivo multimedia de hasta 50 MB/1.000 entradas, con límite serializado de 70 MB. Acordar otro método antes de excederlos, no omitir validaciones.

## 6. Primer Super Admin: procedimiento explícito

**Diseñado, todavía no ejecutable con personas reales.** No se generó un SQL de altas con sujetos inventados ni un endpoint de bootstrap accesible por HTTP.

1. **Aprobación humana:** identificar destinatario y segundo concedente/revisor, con personas y responsabilidades explícitas. El `CHECK(principal_id <> granted_by)` exige otro principal; no crear un «operador ficticio» para saltarlo. Si falta acceso de la segunda persona, resolverlo mediante autorización Access aparte.
2. **Identidad verificada:** obtener evidencia Access del destinatario y concedente mediante un mecanismo operador seguro que verifique RS256/JWKS fijo, issuer, AUD y tiempos; extraer únicamente el par `issuer + sub` y la correspondencia humana aprobada. No aceptar un correo, un subject escrito por el navegador o claims sin verificar. El mecanismo de adquisición efímera para personas reales debe revisarse antes del bootstrap; no se solicitan JWT o secretos en el chat.
3. **Aplicación correcta:** los valores documentados de la app Worker son issuer `https://blue-bread-0e64.cloudflareaccess.com` y AUD `dd73f3792def5ce94841273f79026f08e326c98d6fd98925ba0551196bb16adc`. Revalidarlos para el destino definitivo. **El App Launcher no concede RBAC ni sustituye la AUD de la app administrativa**, aunque se reutilice la política. Una app nueva de gateway puede requerir otra AUD aprobada en gateway/API.
4. **Preflight D1:** buscar por `(issuer, subject)` y por ID interno; revisar principal deshabilitado existente, roles legacy/canónicos y auditoría. No hacer upsert que habilite una cuenta o cambie roles silenciosamente. Sin principal inequívoco o ante discrepancia, detenerse.
5. **Lote aprobado:** preparar la creación/activación explícita de los principals necesarios, la asignación canónica del primer `super_admin`, el concedente real y el evento de auditoría en un lote atómico con precondiciones. No usar el middleware ordinario como si ya existiera un super_admin: esta es una excepción inicial de operador Cloudflare aprobada, no una capacidad concedida a un editor/admin desde React.
6. **Atomicidad demostrada:** probar localmente el mecanismo operador exacto de ejecución y su rollback antes de usarlo remoto. El D1 `batch()` probado es transaccional; no asumir que varios comandos Wrangler separados forman una transacción. Ante carrera/conflicto o auditoría fallida, ninguna concesión parcial debe sobrevivir.
7. **Evitar duplicados:** usar la unicidad existente de `(issuer, subject)` y `administrator_roles.principal_id`, más precondición transaccional. Una repetición solo puede declararse ya aplicada tras verificar la identidad/rol y el registro de la misma operación; una diferencia no autoriza sobrescritura. No usar `INSERT OR REPLACE` para roles/principals.
8. **Auditoría:** registrar operación, actor/concedente real, destinatario interno, rol, fecha, motivo/aprobación y resultado; nunca JWT/credenciales. No fabricar un actor retrospectivo. La auditoría de aplicación no es inmutable frente a un operador D1 capaz de cambiar triggers: proteger también evidencia externa.
9. **Aceptación:** verificar sesión/rol del destinatario, denegación de otras cuentas/roles, ausencia de grants automáticos y revisión independiente para contenido. La gestión de administradores por API continúa reservada; bootstrap no vuelve funcional un panel de altas.

### Revocación y recuperación

- Deshabilitar el principal y retirar/cambiar su rol mediante operación explícita y auditada; el backend vuelve a consultar D1 por request y revalida mutaciones. No basta con ocultar un botón.
- Revocar sesiones/acceso en Access o Google cuando corresponda, mediante autorización distinta. No prometer invalidación instantánea de todo JWT o borrado de contenido ya renderizado.
- Preparar segundo humano y acceso de emergencia de operador con MFA. Si el segundo solo es `admin`, no afirmar que puede gestionar super_admin desde la API: una recuperación inicial podría requerir otra operación excepcional de operador aprobada.
- Un cambio de correo no debe cambiar el vínculo; un cambio real de issuer/sub exige reconciliación humana, sin asumir igualdad de persona por email.

## 7. Bloqueantes y autorizaciones separadas

| Elemento | Estado / autorización siguiente |
|---|---|
| MFA/Google/Access | Verificado manualmente por el usuario después de 2C.2; no repetir activaciones ni crear políticas automáticamente |
| D1 metadata por Wrangler | Sigue denegada. Autorizar primero credencial **Read** o mecanismo equivalente; aceptar metadata antes de solicitar Write |
| Configuración remota D1 | IDs conocidos; completar/revisar candidato separado, sin habilitar deploy ni alterar wrappers locales |
| SQL/migraciones | Seis archivos probados localmente; requieren autorización específica de D1/UUID, pendientes y ventana |
| Respaldo remoto | Requiere autorización propia y evidencia verificable antes de migrar |
| Bootstrap | Faltan identidades/concedente y mecanismo operador exacto probado; autorización aparte, no incluida en migraciones |
| Restore/rollback remoto | Procedimiento, recursos destino y autorización específicos; no implícito en permiso Write |
| Backend/gateway/bindings/Cron | Permanecen fuera de esta fase, con autorización independiente |
| Multimedia | Se conserva la restricción pendiente de formatos/capacidades; ninguna operación Images autorizada aquí |

**Próximo paso recomendado:** autorizar únicamente la preparación por el operador de una credencial D1 Read para la cuenta concreta y una aceptación de metadata/lecturas de esquema expresamente limitada. Resolver la comparación REST/Wrangler si persiste el error. Después presentar el candidato de respaldo+migraciones para aprobación. No solicitar un token de edición amplio para probar si el problema desaparece.

## 8. Archivos y cierre

Nuevos:

```text
infra/cloudflare/dev/scripts/d1-readiness-local.mjs
docs/PHASE-2C3-D1-BOOTSTRAP-READINESS.md
```

Artefactos solo locales bajo `.wrangler/phase2c3/`. No se modificaron migraciones, permisos, configuraciones existentes, dependencias, backend de negocio, Admin ni landing. La D1 habitual de desarrollo tampoco se migró: los ensayos usan carpetas nuevas y fixtures efímeros.

Consultas remotas de esta fase: `whoami`, `d1 list` y `d1 info` para metadata; sin SQL remoto, sin `migrations list` remoto y sin backups/restores remotos. Sin tokens nuevos, cambios OAuth/Access, administradores reales, Workers desplegados, Images, DNS/Hostinger, commit ni push. Se detiene para revisión.
