# Ejecución única backup-only con credencial prevista D1 Edit

25/10/2026 · America/Costa_Rica · **FAIL: exportación rechazada con HTTP 401 / código 10000.**

Autorización: `490de7b9-dc5b-443c-9a29-9cd876f37b68`, ahora consumida.

Operación: `4eee8df1-a5e3-4011-877c-6bad9337e24e`.

Finalización: `2026-10-25T20:26:29.276Z`, 14:26:29 de Costa Rica.

## Resultado observado

| Control / operación | Resultado |
|---|---|
| Custodia y ACL Windows | PASS |
| Metadatos de la D1 fija | GET HTTP 200 |
| Identidad y esquema esperado | PASS; baseline etapa 0 |
| Lecturas de esquema e integridad | Cuatro solicitudes, todas HTTP 200 |
| Bookmark Time Travel | GET HTTP 200; formato validado |
| Inicio de exportación | Un único POST `/export`: **HTTP 401, código 10000** |
| Error local depurado | `backup_request_rejected` |
| Sondeos del trabajo / nuevos intentos | Cero / cero |
| Total solicitudes API | Siete: seis comprobaciones previas y un inicio de export rechazado |
| Descarga, cifrado y restauración del SQL real | No alcanzados; parada en etapa `export` |
| Respaldo aceptado | No, `verified=false` |
| Limpieza / credenciales | `cleanupComplete=true`, `credentialDisposed=true` |
| Estado posterior | Guarda específica cerrada y autorización consumida; sin nuevas consultas remotas |

Destino exacto: cuenta `7a8bcd7992a3de359d2aff87df2fb693`, base `kuwago-admin-db-development`, UUID `c5cfbe44-4fd0-4c2a-83c1-b833935534ba`.

El token temporal y la clave existente se introdujeron únicamente en el formulario privado con entrada oculta y pasaron al hijo Node por pipe local. No se solicitaron en el chat, guardaron en argumentos/archivos/logs ni se leyeron desde Codex. No se hicieron capturas de pantalla ni se generó otra clave de recuperación.

**Límite de la evidencia:** el permiso previsto fue D1 Edit; la política efectiva del token no se inspeccionó independientemente (`tokenPermissionIndependentlyVerified=false`). La credencial aportada fue aceptada en las seis lecturas previas, pero no para exportar. El 10000 es genérico y la descripción del informe fue normalizada por el cliente: no demuestra por sí solo caducidad, requisito mínimo de permisos o causa exclusiva del rechazo.

## Custodia y cierre

Se conservaron únicamente registros depurados de este intento bajo la carpeta protegida, fuera del repositorio:

```text
C:\Users\JV\AppData\Local\Kuwago\D1Backups\development\
  backup-once-490de7b9-dc5b-443c-9a29-9cd876f37b68.attempt.json
  backup-once-490de7b9-dc5b-443c-9a29-9cd876f37b68.result.json
```

La verificación local posterior confirmó ausencia del directorio final y del parcial de la operación y retirada de `backup-only.lock`. No existe un respaldo real verificado de esta ejecución. El marcador permanente de consumo se mantiene: no se borró para reintentar. Los respaldos sintéticos y la evidencia del intento Read anterior se conservaron.

Se volvió a poner `backupExecutionApproved=false` al terminar; `backupRemoteEnabled=false` y el ejecutor de migraciones permanecen cerrados. El descarte local de secretos no revoca el token en Cloudflare ni garantiza borrado físico de todas las cadenas administradas.

## Verificaciones previas a esta ejecución

36/36 pruebas locales aprobadas, lint, TypeScript y build correctos. Los tests no consumieron la autorización real. Se añadió una clasificación local cerrada de errores para informar fallos sin registrar excepciones crudas, SQL, enlaces o secretos. La entrada real solo se habilitó para el identificador autorizado y comenzó al pulsar el usuario el botón del formulario.

No se reintentó la exportación, amplió permisos, creó credenciales, hizo SQL remoto mutante, ejecutó migraciones, restauró D1 remoto ni realizó despliegue, commit o push. No se hicieron otras llamadas remotas después del rechazo.

**Se detiene con el intento consumido. Cualquier diagnóstico remoto o nueva ejecución requerirá autorización independiente.**
