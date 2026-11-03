# Servicios DEV — operador único: preparación y parada de seguridad

Fecha: 2026-10-27, America/Costa_Rica. **NO-GO remoto por diferencia de baseline.** El recorrido completo pasó localmente; no se aplicó 0007 ni se desplegó esta versión.

## Estado remoto comprobado

- Worker desplegado sigue en la versión `327af77c-43fd-4b2a-8e11-7478a9ee4074`, del informe `DEV-ADMIN-API-INTEGRATION.md`. No se ejecutó `wrangler deploy` real en esta tarea.
- D1 fija: cuenta `7a8bcd7992a3de359d2aff87df2fb693`, nombre `kuwago-admin-db-development`, UUID `c5cfbe44-4fd0-4c2a-83c1-b833935534ba`.
- La consulta posterior confirmó **6 migraciones, 2 principales, 0 servicios, 0 categorías y 0 imágenes**. No hay un servicio de prueba remoto que retirar o archivar.
- Access, Hostinger, DNS y producción no se modificaron. R2 e Images no recibieron objetos ni transformaciones de esta tarea.
- URL actual: https://kuwago-admin-api-development.ch-jesus-99.workers.dev/#services . Sigue siendo la versión de comprobación con mutaciones deshabilitadas.

## Respaldo autorizado: PASS

Una única exportación completa, autorización `b1c35aab-1bbe-490f-b527-1fe83ebaee3c`.

- Operation ID: **`c1763339-d083-45d7-9e81-934ee8da840a`**.
- Artefacto: `C:\Users\JV\AppData\Local\Kuwago\D1Backups\development\c1763339-d083-45d7-9e81-934ee8da840a\backup.kwgbak`.
- SHA-256 cifrado: `cbaddebd53928bb23e4cc214c1ab5a687de396ef1b2b5dfdf738d76c637bb363`.
- Fingerprint fuente: `e3d31cc7faad05819f5eaa40fcf88662c602a5aad7c8df8ffbebf84a24b1bfa8`.
- AES-256-GCM, DEK protegida con DPAPI y recuperación con la clave existente. Carpeta NTFS fuera del repositorio, ACL del operador y SYSTEM comprobadas.
- Descifrado por DPAPI y por recuperación independiente, integridad de bytes cifrados y restauración exacta en SQLite aislada: **34 tablas, 133 filas**.
- Bookmarks primero/medio/último iguales, snapshots completos iguales; tiempos UTC `22:11:31.992Z`, `22:11:39.298Z`, `22:11:46.259Z`. No se publican los valores del bookmark.
- `verified`, `cleanupComplete`, `credentialDisposed`: true. La autorización fue consumida y se volvió a bloquear; no se sobrescribieron respaldos anteriores.

## Intentos de 0007: ninguna escritura enviada

1. ID `9e432251-5254-4b10-bd46-94716236c1cd`: **0 envíos**. Falló localmente la protección del bookmark, antes de intención/envío. La causa se reprodujo: el wrapper DPAPI existente acepta 32 bytes, no la representación textual del bookmark. Se corrigió usando el mismo empaquetado BKM1 de las herramientas anteriores y se verificó su roundtrip local. No se alteró el wrapper de claves ni se repitió SQL.
2. ID `a87aff45-588a-489a-9888-f15051a00ccc`: **0 envíos**, `logical_baseline_changed`, antes de intención de escritura. No se creó checkpoint de éxito ni cierre PASS.

Evidencias intactas en la carpeta de custodia, prefijos `policy7-<ID>.*.json`. Las entradas privadas se limpiaron al finalizar los procesos; no se solicitaron ni almacenaron tokens/JWT por chat. El permiso `policyMigrationApproved` quedó false.

## Diferencia comprobada y límite del diagnóstico

El respaldo contiene **72 eventos de auditoría**, el último a `2026-10-27T22:10:27.426Z`. La consulta D1 posterior encontró **80 eventos**, el último a `22:13:53.322Z`.

Los ocho eventos posteriores son `security.authorization`, tipo `permission`, resultado `allowed`, incluidos accesos `media:prepare` y `media:read-private`. El middleware existente escribe esos registros incluso para solicitudes administrativas GET o acciones cuya operación comercial termina bloqueada. Por tanto, existe una diferencia lógica real en auditoría, aunque no haya contenido comercial creado.

Los recuentos de servicios/categorías/imágenes permanecen en cero. **Esos recuentos no equivalen a una comparación integral de todas las demás tablas**: no se afirma que la auditoría sea la única diferencia posible. Se requiere una nueva comparación completa antes de cualquier escritura.

No se relajó la guarda, no se adoptó una respuesta remota como referencia de corrección y no se repitió el export. La instrucción de detenerse ante diferencias impide continuar automáticamente con la migración o el despliegue.

## Cambio local preparado

### Migración 0007

Archivo: `packages/database/migrations/0007_single_operator_approval.sql`.

SHA-256: **`9faa376529152202d4df5f2c052c0fcaf2f8849cb6513c1e0b904188731074d9`**. Las migraciones 0001–0006 conservan sus hashes; el manifiesto incorpora 0007 como séptima entrada pendiente, no como aplicada.

- `commercial_approvals.approval_mode`: `independent` o `super_admin_self`.
- Trigger de aprobación: principal habilitado y rol canónico admin/super_admin; creador distinto para aprobación independiente; mismo creador únicamente con rol super_admin y modo explícito.
- Reconstrucción transaccional de `media_assets` para reemplazar su CHECK de independencia por la misma excepción explícita. Conserva columnas, identidades, referencias, límites y triggers existentes; añade `approval_mode` y guardas de rol/inmutabilidad.
- No habilita el actor técnico, no crea personas ni modifica membresías.
- La validación FK completa dentro del lote precede al final de `defer_foreign_keys`; **nunca se desactiva `foreign_keys`**. Esto evita el contador diferido obsoleto de SQLite al reconstruir una tabla con hijos. Se probó con imagen y registro hijo existentes.
- `dev_image_transform_claim`: un único registro, vinculado al media ID/hash, para consumir de manera persistente la autorización limitada de Images antes de contactar al procesador. Tras 0007 serían 33 tablas de aplicación, todavía no presentes remotamente.

### API, RBAC y auditoría

- Servicios e imágenes requieren `confirmSelfApproval: true` además de la confirmación comercial/derechos; el servidor calcula si se trata de autoaprobación y exige rol super_admin. No acepta un rol ni modo de aprobación impuesto por el cliente.
- Persistencia del modo y eventos transaccionales `service.super_admin_self_approved` y `media.super_admin_self_approved`.
- Admin y Editor conservan la separación de creador/revisor y todos sus demás límites.
- Se conservan validación bilingüe, moneda explícita, imágenes aprobadas, revisión sellada, control de versión/409, Access/JWT, CSRF, auditoría y outbox.
- Cliente y formularios añaden confirmación explícita bilingüe de autoaprobación. Los mensajes DEV identifican datos reales de prueba; no cambian el diseño ni la landing.

### Infraestructura preparada, sin desplegar

- Mutaciones configurables exclusivamente en DEV; configuración normal `wrangler.development.json` permanece en false.
- Candidato `wrangler.services-development.candidate.json`: DB existente; PRIVATE_MEDIA y PUBLICATION sobre el mismo R2 privado, Images Binding, reconciliación cada minuto. No crea buckets/Workers ni abre un endpoint público.
- PUBLICATION comparte temporalmente el bucket privado existente, con claves separadas. No debe considerarse una arquitectura pública definitiva; antes de exponer el catálogo se debe revisar aislamiento de almacenamiento y permisos.
- Preview del DTO público detrás de Access/RBAC en `/api/v1/catalog/preview`; utiliza el Worker público existente internamente y su barrera D1. No conecta grupokuwago.com ni expone un nuevo hostname público.
- Mantenimiento DEV opcional: rechaza solicitudes antes del middleware que escribe auditoría y pausa Cron. Preparado y probado para permitir una ventana estable de respaldo; **no desplegado**.
- Ambos candidatos tienen `main` bloqueado mediante una ruta inexistente. No pueden desplegarse accidentalmente hasta revisar y desbloquear la preparación.

### Images: permiso acotado conservado

El usuario autorizó una sola PNG sintética, no una activación de suscripción ni uso ilimitado.

- Fixture local: `infra/cloudflare/dev/.wrangler/dev-integration/SOLO-PRUEBA-DEV.png`, 64×64, 238 bytes, sin datos privados.
- SHA-256: `d6c7e689270a8dc7190983f4da4a5e663ae08b78e553d44e0199babbbe14cca1`.
- La configuración candidata acepta solo ese hash y PNG; límite máximo existente 2 MiB. Consume un único claim D1 antes de Images. Si el servicio falla, el claim permanece consumido y el archivo queda en cuarentena, sin reintento automático.
- No se permite JPEG/WebP remotamente en esta prueba. El soporte local anterior permanece para sus pruebas existentes.
- **Transformaciones remotas ejecutadas en esta tarea: 0.** Binding, Cron y nueva versión aún no desplegados.

## Validación local

- Respaldo/custodia/cifrado/restauración y fallos: 12/12 pruebas existentes; perfil post-Admin: 1/1.
- Migración/SQL y ejecutor: 5/5, incluyendo preservación de referencias, autoaprobación exclusiva, concurrencia, respuesta perdida después del commit sin replay y persistencia fallida con cero envíos.
- Corrección BKM1/DPAPI: 1/1.
- Regresiones catálogo y multimedia: 46/46 con D1/R2 locales.
- Nuevo recorrido API: crear borrador → editar ES/EN/precio → conflicto 409 → aprobación explícita → publicación → catálogo aprobado → retirada → catálogo vacío → archivo: PASS en workerd/D1 local. Borradores ausentes del DTO público; eventos de autoaprobación comprobados.
- Claim de Images: PASS local, una transformación simulada fallida, segundo intento bloqueado sin contacto adicional y cuarentena persistente.
- TypeScript y builds backend/Admin: PASS. Lint de archivos backend cambiados y Admin: PASS. Aislamiento de landing/Admin: PASS.
- Admin: 31/31 regresiones; cliente actualizado con confirmación explícita: 13/13 del archivo dirigido (incluye el caso nuevo). Una ejecución inicial conservó por error la variable de build DEV y falló una expectativa exclusiva del modo local; al separar los entornos, la suite local pasó. No se alteró esa expectativa para ocultarlo.
- Dry-run de la configuración candidata, antes de bloquear `main`: PASS, con DB/R2/Images/ASSETS y variables previstas. No hubo upload.
- No se ejecutó el recorrido navegador remoto ni se reutilizó un PASS local como evidencia de producción.

## Archivos de esta tarea

- Base de datos: `0007_single_operator_approval.sql`, `packages/database/migrations.sha256.json`; copia preparada en `infra/cloudflare/dev/next-stage/`.
- Backend: `src/development.ts`, `src/catalog/{publication,routes,types}.ts`, `src/multimedia.ts`.
- Admin: `src/api/admin-client.ts`, `src/features/services/{ApiServiceEditor,MediaLibrary}.tsx`, `api-copy.ts`, `src/deployment.ts`, `src/test/AdminClient.test.ts`.
- Respaldo: `scripts/safe-d1/{backup-current-admin,backup-current-permit}.mjs`, `backup-only.mjs`, `backup-transport.mjs`, `scripts/d1-backup-current-{private,status}.mjs`, `scripts/backup-once-private.ps1`.
- Migración: `scripts/{prepare-single-operator-policy,single-operator-migration,d1-policy-migration-private}.mjs`, `scripts/safe-d1/bookmark-protection.mjs`, `scripts/migrate-policy7-private.ps1`.
- Pruebas: `test/{current-admin-backup,single-operator-migration,single-operator-api,bookmark-protection,development}.test.mjs`.
- Configuraciones: `wrangler.development.json` (segura, mutaciones false), candidatos de servicios y mantenimiento bloqueados.

## Próximo paso remoto: requiere autorización nueva de respaldo

1. Autorizar una ventana breve de mantenimiento **solo DEV**, conservando Access, para impedir nuevas escrituras de auditoría durante el respaldo/migración.
2. Autorizar **otro único respaldo completo** con ID nuevo: la autorización original ya fue consumida. Captura privada del token y clave existente; destino fijo; comparación integral antes/después/restauración, cifrado y conservación de todos los respaldos anteriores.
3. Solo con ese estado estable y verificado, preparar otro ID para 0007, conservar los dos intentos sin envío, comparar esquema/historial/filas/fingerprint y enviar el lote una vez. El oracle local determina todo el resultado; ante respuesta ambigua, exclusivamente reconciliación de lectura.
4. Postflight integral y cierre durable; después desbloquear el candidato DEV, habilitar el binding Images acotado y Cron; verificar Access y Super Admin.
5. Procesar la única PNG autorizada y ejecutar el recorrido real de prueba. Archivar el servicio y retirar la imagen mediante los flujos normales; preservar referencias históricas y no eludir retención.
6. Conectar más adelante el adaptador público de Services mediante una autorización distinta. No apuntar Hostinger al catálogo de prueba ni reutilizar credenciales administrativas en el sitio público.

No se solicita otra aprobación de la política de autoaprobación ni del uso de esa única PNG: ya fueron autorizados. El alcance adicional pendiente es el **nuevo respaldo**, porque la guarda detectó estado posterior al único export permitido.

Referencias oficiales consultadas: https://developers.cloudflare.com/d1/sql-api/foreign-keys/ y https://developers.cloudflare.com/images/optimization/binding/ (los usos de Images contabilizan transformaciones; no se contrató ni activó ningún producto).
