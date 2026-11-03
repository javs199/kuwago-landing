# Backup-only D1 DEV posterior a 0003 — resultado remoto

**PASS** · Finalización: **25/10/2026, 19:29:48.266 de Costa Rica** (`2026-10-26T01:29:48.266Z`).

Autorización única consumida: `6d61db52-444c-476d-b258-64dd4e323bd5`.
Operación del respaldo: `249fc1c0-e980-4197-a2f9-ced122f72dd2`.

## Verificaciones realizadas

| Control | Resultado |
|---|---|
| Destino fijo | Cuenta `7a8bcd7992a3de359d2aff87df2fb693`; D1 `kuwago-admin-db-development`; UUID `c5cfbe44-4fd0-4c2a-83c1-b833935534ba` |
| Preparación local | Evidencias de 0001, resultado parcial 0002/0003 y hashes originales de las seis migraciones verificados antes de capturar credenciales |
| Custodia | NTFS/ACL aprobadas antes de operar y verificadas de nuevo al finalizar |
| Estado remoto | Etapa 3; **24 tablas de aplicación**, sin tablas, índices o triggers inesperados |
| Hash del esquema | `7b8fd74fa51a798fced27ea83491e8b9c18dc324539efcb7daf217914630f8f6` |
| Historial | Exactamente ids 1–3: `0001_admin_catalog.sql`, `0002_integrity_guards.sql`, `0003_access_rbac.sql`; fechas válidas |
| Seeds, identidad y contenido | Definiciones/permisos legacy y canónicos coincidentes con los seeds; sin administradores, asignaciones o contenido comercial |
| Integridad | quick_check y claves foráneas aprobados |
| Fingerprint de origen | Capturado remotamente durante este intento; dos snapshots completos previos iguales, con bookmarks estables |
| Comparación posterior | Fingerprint posterior al export igual al previo; mismo bookmark que el export y su `at_bookmark` |
| Exportación | **Un único inicio**, sin sondeo adicional ni reintentos |
| Cifrado | AES-256-GCM con DPAPI CurrentUser y recuperación independiente existente; ambos descifrados comprobados dentro del flujo privado |
| Verificación en disco | Ciphertext releído coincide con el SHA-256 de la evidencia verificada |
| Restauración SQLite aislada | Snapshot completo idéntico al fingerprint de origen: **26 tablas y 51 filas**, incluyendo historial, tipos, fechas y secuencias |
| Segunda recuperación local | Proceso independiente `d1-backup-recover.mjs`: `verified_local_recovery`, 26 tablas/51 filas |
| Limpieza | `cleanupComplete:true`, `credentialDisposed:true`; sin lock de respaldo remanente |
| Preservación | Backups y evidencias anteriores de etapa 0 y etapa 1 conservan sus hashes |

Las 26 tablas restauradas comprenden las 24 de aplicación, `d1_migrations` y `sqlite_sequence`. Las filas son seeds, ledger y secuencia; el respaldo no creó personas, servicios ni administradores.

El fingerprint completo de etapa 3 no estaba conservado en el intento histórico de migraciones. Este respaldo lo captura y verifica contra el estado remoto de **esta ejecución autorizada**; no se afirma una comparación retroactiva con un fingerprint histórico inexistente.

## Lecturas de bookmark y export

Ordinales dentro de las **213 solicitudes API** de este intento; todas HTTP 200. No se muestran valores de bookmark, URLs firmadas ni credenciales.

| Solicitud | Lectura / operación | Hora de observación en Costa Rica | Resultado |
|---|---|---|---|
| 18 | first, antes del primer snapshot completo | 19:29:25.475 | Bookmark válido |
| 77 | middle, después del primer snapshot | 19:29:31.446 | Igual a first |
| 136 | last, después del segundo snapshot | 19:29:37.025 | Igual a middle; ambos snapshots iguales |
| 137 | Inicio del único export completo | No se guardó timestamp individual | HTTP 200; `at_bookmark` coincide con el bookmark aprobado |
| 213 | Lectura posterior al export y al snapshot de comprobación | No se guardó timestamp individual | Igual al bookmark previo/export; fingerprint posterior idéntico |

La evidencia depurada de preflight contiene `firstEqualsMiddle:true`, `middleEqualsLast:true`, `fullSnapshotsEqual:true`, junto con las tres horas indicadas. Los controles posteriores son obligatorios para alcanzar `verified` y promover el respaldo. El valor de recuperación común queda dentro del payload cifrado; no se conservan enlaces firmados ni bookmarks en claro.

Distribución de las 213 peticiones API: **5 metadatos, 203 consultas SQL de lectura, 4 bookmarks y 1 inicio de export**. La descarga firmada es una petición separada sin token API. No hubo lotes SQL mutantes ni restauración remota.

## Artefactos cifrados y evidencia

Fuera del repositorio, bajo la custodia existente:

```text
C:\Users\JV\AppData\Local\Kuwago\D1Backups\development\
  249fc1c0-e980-4197-a2f9-ced122f72dd2\backup.kwgbak
  249fc1c0-e980-4197-a2f9-ced122f72dd2\evidence.json
  backup-once-6d61db52-444c-476d-b258-64dd4e323bd5.attempt.json
  backup-once-6d61db52-444c-476d-b258-64dd4e323bd5.result.json
```

Ciphertext: **43 835 bytes**.

| Artefacto | SHA-256 |
|---|---|
| `backup.kwgbak` | `ce4405f5434cef2eaa2b23c2cfe0a75b24109b7b77971c394cf3e9312d736df9` |
| `evidence.json` | `2a877de11cd8ae58d96c75ff4afc7d3b413592a82baf775208dce486c61224a4` |
| Resultado depurado del intento | `d2681b231f94269819b819531fb1091f769f25ab4108d348f779a693130289c0` |

Los respaldos anteriores de operaciones `7a492026-01dd-49fc-9ecb-40997d5b9e56` y `62c608c3-60c6-41fd-a811-8c9f273fe259`, y sus evidencias, permanecen intactos. No se recifraron ni sustituyeron. La restauración aislada utiliza SQLite en memoria; no se conservó SQL descifrado en archivos.

## Cierre

Token y clave existente se introdujeron únicamente en el formulario privado y viajaron por pipe local. Se limpiaron los campos/referencias y buffers previstos por el flujo; no se promete borrado físico absoluto de memoria administrada. No se guardaron secretos en logs, historial, argumentos o repositorio. La revocación del token en Cloudflare permanece bajo control del usuario; no se modificó la credencial remotamente.

`backupExecutionApproved=false` otra vez; el estado local confirma `alreadyUsed:true`. Los permisos remotos generales y el permiso del lote de migraciones siguen bloqueados. No se reintentará el ID consumido.

**No se ejecutaron 0004–0006**, bootstrap de Super Admin, deploy, commit o push. Tampoco hubo cambios de Workers, Access, DNS, Hostinger o R2. Este resultado solo verifica el nuevo respaldo; no autoriza una continuación de migraciones. Se detiene para revisión.
