# Backup-only etapa 4 — resultado remoto

**PASS** · Finalización: **25/10/2026, 21:10:20.489 de Costa Rica** (`2026-10-26T03:10:20.489Z`).

Autorización única consumida: `472f450d-3410-4808-a491-c14aa3cc16ae`.
Operación del respaldo: `4e5b4fc2-8f1e-44e1-b2e5-f7ca82d40749`.

## Verificaciones

| Control | Resultado |
|---|---|
| Identidad fija | Cuenta `7a8bcd7992a3de359d2aff87df2fb693`; D1 `kuwago-admin-db-development`; UUID `c5cfbe44-4fd0-4c2a-83c1-b833935534ba` |
| Evidencia local previa | Reconciliación de 0004 y sus hashes fijados aprobados; custodias y respaldos anteriores verificados |
| Estado remoto | Etapa 4, **26 tablas de aplicación**, historial exactamente 0001–0004 |
| Esquema | `05b62a741ad2a8b84caac31dbd9977cb19840e7d588dfb2c3e92ce7a1e25e26f` |
| Fingerprint completo esperado | `df24b03cf675ef1cebb593888fbcc5f4e5765aed84f061fe358e6b344de1c010`, fijado por la reconciliación y reconstrucción local anterior |
| Preflight | Dos snapshots remotos completos iguales a ese fingerprint, sin sustituirlo por una referencia nueva |
| Bookmarks previos | first=middle=last, válidos y estables antes de iniciar el export |
| Integridad / contenido | FK y quick_check aprobados; seeds correctos, sin administradores, asignaciones o contenido comercial |
| Export | **Un único inicio**, sin sondeo adicional ni reintentos; `at_bookmark` coincidente |
| Post-export | Snapshot y bookmark posteriores iguales al estado previo aprobado |
| Cifrado | AES-256-GCM; descifrado DPAPI CurrentUser y recuperación independiente con clave existente comprobados dentro del flujo privado |
| Archivo persistido | Ciphertext releído y hash coincidente con la evidencia |
| Restauración aislada | SQLite: **28 tablas y 53 filas**, fingerprint idéntico al remoto y a la referencia fijada |
| Verificación independiente adicional | `d1-backup-recover.mjs`, en otro proceso local: `verified_local_recovery`, 28 tablas/53 filas |
| Limpieza | `cleanupComplete:true`, `credentialDisposed:true`; sin lock de respaldo remanente |
| Respaldos anteriores | Ciphertexts y evidencias de etapas 0, 1 y 3 con hashes originales intactos |

Las 28 tablas restauradas incluyen las 26 de aplicación, `d1_migrations` y `sqlite_sequence`. Las 53 filas comprenden seeds, estado inicial de catálogo, historial y secuencia; no se crearon datos comerciales o administradores.

La referencia lógica proviene de `D1-0004-READONLY-RECONCILIATION.md`. No se repitió 0004 para preparar este respaldo ni se volvió a cambiar la referencia de fingerprint. Los hashes de las seis migraciones se mantuvieron intactos.

## Bookmarks y tiempos registrados

Ordinales dentro de **227 solicitudes API**, todas HTTP 200. Horas de observación en Costa Rica del 25/10/2026:

| Solicitud | Lectura / operación | Hora disponible | Relación verificada |
|---|---|---|---|
| 19 | first, antes del primer snapshot | 21:09:57.709 | Válido |
| 82 | middle, tras el primer snapshot | 21:10:03.517 | Igual a first |
| 145 | last, tras el segundo snapshot | 21:10:09.433 | Igual a middle; snapshots iguales |
| 146 | Inicio del único export | No se guardó timestamp individual | HTTP 200; punto del export coincide con el aprobado |
| 227 | Bookmark posterior al export y snapshot final | No se guardó timestamp individual | Igual al previo y al punto del export; fingerprint final coincidente |

El resultado conserva `firstEqualsMiddle:true`, `middleEqualsLast:true`, `fullSnapshotsEqual:true` y las tres horas señaladas. El punto de recuperación común se conserva dentro del payload cifrado, sin bookmarks en claro ni URLs firmadas en logs o en este informe. La cuarta lectura se identifica por ordinal y por la comparación obligatoria superada; no se inventa su hora individual, que el flujo actual no registró.

Distribución API: **5 metadatos, 217 consultas SQL de lectura, 4 bookmarks y 1 inicio de export**. La descarga mediante URL firmada es una petición separada, sin token API. No hubo lotes SQL mutantes, migraciones ni restauración remota.

## Ubicación y hashes

Artefactos fuera del repositorio:

```text
C:\Users\JV\AppData\Local\Kuwago\D1Backups\development\
  4e5b4fc2-8f1e-44e1-b2e5-f7ca82d40749\backup.kwgbak
  4e5b4fc2-8f1e-44e1-b2e5-f7ca82d40749\evidence.json
  backup-once-472f450d-3410-4808-a491-c14aa3cc16ae.attempt.json
  backup-once-472f450d-3410-4808-a491-c14aa3cc16ae.result.json
```

Ciphertext: **45 118 bytes**.

| Artefacto | SHA-256 |
|---|---|
| `backup.kwgbak` | `6283323d913b68ce1781553aeeac2a28e1fdd0833f73b9edd6c1535171a4356c` |
| `evidence.json` | `064b8745f6c79dbb0fb265eee8abacd643c6bec53fc4d81388e9b383d3c859a8` |
| Resultado depurado del intento | `601582fde7e401cda8647b1534837158388e2ab7f94e5a316b36add51b4fcbc6` |

Los respaldos y evidencias de operaciones `7a492026-01dd-49fc-9ecb-40997d5b9e56`, `62c608c3-60c6-41fd-a811-8c9f273fe259` y `249fc1c0-e980-4197-a2f9-ced122f72dd2` permanecen intactos. No se recifraron ni sustituyeron. Las ACL existentes fueron verificadas otra vez tras finalizar. El SQL descifrado solo se utilizó en memoria para la restauración aislada; no se guardó SQL en claro.

## Cierre y restricciones conservadas

Token y clave existente se introdujeron únicamente en el formulario privado y viajaron por pipe local. El resultado registra descarte de credenciales y limpieza; campos, referencias y buffers se limpiaron según el flujo. No se promete borrado físico absoluto de memoria administrada. No se generó una clave nueva ni se guardaron secretos en argumentos, archivos, historial, logs o Git. La revocación del token en Cloudflare sigue bajo control del usuario.

`backupExecutionApproved=false`; estado local `alreadyUsed:true`. Los permisos remotos generales y ambos permisos de migraciones siguen en falso. **El prototipo de checkpoint no se habilitó ni se conectó al ejecutor remoto.**

No se ejecutaron 0005–0006, bootstrap de Super Admin, deploy, commit o push. Tampoco hubo cambios de Access, Workers, DNS, Hostinger o R2. No se hicieron reintentos. El resultado solo verifica el respaldo de etapa 4; no autoriza migraciones ni la activación del prototipo. Se detiene para revisión.
