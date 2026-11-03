# Preflight D1 DEV con nueva credencial Read

25/10/2026 · America/Costa_Rica · **PASS**.

Ejecutado después de que el usuario introdujo personalmente el token en el formulario privado existente y pulsó «Ejecutar solo lectura». No se solicitó ni capturó el secreto mediante herramientas de Codex. Inicio/fin: 13:57:00–13:57:01 de Costa Rica (`2026-10-25T19:57:00.363Z`–`2026-10-25T19:57:01.401Z`).

| Comprobación | Resultado |
|---|---|
| GET de metadatos | HTTP 200 |
| Nombre | `kuwago-admin-db-development`, coincidencia exacta |
| ID | `c5cfbe44-4fd0-4c2a-83c1-b833935534ba`, coincidencia exacta |
| Cuenta del endpoint fijo | `7a8bcd7992a3de359d2aff87df2fb693` |
| Consulta de esquema | HTTP 200; POST `/query` transportó exclusivamente el SELECT fijo existente |
| Definiciones encontradas | Una: tabla interna `_cf_KV` |
| Tablas de aplicación | 0 |
| `principals`, `services`, `d1_migrations` | Ausentes |
| Definiciones inesperadas / nombres descartados | 0 / 0 |
| Solicitudes remotas | Exactamente dos: GET de metadatos y SELECT de esquema |
| Reintentos / exportaciones / escrituras SQL | Ninguno |
| Descarte local de credencial | `credentialCleared=true`; estado del formulario `completed` |

Se reutilizaron `d1-read-credential.ps1` y `d1-read-diagnostic.mjs` de 2C.4. Se corrigió la selección del primer ejecutable Node cuando hay varias instalaciones y se endureció el criterio de éxito para este baseline vacío: cualquier definición no reconocida, incluso con nombre prefijado por `_` o no retenido en el reporte, impide PASS. Los únicos objetos permitidos en este baseline son las tablas internas reconocidas `_cf_KV` y `_cf_METADATA`.

Antes de abrir el formulario se preservó íntegramente la evidencia anterior mediante movimiento local, sin borrarla:

```text
infra/cloudflare/dev/.wrangler/phase2c4-history-c97b43f3-403d-44f5-869a-21a6e437f78a/
```

La evidencia nueva depurada está en `infra/cloudflare/dev/.wrangler/phase2c4/result.json`; el estado está en `status.json`. El marcador `attempt.lock` vuelve a impedir repeticiones accidentales. Todo ello está excluido de Git. Las definiciones SQL recibidas no se guardan; tampoco tokens, Authorization, cookies o respuestas crudas.

Pruebas previas exclusivamente simuladas: **5/5 aprobadas**, lint correcto y parser PowerShell sin errores. Se cubrieron orden GET→SELECT, objetivo fijo, errores 10000, falta de credencial, errores de red/redirecciones sin retry y rechazo de esquema administrativo/historial/nombres desconocidos.

El resultado confirma capacidad efectiva de lectura de esta credencial para estas dos operaciones sobre esta D1. La exclusividad de D1 Read y su caducidad son declaradas por el usuario; no se intentó escribir ni inspeccionar políticas para acreditarlas. El descarte del entorno/referencias locales no equivale a revocar el token en Cloudflare ni promete borrado físico absoluto de strings administradas.

No se usó `wrangler d1 migrations list`, no se inicializaron tablas, no se consultaron otras bases, no se exportó, no se ejecutaron migraciones ni SQL de escritura, ni se hicieron deploy, commit o push. La verificación de lectura no autoriza exportar ni migrar.

**Se detiene para revisión.**
