# Lote 0004–0006 — preparación de ejecución autorizada

25/10/2026 · America/Costa_Rica. Nuevo ID: `3771d065-f5e5-4bb0-b0fc-0091834f92c8`.

Alcance humano autorizado: únicamente 0004, 0005 y 0006, una vez cada una, sin reintentos y con postflight antes de continuar. Sin Super Admin, exportaciones, despliegues, commit ni push. Cuenta fija `7a8bcd7992a3de359d2aff87df2fb693`; D1 `kuwago-admin-db-development`, UUID `c5cfbe44-4fd0-4c2a-83c1-b833935534ba`.

## Respaldo fijado

Operación `249fc1c0-e980-4197-a2f9-ced122f72dd2`, verificada en `D1-BACKUP-ONLY-STAGE3-REMOTE-RESULT.md`. Se fijan SHA-256 de ciphertext, evidencia, resultado e informe. Antes de abrir un transporte remoto se comprueban ACL, cadena de evidencias, SQL descifrado y restauración exacta: 26 tablas incluyendo ledger/secuencia, 51 filas. Se conservan los respaldos anteriores. El fingerprint y bookmark se leen del payload cifrado mediante DPAPI, sin pedir la clave ni exponerlos.

El plan protege este lote completo con el export previo de etapa 3 y el punto Time Travel. No exige export entre las tres etapas. No se incorpora una vía de export al ejecutor: si las condiciones dejan de cumplirse, debe detenerse. Cualquier recuperación remota o nueva continuación necesita autorización propia.

## Controles y secuencia

1. Nuevo permiso de un solo uso, marcador exclusivo `wx` y máximo tres escrituras, solo etapas previas 3, 4 y 5. El intento consumido 0002–0006 permanece bloqueado e intacto. No se permite reanudar un lote parcial con este ID.
2. Formulario Windows derivado del patrón existente; token oculto mediante pipe privado, fuera de argumentos, archivos e historial. No pide clave real de recuperación. No envía nada hasta pulsar el botón.
3. Inspección remota inicial: identidad, esquema exacto de etapa 3, 24 tablas, historial solo 0001–0003, integridad, seeds y tablas de contenido vacías. Los seis hashes originales se validan, con dependencias 0004→etapa 3, 0005→etapa 4 y 0006→etapa 5.
4. El fingerprint remoto completo debe coincidir con el respaldo restaurado. El baseline fresco conserva el bookmark histórico protegido y establece el punto actual exclusivamente con dos snapshots iguales y tres bookmarks estables, según el control ya aprobado. No se tolera ningún cambio durante ese preflight.
5. Se guardan las tres observaciones de bookmark con horas, valores protegidos y comparaciones booleanas, incluso si falla el preflight. Baseline persistido con exclusividad/fsync/hash releído, comprobación de actualidad menor de 30 segundos y última lectura antes del escritor.
6. Una única petición mutante por migración, con SQL original y registro de historial en el mismo lote. Guarda transaccional de esquema, seeds, historial y todas las filas/tipos del snapshot, incluyendo fechas y secuencia; aborta si cambian después de la última lectura.
7. Postflight por etapa: esquema, historial, FK/quick_check, preservación de fechas anteriores, seeds, ausencia de contenido y estado de control aprobado. Snapshot y bookmarks posteriores estables. Se persiste un checkpoint privado de fingerprint y bookmark antes de continuar.
8. Las etapas posteriores deben enlazar exactamente con el checkpoint previo. Cualquier diferencia lógica, bookmark inestable, respuesta ambigua, error SQL o fallo de evidencia detiene el lote sin repetir ni intentar el siguiente archivo.
9. Descartar token y referencias al terminar, guardar resultado depurado y cerrar el permiso. No revocar automáticamente la credencial Cloudflare: esa operación sigue bajo control del usuario.

Los registros nuevos viven fuera de Git bajo `C:\Users\JV\AppData\Local\Kuwago\D1Backups\development`, prefijo `migration-0004-0006-3771d065-f5e5-4bb0-b0fc-0091834f92c8`. `stage-3` corresponde al preflight de 0004, `stage-4` al de 0005 y `stage-5` al de 0006.

## Cambios y comprobaciones locales

Nuevos: `migration-final-permit.mjs`, `final-backup-receipt.mjs`, CLI `d1-migrate-0004-0006.mjs`, estado local `d1-migrate-0004-0006-status.mjs`, formulario `migrate-0004-0006-private.ps1`, pruebas `migration-final.test.mjs`, bajo `infra/cloudflare/dev/scripts/safe-d1`, `scripts` o `test` según corresponda.

Reutilizados: `backup.mjs` reconoce el recibo cifrado específico de etapa 3; `migration-batch-runner.mjs` obtiene el comienzo exclusivamente del tipo de recibo no falsificable, manteniendo el flujo anterior; `transport.mjs` añade capacidad 0004–0006 sin ampliar la autorización de otros permisos; `verified-baseline-control.mjs` admite el nuevo prefijo de custodia conservando las mismas guardas. SQL original, contratos, frontend e informes previos sin cambios.

- **6/6 pruebas específicas PASS**: restauración real local del respaldo, recorrido completo 0004–0006, evidencia, destinos incorrectos, cambios lógicos, fallo SQL/rollback en cada una de las tres etapas, carreras de datos/bookmarks, ambigüedad de red, error de checkpoint y rechazo de export/SQL arbitrario.
- **30/30 regresiones PASS**: `baseline-observation`, `migration-0001`, `safe-migration-runner`.
- Lint, TypeScript/build backend y parser PowerShell: PASS. Build solo local, sin upload.
- Plan inicialmente bloqueado y sin consumir antes de habilitar el intento ya autorizado.

Los tests emplearon workerd y SQLite locales, sin tokens reales ni conexiones Cloudflare. Este documento describe preparación; los resultados remotos se documentarán por separado.
