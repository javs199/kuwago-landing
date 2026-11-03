# Fase 2C.5S — Preparación de respaldo completo D1

24/10/2026 · America/Costa_Rica · Integración y pruebas locales, sin acceso autenticado a Cloudflare.

**Estrategia elegida e integrada: exportación SQL completa + bookmark Time Travel del mismo estado + restauración local verificable.** Se retiró el baseline vacío como respaldo suficiente. El ejecutor ya bloquea si falta cualquiera de esas evidencias.

**GO técnico local para revisar esta estrategia; NO-GO para solicitar/usar una credencial en esta fase o migrar remotamente.** Quedan pendientes la confirmación del permiso mínimo del endpoint de exportación, las condiciones reales de descarga/formato, custodia del respaldo y autorizaciones separadas. No se creó token, no se exportó una base remota, no se ejecutó SQL remoto ni se modificaron D1/R2 reales, Workers, Access, DNS o Hostinger. Sin commit ni push.

## 1. Mecanismos oficiales y permisos

| Operación | Mecanismo / permiso | Evidencia y estado |
|---|---|---|
| Metadatos de la D1 exacta | GET `/accounts/{account}/d1/database/{id}`; **D1 Read** mínimo, también acepta D1 Write | Permisos enumerados por la [API oficial](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/). HTTP 200 histórico de 2C.4; no repetido aquí |
| Lecturas de esquema/integridad/datos para verificación | POST `/query`, exclusivamente SELECT/PRAGMA de lectura; **D1 Read** | El endpoint [query](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/) acepta Read/Write. El código limita las consultas; POST no implica que sea SQL mutante |
| Obtener bookmark Time Travel | GET `/time_travel/bookmark`; **D1 Read** mínimo, también acepta D1 Write | [Referencia oficial](https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/methods/get_bookmark/), permisos explícitos |
| Iniciar/consultar export completo | POST `/export`, `output_format: polling`, schema/data habilitados, sin filtro de tablas | La [referencia de export](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/) **no enumera Accepted Permissions**. Propuesta de mínimo privilegio: D1 Read; **no se presenta como capacidad comprobada ni requisito exacto confirmado**. Falta confirmación oficial o aceptación autorizada con Read; no ampliar automáticamente a Edit |
| Descargar SQL exportado | GET de la URL firmada emitida por ese trabajo | No se envía token API ni cookies; la URL temporal autoriza esa descarga. No se necesita añadir permisos de R2 al token solo para descargarla. Se mantiene fuera de archivos/logs |
| Verificar/restaurar localmente | SQLite aislado y D1 workerd local | **Ninguna credencial Cloudflare**; no requiere D1 Edit |
| Ejecutar las seis migraciones futuras | `/query` con batch cerrado; **D1 Write / Edit** | Escrituras SQL requieren esa capacidad. No habilitado en esta fase |
| Restaurar Time Travel remotamente | POST `/time_travel/restore`, operación destructiva separada | Diseño exige D1 Write/Edit, nunca Read como autorización de escritura. La [referencia de restore](https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/methods/restore/) tampoco publica Accepted Permissions; aceptación exacta pendiente. No se implementa ni prueba restore remoto |
| Crear/revocar credencial | Operador autorizado en Dashboard, autorización propia | No agregar administración de tokens a la credencial de uso |

**Límite de certeza:** quedan identificados los mínimos documentados de lectura y la capacidad de escritura para SQL. No existe evidencia suficiente en las fuentes consultadas para certificar la política exacta aceptada por `/export` o `/restore`. Este informe no convierte una inferencia por verbo HTTP en un permiso confirmado. No se consultaron endpoints de cuenta para resolverlo ni se pidió un token de prueba.

Para cerrar ese punto antes de una credencial de escritura: obtener confirmación de Cloudflare sobre export/restore y, si se autoriza una aceptación de export con Read, limitarla al objetivo y propósito exactos. Un 401/403/10000 detendrá la operación; no justifica ampliar permisos automáticamente. El token Read anterior fue eliminado por el usuario y no se reutiliza.

## 2. Separación de fases y destino

Destino invariable conservado:

```text
Cuenta: 7a8bcd7992a3de359d2aff87df2fb693
D1: kuwago-admin-db-development
UUID: c5cfbe44-4fd0-4c2a-83c1-b833935534ba
```

Los IDs proceden de 2C.3/2C.4. No se añadieron argumentos de selección, config alternativa o SQL arbitrario. El transporte sigue construyendo sus endpoints con esos valores; cada captura vuelve a validar nombre/UUID y almacenamiento `production`.

```text
Preflight / snapshot de origen —solo lectura—
  → GET bookmark
  → trabajo export completo —sondeo acotado, sin SQL de escritura—
  → descarga acotada sin Authorization
  → snapshot + bookmark posteriores, mismo estado
  → restauración local aislada + comparación completa
  → SQL y manifiesto de respaldo con hashes/recibo
  → revalidación por etapa
  → migraciones cerradas, solo si se autorizan en otra fase
```

Se mantienen separados físicamente `read.mjs`/`snapshot.mjs`, `export.mjs`, `restore.mjs`/`restore-worker.mjs`, `backup.mjs` y `write.mjs`. La captura de respaldo no llama al escritor. La comprobación de recibos no ejecuta SQL remoto.

`remoteExecutionEnabled=false` y el formulario de migraciones bloqueado permanecen. El CLI no puede activar exportación o migraciones mediante una variable o argumento. No se abrió la GUI. La aceptación remota de lectura/respaldo necesitará un lanzador de ese alcance revisado, sin habilitar accidentalmente el escritor.

## 3. Exportación completa preparada

`export.mjs` solicita **todas las tablas, definiciones y datos**, con `no_data=false`, `no_schema=false`, `tables=[]`. No utiliza exportación de esquema solamente ni convierte ausencia de datos en una excepción al requisito.

El primer POST inicia un trabajo; los siguientes consultan ese mismo `current_bookmark`. Sondeo no es reintento de migración: no reinicia un trabajo fallido. Hay un máximo de 12 consultas, pausa acotada, timeout por solicitud y parada ante error, interrupción o cambio de bookmark. Los mensajes crudos del servicio se descartan.

La API devuelve `at_bookmark` y una URL firmada al completar. Se exige que el punto del trabajo coincida con el obtenido antes y después del respaldo. Si otros escritores cambian la base, se rechaza la evidencia. La futura intervención deberá impedir mutaciones concurrentes, aunque el export bloquee temporalmente otras consultas.

El cliente de descarga permite únicamente HTTPS sin credenciales embebidas, fragmento, puerto alternativo ni redirects, con hostname de R2 bajo `.r2.cloudflarestorage.com`. No copia headers de autenticación de la API. **El dominio real que devuelva Cloudflare todavía no está comprobado**: uno diferente bloqueará hasta revisión, no ampliará la allowlist automáticamente.

Límites de esta primera implementación: **16.000.000 bytes** por dump; consultas de snapshots con máximo 10.000 filas acumuladas y 100 columnas por tabla; JSON de API sujeto al límite existente. Una exportación mayor o una respuesta truncada falla, nunca se acepta como respaldo parcial. Estos son límites del verificador preparado, no cuotas de Cloudflare.

La [documentación de import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/) confirma dump SQL e importación como mecanismo soportado, y advierte sobre tablas virtuales. Este código rechaza esquemas no aprobados o formatos no soportados; **no elimina tablas para poder exportar**.

## 4. Integridad y restauración verificables

No basta con un HTTP 200, un archivo no vacío, un hash calculado o un campo `restoreVerified` escrito por el operador.

El código realiza:

1. Captura completa del esquema aprobado, historial y valores de todas sus tablas de usuario, incluido ledger y estado de `sqlite_sequence` cuando existe. Los internos Cloudflare no se exportan/restauran como tablas de aplicación.
2. Codificación canónica de cada celda con tipo y contenido. Texto/BLOB se comparan por bytes hexadecimales; los enteros no pasan por conversión numérica JavaScript. Los reales usan representación SQLite de 17 dígitos. Se conservan NULL, duplicados, orden de columnas, Unicode y texto con NUL.
3. Comparación de fingerprint antes/después y igualdad de bookmarks; cambio de datos o recurso invalida el respaldo.
4. Restauración del **SQL descargado** en una SQLite nueva en memoria, dentro de un worker Node sin entorno heredado ni argumentos adicionales. Se restringen instrucciones/funciones y se deniegan ATTACH, extensiones, selección durante importación, recursión y control transaccional arbitrario. El importador administra su propia transacción.
5. `quick_check`, FK y comparación de esquema, todas las filas/valores y secuencias contra el origen. Error de parseo, UTF-8 inválido, dump truncado o datos faltantes impiden emitir recibo.
6. Timeout de 10 segundos y límite de heap JS del worker; no se afirma un límite duro de toda la memoria nativa SQLite. La API de captura no acepta rutas SQL arbitrarias del CLI.
7. Persistencia del SQL y manifiesto solo tras verificar restauración. Se releen ambos y contrastan sus SHA-256 antes de cada etapa.

El recibo es una capacidad registrada en memoria, ligada a operación, destino, estado de origen, SQL, bookmark, tamaño y caducidad. Un JSON externo o el recibo antiguo de baseline vacío no puede autorizar escritura. Se mantienen 10 minutos de vigencia de respaldo y 30 segundos para preflight de etapa.

El manifiesto actual es formato 2, tipo `complete-sql-and-time-travel`; el runner utiliza `complete-backup.json` y su `.sql`. Los registros del ejecutor guardan solo referencia y estado; no SQL, filas privadas, token ni URL firmada.

### Custodia

El CLI prepara el destino bajo el perfil del operador, **fuera del repositorio**: `AppData/Local/Kuwago/D1Backups/development/<operationId>/`. Las pruebas usan carpetas efímeras ignoradas, exclusivamente con datos sintéticos. No se creó una carpeta con datos remotos.

Antes de cualquier respaldo real deben verificarse ACL NTFS, cifrado del volumen/destino, exclusión de sincronización no aprobada, responsable y retención. Los modos 0600/0700 no certifican ACL de Windows. Propuesta: retención de 30 días después de aceptación, con eliminación aprobada; no se implementa borrado automático. Un export completo puede contener datos privados aunque no contenga tokens API.

## 5. Base vacía y base con datos

### Base vacía DEV actual

Se vuelve a inspeccionar en una ventana autorizada; no se da por vacía por el informe anterior. Aun si no tiene tablas de aplicación, se exige export SQL completo y bookmark. Un archivo vacío se rechaza; un dump SQL válido que representa cero tablas puede restaurarse y compararse. Si el servicio produce un formato vacío distinto, se revisará esa muestra antes de modificar criterios.

Solo después de aceptar respaldo y autorizar migraciones, el runner puede ejecutar 0001–0006. Mantiene destino fijo, lista y hashes cerrados, guarda transaccional, checkpoints, lock persistente y ausencia de retries. No permite reanudar una instalación parcial.

### Base con datos

La captura/verificación soporta los esquemas aprobados por 0001–0006 y conserva contenido/historial. El respaldo no concede autorización para migrarlos: el ejecutor de primera instalación **sigue rechazando una base no vacía/parcial**. Un upgrade posterior necesita plan y permisos separados.

Procedimiento futuro: congelar escritores y reconciliador, capturar punto/dump completo, verificar localmente todos los datos y probar recuperación en destino aislado. No marcar migraciones como aplicadas a mano. En un restore exacto del dump se conserva el historial que forma parte de ese punto; no confundirlo con el restore lógico de aplicación sobre un esquema ya creado.

Para D1–R2 se mantiene el procedimiento de 2B.4R/2B.6: inventario y hashes de objetos privados/derivados y snapshot/época de catálogo. **D1 export y Time Travel no respaldan R2.** Antes de volver a servir contenido, restaurar coherentemente, cambiar época, pausar publicación, retirar aprobaciones y reconciliar con revisión explícita. No ejecutar este dump crudo contra una base viva para intentar recuperar contenido publicado.

Time Travel restaura el estado de la misma D1 y puede perder escrituras posteriores; no es una transacción con R2 ni una clonación garantizada. Requiere autorización de incidente y comprobaciones posteriores independientes. Según la [documentación oficial](https://developers.cloudflare.com/d1/reference/time-travel/), la retención depende del plan; no se volvió a comprobar la cuenta o un bookmark real en esta fase.

## 6. Pruebas y fallos simulados

| Verificación nueva | Resultado |
|---|---|
| Suite backend completa | **200/200 aprobadas**, 0 fallos/omitidas/canceladas |
| Backup y ejecutor tras endurecer formato de bookmark | **30/30**, incluidas 11 nuevas de respaldo |
| TypeScript y build backend/contratos | Correctos |
| Lint backend | Correcto |
| Seis migraciones/hashes originales | Intactos |
| Credencial real o llamadas remotas autenticadas | Ninguna; variable del token ausente |

Los tests prueban respaldo vacío y dump completo con datos sintéticos: ES/EN, dos revisiones, notas con comillas/salto de línea/NUL, entero máximo seguro, principals/roles y auditoría. Se restaura en SQLite aislada **y en otra D1 workerd local**; coincide el fingerprint completo y quedan FK limpias. No se crearon administradores reales ni se consultaron filas de producción.

También se simulan:

- Bookmark ausente, mal formado o cambiado; destino incorrecto.
- Export ausente, ilegible, incompleto o interrumpido.
- Dump sintácticamente válido que pierde filas o identidades referenciadas.
- Alteración/eliminación del SQL o manifiesto; recibo baseline antiguo/falso.
- Mutación de origen durante export aunque el mock mantenga el bookmark.
- Error de trabajo, cambio de job, polling agotado, dominio incorrecto, redirect, tamaño excesivo y descarga truncada.
- Intentos de acceso a archivos, extensiones, instrucciones peligrosas y UTF-8 inválido en el verificador.
- Bloqueo de la migración antes del primer envío si falta un respaldo íntegro/restaurable.
- Recorrido REST completo simulado con seis envíos de migración contra D1 local, conservando pruebas de concurrencia y rollback de 2C.5R.

Los dumps de las simulaciones se generan a partir de las bases locales con formato SQL equivalente; no son capturas de un export Cloudflare remoto. El ensayo directo del PRAGMA auxiliar `miniflare_d1_export` que usa el código de Wrangler no funcionó en esta combinación workerd/Miniflare; no se declara validado ese productor local ni se lo usa como fallback. La importación y comparación sí se probaron en D1 local. Falta aceptar una muestra del productor remoto real en una fase autorizada.

Comandos repetibles desde la raíz:

```powershell
npm --prefix packages/contracts run build
npm --prefix infra/cloudflare/dev run build
npm --prefix infra/cloudflare/dev run test:backup:readiness
npm --prefix infra/cloudflare/dev run test:migrations:safe
npm --prefix infra/cloudflare/dev run lint
```

Suite completa: desde `infra/cloudflare/dev`, `node --test test/*.test.mjs`. Evidencias locales ignoradas: `.wrangler/safe-runner-tests/full-backend-2c5s.txt` y `2c5s-final-targeted.txt`. No se repitieron pruebas visuales del frontend: no cambió Admin ni landing.

## 7. Archivos de esta fase

Raíz: `C:/Users/JV/Desktop/Kuwago Landing/grupo-kuwago-landing-source`.

- Nuevos: `infra/cloudflare/dev/scripts/safe-d1/export.mjs`, `snapshot.mjs`, `restore.mjs`, `restore-worker.mjs`.
- Nuevos tests: `infra/cloudflare/dev/test/backup-readiness.test.mjs`, `backup-fixtures.mjs`.
- Modificados: `scripts/safe-d1/backup.mjs`, `read.mjs`, `transport.mjs`, `runner.mjs`, `policy.mjs`; `scripts/d1-safe-migrate.mjs`; `test/safe-migration-runner.test.mjs`; `infra/cloudflare/dev/package.json`.
- Nuevo informe: `docs/PHASE-2C5S-D1-BACKUP-READINESS.md`.

No se modificaron SQL, hashes aprobados, dependencias, frontend, captura GUI o infraestructura remota. La política sigue con el mismo destino y `remoteExecutionEnabled=false`.

## 8. Matriz GO / NO-GO antes de cualquier credencial

| Control | Dictamen |
|---|---|
| Estrategia completa elegida e integrada | **GO local**; ya no depende exclusivamente del baseline vacío |
| Integridad/restaurabilidad y bloqueo obligatorio | **GO local**, con fixtures y D1 workerd |
| Destino y seis migraciones/hashes | **GO**, conservados |
| Permisos mínimos GET/query/bookmark | **Documentados**; acceso actual no comprobado |
| Permiso exacto aceptado por export/restore | **Pendiente / bloqueante para cerrar autorización del flujo remoto** |
| Formato/host/polling/export SQL reales | **Pendientes** de prueba limitada y autorizada; cualquier diferencia bloquea |
| Bookmark y dump reales disponibles | **NO-GO para migrar** hasta obtenerlos/verificarlos |
| Custodia NTFS/cifrado/retención/responsable | **Pendiente antes de un respaldo real** |
| Crear o usar credencial ahora | **NO-GO**, esta fase no lo autoriza |
| SQL remoto, migraciones, restore o deploy | **NO-GO**, escritor continúa cerrado |

Orden de autorizaciones futuras, sin ejecutarlas:

1. Revisar este informe; confirmar permiso mínimo de export/restore y custodia.
2. Autorizar por separado una credencial mínima temporal y su revocación. No solicitar D1 Edit solo para averiguar si export funciona.
3. Autorizar preflight y export completo del objetivo exacto, con Time Travel de lectura y descarga protegida; ninguna migración. Aceptar el productor real, hash, restauración local y punto coherente.
4. Solo con esa evidencia aceptada, aprobar activación del escritor, seis SQL/hashes, ventana y responsables. Si el respaldo caducó/cambió, obtener otro bajo autorización; no saltar el gate.
5. Al terminar o fallar, retirar credencial del proceso y revocarla por operador con evidencia. Bootstrap, restauración remota y despliegue requieren autorizaciones propias.

**La decisión de diseño del respaldo queda cerrada. La aceptación remota permanece pendiente, sin declarar un backup real completado ni pedir credenciales. Se detiene para revisión.**
