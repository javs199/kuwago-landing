# Intento autorizado exclusivamente de migración 0001

25/10/2026 · America/Costa_Rica · **DETENIDO ANTES DE ESCRIBIR. 0001 NO APLICADA.**

Autorización consumida: `6f387586-1f7c-46da-99d2-1c0876b8dc89`.

Finalización: `2026-10-25T20:51:17.246Z`, 14:51:17 de Costa Rica.

## Resultado depurado

| Comprobación | Resultado |
|---|---|
| Informe del respaldo aprobado | SHA-256 coincide con el fijado antes de ejecutar |
| Ubicación del respaldo y ACL | Verificadas; fuera del repositorio, ruta fija sin enlaces |
| Hash del respaldo cifrado | Coincide: `bb6720bef5a5ce514e8ffb4867c31026ed88adb76cdcc4082f9a7664bb14eb37` |
| Evidencia del respaldo | SHA-256 coincide; `restoreVerified:true`, identidad y operación correctas |
| Descifrado y restauración SQLite local | PASS mediante DPAPI, sin SQL ni claves en archivos/logs |
| Manifiesto y hash de 0001 | Coinciden; `33bd2451b568acf1c316fcc5355bca1e1cd87deacace72d3819233a00e670abd` |
| Identidad D1 | GET HTTP 200; cuenta, nombre, UUID y versión esperados |
| Esquema/integridad/contenido previo | Cuatro lecturas HTTP 200; baseline etapa 0 y fingerprint coincidente con el respaldo |
| Bookmark actual | GET HTTP 200, pero **distinto del bookmark cifrado del respaldo** |
| Error | `backup_bookmark_mismatch` |
| Lotes de escritura | **Cero**, `writeAttempted:false` |
| Postflight de migración | No ejecutado, `postflightVerified:false`; no se afirma migración ni registro nuevo |
| Credencial | `credentialDisposed:true` |
| Reintentos / siguientes migraciones | Ninguno |

Se realizaron exactamente seis solicitudes remotas de lectura: metadatos, cuatro consultas y bookmark. No se emitió solicitud de escritura, exportación o restauración remota. El estado final registrado es `stopped_before_write`.

La diferencia de bookmark es un hecho observado, pero no demuestra por sí sola que cambiaron datos comerciales: el esquema y fingerprint comparados seguían coincidiendo. No se investigó remotamente la causa ni se flexibilizó la comparación. Los valores de bookmarks se mantuvieron privados y no se incluyen en el informe.

## Respaldo utilizado, conservado intacto

Operación del respaldo: `7a492026-01dd-49fc-9ecb-40997d5b9e56`.

```text
C:\Users\JV\AppData\Local\Kuwago\D1Backups\development\
  7a492026-01dd-49fc-9ecb-40997d5b9e56\backup.kwgbak
```

El informe original `docs/D1-BACKUP-ONLY-READ-WRITE-REMOTE-RESULT.md`, `evidence.json` y el ciphertext se verificaron con hashes fijados en código antes de operar. El hash del ciphertext volvió a comprobarse localmente al cerrar y no cambió. No se generó otro respaldo, no se sobrescribió el original ni se alteró 0001 o su manifiesto.

## Ejecutor limitado y pruebas

El runner original recorrría seis etapas y capturaba otro respaldo. Para cumplir la autorización se añadió una entrada 0001 que reutiliza el lector y el escritor seguro existentes, enlaza un recibo de respaldo cifrado verificado en memoria y realiza una única llamada de aplicación seguida de `inspect(1)`. No contiene bucle de etapas.

El transporte exige una capacidad específica de un solo uso, lote aprobado de etapa 0 y un máximo de una llamada mutante; bloquea 0002–0006, SQL arbitrario y cualquier nuevo export desde este modo. La autorización tiene marcador permanente exclusivo `wx`; permanece consumida incluso ante diferencias previas. El ejecutor general y el modo remoto general no se habilitaron.

Archivos nuevos bajo `infra/cloudflare/dev`:

```text
scripts/safe-d1/encrypted-backup-receipt.mjs
scripts/safe-d1/migration-0001-permit.mjs
scripts/safe-d1/migration-0001-runner.mjs
scripts/d1-migrate-0001.mjs
scripts/d1-migrate-0001-status.mjs
scripts/migrate-0001-private.ps1
test/migration-0001.test.mjs
```

Se adaptaron `safe-d1/backup.mjs` para aceptar el recibo cifrado sin materializar SQL, `write.mjs` para identificar la etapa autorizada de cada lote, y `transport.mjs` para aplicar el límite de 0001 y conservar únicamente HTTP/códigos depurados. No se modificaron archivos SQL ni hashes aprobados.

Validación previa: **43/43 pruebas locales aprobadas**, incluida aplicación de solo 0001 en D1 local simulada, historial con una fila, ausencia de administradores, discrepancias de bookmark/esquema sin escrituras, rollback local ante fallo y rechazo de export/lotes arbitrarios. Se repitieron después las cinco pruebas específicas tras añadir campos de evidencia de historial/hash: todas pasaron. Lint, TypeScript, build y parser PowerShell correctos. Las regresiones de seis etapas se ejecutaron solo contra fixtures locales, nunca sobre D1 DEV remoto.

El contrato REST público de `/query` admite `{batch:[{sql,params},...]}`, formato conservado por el escritor; se revisó antes de la operación. No se cambió el formato de la petición ni se probó una escritura remota para verificarlo.

## Custodia de evidencia y parada

```text
C:\Users\JV\AppData\Local\Kuwago\D1Backups\development\
  migration-0001-6f387586-1f7c-46da-99d2-1c0876b8dc89.attempt.json
  migration-0001-6f387586-1f7c-46da-99d2-1c0876b8dc89.result.json
```

Contienen únicamente alcance, identidad, estado, hashes y resultados depurados. El token se introdujo en un formulario local enmascarado y pasó por stdin privado; no se solicitó ni capturó en el chat. No fue necesario introducir la clave de recuperación. No se imprimieron ni guardaron JWT, tokens, claves, SQL de respaldo o bookmarks en claro.

Se cerró `firstMigrationApproved=false`; el marcador permanece intacto. El descarte local no revoca el token en Cloudflare ni garantiza borrado físico de memoria administrada.

**Se detiene sin aplicar 0001 ni ninguna otra migración, sin Super Admin, despliegue, commit o push.** Cualquier investigación remota, respaldo actualizado o nuevo intento requiere una autorización independiente. No se reintentará ni se aceptará automáticamente un bookmark distinto.
