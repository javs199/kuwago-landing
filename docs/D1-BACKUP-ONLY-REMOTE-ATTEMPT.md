# Único intento remoto backup-only con D1 Read

25/10/2026 · America/Costa_Rica · **FAIL: exportación rechazada; operación detenida.**

El usuario autorizó una única ejecución sobre `kuwago-admin-db-development`, con su token D1 Read existente y la clave de recuperación ya custodiada, introducidos exclusivamente en un formulario local con ambos campos ocultos. No se generó otra clave de recuperación ni se solicitó ampliar permisos. No se leyeron campos/portapapeles ni se hicieron capturas desde herramientas de Codex.

## Resultado depurado

| Comprobación | Resultado |
|---|---|
| ACL y custodia Windows | PASS, verificadas antes de consumir la autorización y al iniciar el almacenamiento |
| Cuenta fija | `7a8bcd7992a3de359d2aff87df2fb693` |
| D1 | `kuwago-admin-db-development` |
| UUID fijo | `c5cfbe44-4fd0-4c2a-83c1-b833935534ba` |
| Identidad y esquema esperado | PASS, baseline de etapa 0, sin migraciones de aplicación |
| Lecturas de esquema/integridad | Cuatro solicitudes SQL de lectura, HTTP 200 |
| Metadatos | GET HTTP 200 |
| Bookmark Time Travel | GET HTTP 200; formato validado, no publicado en el informe |
| Inicio de exportación | Un único POST `/export`: **HTTP 401, código 10000** |
| Descripción conservada | Authentication or authorization rejected; no retry |
| Sondeos posteriores / segundo export | Cero / cero |
| Total solicitudes API | Siete: seis comprobaciones previas y un inicio de export rechazado |
| Respaldo descargado, cifrado o restaurado | **No**; el flujo se detuvo antes de esas etapas |
| Respaldo verificado | `verified=false` |
| Limpieza / descarte de credenciales | `cleanupComplete=true`, `credentialDisposed=true` |

Finalización: `2026-10-25T20:11:05.423Z`, 14:11:05 de Costa Rica.

Operación: `4b02e999-cab7-47a8-9899-918afbe8f9fa`.

Autorización consumida: `610ee96e-140a-42ab-89ab-4db6072726bd`.

La comprobación local posterior confirmó ausencia del directorio final y del parcial de esta operación y retirada de `backup-only.lock`. Se conserva deliberadamente el marcador permanente de autorización consumida; no se borra para reintentar.

Evidencias depuradas fuera del repositorio, bajo la custodia ACL existente:

```text
C:\Users\JV\AppData\Local\Kuwago\D1Backups\development\
  backup-once-610ee96e-140a-42ab-89ab-4db6072726bd.attempt.json
  backup-once-610ee96e-140a-42ab-89ab-4db6072726bd.result.json
```

No contienen token, clave de recuperación, SQL privado, URL firmada, bookmark ni cuerpos crudos de errores. El descarte local no revoca la credencial en Cloudflare ni promete borrado físico absoluto de memoria administrada. No se modificaron ni borraron los respaldos o paquetes sintéticos anteriores.

## Controles de esta ejecución

Se reutilizó `runBackupOnly`, el transporte de destino fijo, AES-GCM/DPAPI/recuperación, almacenamiento cifrado, verificación de ACL y restauración SQLite existentes. El modo remoto general continúa en `backupRemoteEnabled=false`. Una entrada adicional consume un permiso de un solo uso mediante archivo exclusivo `wx`; el token de capacidad solo vive en memoria y no se puede fabricar con un objeto de configuración. No se habilitó el ejecutor de migraciones.

El transporte solo permite metadatos, SQL de lectura de lista cerrada, bookmark y export; rechaza una segunda llamada a export incluso después de un fallo. Los sondeos de un trabajo existente se distinguen de un inicio nuevo; no se hizo ninguno porque el inicio fue rechazado. Se añadieron diagnósticos que guardan únicamente operación, método, HTTP, códigos numéricos y descripción genérica, sin copiar mensajes crudos del servidor.

Archivos nuevos bajo `infra/cloudflare/dev`: `scripts/safe-d1/backup-once-permit.mjs`, `scripts/d1-backup-once.mjs`, `scripts/backup-once-private.ps1` y `test/backup-once.test.mjs`. Se adaptaron `safe-d1/backup-transport.mjs` para capacidad de un solo uso/diagnóstico y `safe-d1/backup-only.mjs` para exigir explícitamente etapa 0 y registrar comprobaciones/resultados depurados. No se cambiaron migraciones, contratos o frontend.

Pruebas previas: **29/29 aprobadas**, incluidos rechazo de permisos sin retry, capacidad falsificada, aislamiento, restauración sintética y regresiones de lectura. Lint, TypeScript y build correctos; parser PowerShell sin errores. Ninguna prueba automatizada consumió el permiso remoto real.

## Interpretación y parada

Esta credencial sí fue aceptada para metadatos, lecturas de esquema/integridad y bookmark, pero no para exportar. El código 10000 es un rechazo genérico de autenticación/autorización del endpoint; no demuestra por sí solo cuál es el permiso mínimo universal ni convierte D1 Edit en requisito oficialmente confirmado.

No se amplió la credencial, no se creó otra, no se repitió el export y no se ejecutaron SQL de escritura, migraciones, restauraciones remotas, despliegues, cambios de Access/DNS/Hostinger, commit o push. Tampoco se hicieron nuevas consultas remotas de diagnóstico tras el rechazo.

**Se detiene.** Antes de otro intento se requiere revisión del rechazo y evidencia del permiso aplicable o una nueva decisión explícita; la autorización actual está consumida y no se reutilizará.
