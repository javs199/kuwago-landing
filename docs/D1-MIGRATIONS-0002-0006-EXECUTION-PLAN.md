# Continuación DEV 0002–0006 — plan de ejecución autorizado

25/10/2026 · America/Costa_Rica. Autorización humana: aplicar únicamente 0002–0006, sin bootstrap, export adicional o despliegue. ID nuevo: `96a25c8d-186f-4b67-9653-1b399294903f`.

Destino fijo: cuenta `7a8bcd7992a3de359d2aff87df2fb693`, D1 `kuwago-admin-db-development`, UUID `c5cfbe44-4fd0-4c2a-83c1-b833935534ba`. No hay selector de destino ni SQL arbitrario. Las seis migraciones originales conservan los hashes de `policy.mjs` y del manifiesto; el lote permite únicamente las últimas cinco en orden.

## Respaldo y recuperación

Se utiliza el respaldo completo de etapa 1 aprobado en `D1-BACKUP-ONLY-STAGE1-REMOTE-RESULT.md`, operación `62c608c3-60c6-41fd-a811-8c9f273fe259`, ciphertext SHA-256 `7935096090980e3e4ffc278899b790af9d13151285a2fb2a33b9db9e9b22a596`. Se fijan hashes del ciphertext, evidencia, informe y resultado del intento. Se verifican ACL, destino, payload, SQL y restauración SQLite exacta (23 tablas incluyendo ledger/secuencia; 22 filas), además de conservar los hashes del respaldo original vacío y la evidencia de 0001.

El plan 2C.5S protege un lote mediante un export completo previo y Time Travel; **no exige un export nuevo entre cada migración**. Esta operación vuelve a validar el respaldo completo antes y durante el lote. El nuevo ejecutor no contiene una ruta de exportación: si deja de cumplir los requisitos, se detiene. La recuperación autorizable sería volver al punto previo al lote y reconciliar D1–R2 según el runbook; ninguna restauración remota es automática ni está autorizada aquí. No hay contenido, medios ni publicaciones iniciales que sincronizar, y R2 no se conecta ni modifica.

## Control antes y durante el lote

1. Entrada exclusivamente mediante formulario Windows enmascarado y pipe privado, reutilizando el patrón existente. No requiere introducir la clave: la verificación local usa DPAPI y el respaldo existente. Token fuera de argumentos, archivos, historial y logs.
2. Marcador de ejecución exclusivo `wx`; un ID consumido no puede reiniciarse ni reanudarse, aunque falle. No habilitar los flags remotos globales o el ejecutor inicial de seis etapas.
3. Inspección remota de etapa 1: identidad, esquema, historial solo 0001, integridad, seeds y ausencia de contenido. El fingerprint completo debe coincidir con el respaldo restaurado.
4. Baseline fresco: dos snapshots completos iguales, delimitados por tres bookmarks iguales. Solo la primera etapa puede aceptar diferencia con el bookmark histórico cuando la identidad lógica completa coincide, conforme a la autorización. Se conserva el bookmark del respaldo y el fresco mediante DPAPI en un registro nuevo, exclusivo, fsync y hash releído.
5. Por cada etapa: hashes y dependencias, nueva inspección, baseline duradero, revalidación de custodia/respaldo, caducidad de 30 segundos y última igualdad de bookmark antes del escritor.
6. Una única petición mutante para el SQL original de la etapa y ledger. Además de la guarda de esquema/historial/seeds existente, el lote añade **guardas transaccionales de todas las filas y tipos del snapshot**, incluyendo fechas de ledger y secuencias. Si alguien cambia el estado tras la última lectura, el CHECK de la guarda aborta el lote SQL.
7. Postflight remoto por etapa: esquema e historial exactos, FK/quick_check, seeds, tablas vacías y control de publicación cuando corresponde. Se conserva byte a byte el prefijo de filas del ledger anterior; no se permite incorporar cambios de timestamps como si fueran parte de la migración. Snapshot posterior y bookmarks estables, checkpoint de resultado verificado antes de avanzar.
8. En etapas posteriores se exige que el bookmark inicial coincida con el checkpoint previo. No se renueva silenciosamente una base distinta entre etapas. Ante error de respuesta, SQL, concurrencia, verificación o evidencia: parada terminal, sin reintentos ni siguiente migración.
9. Descartar credenciales, emitir resultado depurado y volver a bloquear el permiso al finalizar. Revocación del token en Cloudflare sigue bajo control del usuario.

## Archivos del ejecutor

Nuevos: `safe-d1/migration-batch-permit.mjs`, `batch-backup-receipt.mjs`, `migration-batch-runner.mjs`, CLI `d1-migrate-0002-0006.mjs`, estado local `d1-migrate-0002-0006-status.mjs`, formulario `migrate-0002-0006-private.ps1` y pruebas `migration-batch.test.mjs`, todos bajo `infra/cloudflare/dev/scripts` o `test` según corresponda.

Reutilizados/ampliados: `safe-d1/backup.mjs` reconoce el nuevo recibo cifrado no falsificable; `write.mjs` genera guardas completas del snapshot; `transport.mjs` restringe capacidad al prefijo 0002–0006, máximo cinco escrituras secuenciales y bloqueo tras fallo, sin export; `verified-baseline-control.mjs` conserva el mecanismo existente de snapshots, bookmarks estables, DPAPI y evidencia duradera para esta continuación. El ejecutor de 0001 y los SQL originales no se modifican.

Los archivos privados, marcadores, baselines y checkpoints se guardan fuera de Git en `C:\Users\JV\AppData\Local\Kuwago\D1Backups\development`, con prefijo `migration-0002-0006-96a25c8d-186f-4b67-9653-1b399294903f`. En sus nombres `stage-1` es la etapa **previa** a aplicar 0002; `stage-5` precede a 0006. Los bookmarks nunca se imprimen.

## Pruebas locales previas a habilitar

- Suite final del lote: **9/9 PASS** en corrida completa de 85,5 segundos; incluye recorrido real sobre D1 workerd local restaurada, error SQL en cada una de las cinco etapas, rollback, concurrencia de datos/bookmarks, identidad incorrecta, cambio lógico, errores de evidencia/red, bloqueo de export, capacidades falsas y preservación de timestamps anteriores del ledger.
- Una corrida intermedia del control adicional detectó la fila inicial legítima de `catalog_state` creada por 0004 como inesperada. Se añadió su validación exacta (`id=1`, `version=0`), además de preservar esa fila entre etapas. No se quitaron guardas ni se modificaron migraciones para superar el caso; la corrida completa final pasó.
- Regresiones del ejecutor anterior: **30/30 PASS** (`safe-migration-runner`, `migration-0001`, `baseline-audit`).
- Lint: PASS; TypeScript y build backend: PASS, solo compilación local. Sintaxis PowerShell: PASS.

No se ejecutaron escrituras remotas durante las pruebas. Los ensayos restauraron en aislamiento local el respaldo aprobado; no persistieron SQL descifrado ni usaron tokens reales. La ejecución remota y su resultado se documentarán separadamente; este documento no afirma que las migraciones ya estén aplicadas.
