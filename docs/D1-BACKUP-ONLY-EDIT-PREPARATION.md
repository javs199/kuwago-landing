# Preparación local backup-only para posible token D1 Edit

25/10/2026 · America/Costa_Rica · **Preparado para revisión; ejecución remota bloqueada.**

Identificador nuevo: `490de7b9-dc5b-443c-9a29-9cd876f37b68`.

No representa una autorización para exportar: `backupExecutionApproved=false` y `backupRemoteEnabled=false`. No se creó token, abrió formulario, introdujo credenciales, realizó llamada remota, exportó, aplicó migración, hizo commit ni push.

## Cambios

Dentro de `infra/cloudflare/dev`:

- `scripts/safe-d1/backup-once-permit.mjs`: ID nuevo y bloqueo explícito antes de verificar custodia, crear marcador o emitir capacidad. Permiso previsto declarado: D1 Edit. El marcador exclusivo `wx` y consumo único en memoria se conservan.
- `scripts/d1-backup-once.mjs`: bloquea antes de leer stdin o aceptar credenciales. El resultado de una futura ejecución distinguirá el permiso previsto de su verificación independiente; no se introspecciona ni certifica la política del token.
- `scripts/d1-backup-once-status.mjs` — nuevo: imprime solamente el plan local no secreto, sin red ni emisión de permisos. Es la fuente compartida de ID/estado para el formulario.
- `scripts/backup-once-private.ps1`: rótulos D1 Edit temporal, cuenta/UUID visibles, advertencia de capacidad de escritura fuera de la herramienta y prohibición de SQL remoto mutante, migraciones, restauración remota y deploy. Explica posible bloqueo de consultas por el export. Campos y botón deshabilitados mientras falte autorización; también hay guarda dentro del evento del botón. No se abrió esta ventana.
- `test/backup-once.test.mjs`: tres regresiones adicionales de bloqueo, SQL mutante y coherencia del formulario/plan.

La preparación no permite elegir otra cuenta, UUID o SQL mediante argumentos/entorno. Tampoco permite activar la ejecución con una variable de entorno: la autorización sigue en código revisado. No se añadieron dependencias.

## Evidencia anterior preservada

Se compararon SHA-256 antes y después de la modificación. Coincidieron exactamente los tres archivos:

| Archivo anterior | SHA-256 sin cambios |
|---|---|
| `backup-once-610ee96e-140a-42ab-89ab-4db6072726bd.attempt.json` | `12583a4f7cc1828b9741a4b7188e67172d7287bc0516f6573e3a1e7ad62e09ef` |
| `backup-once-610ee96e-140a-42ab-89ab-4db6072726bd.result.json` | `7c62b6c431a2b4c1e8151e3302c2b2bf09b45ba040858f2c0fae74e4fb25bc0b` |
| `docs/D1-BACKUP-ONLY-REMOTE-ATTEMPT.md` | `23015edb504cbe491c4b38348770a8f95fe9dd0a802da36cfbd28cd0e66b58bb` |

Los dos primeros continúan bajo `C:\Users\JV\AppData\Local\Kuwago\D1Backups\development`. No se movieron, borraron ni sobrescribieron. El intento Read sigue consumido. No existe marcador ni resultado para el identificador nuevo.

## Controles conservados y verificados

| Control | Estado |
|---|---|
| Destino | Cuenta `7a8bcd7992a3de359d2aff87df2fb693`, UUID `c5cfbe44-4fd0-4c2a-83c1-b833935534ba`, `kuwago-admin-db-development` |
| Preflight futuro | ACL Windows, identidad, baseline etapa 0, integridad y bookmark válidos antes de exportar |
| SQL remoto | Lista cerrada de lecturas; CREATE, INSERT, UPDATE, DELETE, ALTER, DROP, PRAGMA mutante y sentencias concatenadas rechazados antes de enviar una petición |
| Alcance con Edit | Tener un token más amplio no agrega endpoints o SQL al transporte. Esa limitación de la herramienta no restringe el uso del token en otros programas |
| Un solo intento | Emisión exclusiva en disco, capacidad no falsificable por objeto de configuración, consumo único y prohibición de repetir `fullExport` tras éxito o error |
| Sondeo | Continúa exclusivamente el mismo trabajo; no reinicia uno rechazado o fallido |
| Cifrado | AES-256-GCM, DPAPI CurrentUser y recuperación independiente existentes, sin cambio de formato |
| Persistencia | Solo contenedor cifrado y evidencia depurada fuera del repositorio; limpieza de parciales y conservación de verificados |
| Restauración | SQLite en memoria aislada, hash/fingerprint, esquema y contenido, quick_check y FK; promoción solo tras éxito |
| Migraciones | No alcanzables desde el grafo de backup-only; ejecutor general sin habilitar |

Estas son comprobaciones de código y simulaciones locales. No se validó exportación real con D1 Edit. El rechazo Read 401/10000 no demuestra que Edit sea el mínimo oficial ni que el nuevo token vaya a resolverlo.

## Pruebas

**36/36 pruebas aprobadas**, cero omitidas/canceladas/fallidas: backup-only, control de intento único, lectura D1 simulada, formato de recuperación, verificador portable y prueba sintética. Lint, TypeScript y build correctos, sin upload. Parser PowerShell: cero errores.

Después del último ajuste de texto se repitieron las siete pruebas específicas de intento único y el parser: correctos. No se generó material de recuperación real ni se ejecutó el generador; los datos de las pruebas son exclusivamente sintéticos. Las restauraciones de fixtures no aplican las migraciones versionadas.

Comprobación local no sensible desde la raíz:

```powershell
node infra/cloudflare/dev/scripts/d1-backup-once-status.mjs
```

Devuelve el ID nuevo, `executionApproved:false`, `intendedPermission:"D1 Edit"` y `alreadyUsed:false`. La entrada de ejecución devuelve `BLOCKED` antes de consumir stdin. El formulario no está listo para aceptar secretos en este estado.

## Condiciones para una operación posterior

Revisar esta preparación y autorizar expresamente, por separado, credencial temporal y una única ejecución backup-only con el ID nuevo. Definir cuenta/alcance mínimo disponible, caducidad corta y revocación al terminar. No presumir restricción del token por UUID ni verificar su falta de permisos mediante una escritura.

Solo tras esa autorización se podrá activar la guarda específica, repetir las pruebas locales y abrir la captura privada; el gate remoto general y el ejecutor de migraciones deben seguir cerrados. Si la base cambió del baseline esperado, falla el bookmark o hay rechazo/timeout, detenerse sin ampliar permisos ni reiniciar el trabajo. El resultado real del export y su SQL siguen pendientes de verificación.

**Se detiene para revisión. No se solicita ni utiliza ninguna credencial.**
