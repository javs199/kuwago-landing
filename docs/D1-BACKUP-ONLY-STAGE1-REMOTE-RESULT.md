# Backup-only D1 DEV posterior a 0001 — resultado remoto

**PASS** · Finalizado el 25/10/2026 a las **18:54:06.505 de Costa Rica** (`2026-10-26T00:54:06.505Z`).

Autorización única consumida: `d4c76ea9-2bab-4817-a99e-f8032685aa35`.
Operación del respaldo: `62c608c3-60c6-41fd-a811-8c9f273fe259`.

## Resultado comprobado

| Control | Evidencia / resultado |
|---|---|
| Destino fijo | Cuenta `7a8bcd7992a3de359d2aff87df2fb693`; D1 `kuwago-admin-db-development`; UUID `c5cfbe44-4fd0-4c2a-83c1-b833935534ba` |
| Evidencia previa de 0001 | Informe y resultado fijados por hash verificados localmente antes de la captura privada |
| Custodia | Verificación NTFS/ACL aprobada antes de operar y comprobada nuevamente tras finalizar |
| Etapa remota | 1, esquema aprobado con 21 tablas de aplicación |
| Esquema | SHA-256 `9faeb21e6b3c899dbe1e3fc2c70f5b25552e9f0169162a679f163ee5855aa26d` |
| Historial | Exactamente una entrada: id 1, `0001_admin_catalog.sql`; fecha válida |
| Seeds y contenido | Seeds originales verificados; resto de tablas de aplicación vacío según el control de etapa 1 |
| Bookmark | Válido e idéntico antes/después; `at_bookmark` del export coincidente; valor conservado solo dentro del payload cifrado |
| Fingerprint completo | Igual antes/después del export y tras restauración aislada; incluye datos, tipos, historial y secuencia; no se inventó a partir del esquema |
| Exportaciones iniciadas | **Una**; sin sondeo adicional ni reinicio |
| Respuestas API | 139 solicitudes, todas HTTP 200: 4 metadatos, 132 consultas de lectura, 2 bookmarks y 1 inicio de export |
| Descarga | Descarga de SQL por URL firmada separada, sin token API; URL no conservada en evidencia |
| Cifrado | AES-256-GCM; comprobados descifrado DPAPI CurrentUser y recuperación con clave existente dentro del flujo privado |
| Integridad en disco | Hash del ciphertext releído coincide con la evidencia verificada |
| Restauración SQLite | Comparación exacta aprobada: **23 tablas, 22 filas**; 21 tablas de aplicación más `d1_migrations` y `sqlite_sequence` |
| Recuperación adicional | `d1-backup-recover.mjs` ejecutado en otro proceso local: `verified_local_recovery`, mismo conteo de tablas/filas |
| Limpieza | `cleanupComplete:true`, `credentialDisposed:true`; sin lock de respaldo remanente |
| Respaldo anterior | Ciphertext y evidencia conservan sus hashes originales; no sustituidos ni recifrados |

El conteo de filas incluye seeds, ledger y secuencia. No significa que se hayan creado servicios o administradores. Las consultas SQL remotas del flujo fueron exclusivamente de lectura. El export fue la única operación de generación de respaldo y no se ejecutaron migraciones ni restauraciones remotas.

## Artefactos fuera del repositorio

```text
C:\Users\JV\AppData\Local\Kuwago\D1Backups\development\
  62c608c3-60c6-41fd-a811-8c9f273fe259\backup.kwgbak
  62c608c3-60c6-41fd-a811-8c9f273fe259\evidence.json
  backup-once-d4c76ea9-2bab-4817-a99e-f8032685aa35.attempt.json
  backup-once-d4c76ea9-2bab-4817-a99e-f8032685aa35.result.json
```

Ciphertext: **22 477 bytes**.

| Artefacto | SHA-256 |
|---|---|
| `backup.kwgbak` | `7935096090980e3e4ffc278899b790af9d13151285a2fb2a33b9db9e9b22a596` |
| `evidence.json` | `daae42483e896ab31929484676ccb2468500048dfb75064d1b4133eb238690b9` |
| Resultado depurado del intento | `0549532605d00d2d267bd29ac90a8d838394302302ff52e1e2e367efb89e02b7` |

No se guardaron SQL en claro, tokens, claves, cookies ni enlaces firmados en el repositorio o informe. El snapshot fingerprint y el bookmark de origen permanecen dentro del respaldo cifrado. La restauración local utilizó SQLite en memoria aislada; el SQL descifrado se descartó.

## Cierre y límites

La entrada se realizó únicamente en el formulario privado existente. El proceso del respaldo registró descarte de credenciales; el formulario limpia campos y referencias. No se promete borrado físico absoluto de memoria administrada. La credencial no fue revocada en Cloudflare por esta herramienta: su revocación permanece bajo control del usuario.

`backupExecutionApproved` volvió a `false`; el estado local confirma `alreadyUsed:true`. El permiso global de respaldo y el de migraciones permanecen bloqueados. Los marcadores y resultados se conservan sin reintento ni reutilización del ID.

No se ejecutaron **0002–0006**, bootstrap de Super Admin, despliegues, commit ni push. Tampoco se modificaron Access, DNS, Hostinger o el Worker desplegado. Este resultado verifica el respaldo de etapa 1; no autoriza ni habilita automáticamente una migración posterior. Se detiene para revisión.
