# Backup-only posterior a 0001 — preparación local

25/10/2026 · America/Costa_Rica · **GO para revisión local; ejecución remota bloqueada.**

ID nuevo de ejecución/autorización preparada: `d4c76ea9-2bab-4817-a99e-f8032685aa35`. No consumido. `backupExecutionApproved=false`, `backupRemoteEnabled=false` y el bloqueo general de migraciones siguen desactivados para operación remota. No se abrió el formulario ni se solicitaron credenciales.

## Destino y estado exigido

- Cuenta fija: `7a8bcd7992a3de359d2aff87df2fb693`.
- D1 fija: `kuwago-admin-db-development`, UUID `c5cfbe44-4fd0-4c2a-83c1-b833935534ba`.
- Etapa 1 exclusivamente; hash del esquema `9faeb21e6b3c899dbe1e3fc2c70f5b25552e9f0169162a679f163ee5855aa26d`.
- Las 21 tablas de aplicación están enumeradas explícitamente en `backup-stage-one.mjs`; además se conserva `d1_migrations` y, cuando existe, `sqlite_sequence`.
- Historial exacto: id 1, `0001_admin_catalog.sql`, una única fila y fecha válida. No se acepta etapa vacía ni 0002 aplicada.
- Seeds originales de roles/permisos intactos; todas las demás tablas de aplicación vacías. No se aceptan administradores, contenido o auditoría inesperados como parte de esta instalación inicial.
- Hashes y orden de las seis migraciones sin cambios. El informe y resultado aprobados de 0001 están fijados mediante SHA-256; se comprueba su estado de éxito, esquema e historial.

**Fingerprint actual:** el resultado histórico de 0001 no contiene el fingerprint completo ni la fecha exacta del ledger. No se inventó un valor a partir del hash de esquema. En una futura ejecución autorizada se capturará el snapshot completo del estado actual validado, incluyendo tipos, valores, historial, fecha y secuencia. Su SHA-256 deberá coincidir antes/después del export y con la restauración aislada. SQL, bookmark y fingerprint de origen quedan dentro del payload cifrado, sin filas ni bookmarks en logs. Un cambio lógico o de bookmark impide promover el respaldo.

## Flujo preparado, sin ejecutar

1. Reutilizar `backup-once-private.ps1`, ahora etiquetado como etapa 1. Consulta el mismo plan local que el CLI; valida destino, etapa, cantidad de tablas e historial. Con el flag actual, entradas y botón remoto están deshabilitados.
2. Una autorización posterior deberá habilitar exclusivamente este intento. El CLI bloquea antes de leer stdin cuando no hay autorización; argumentos y variables no habilitan el flujo.
3. Comprobar las evidencias fijadas de 0001 y los hashes del respaldo anterior. Capturar token y clave existente únicamente en campos ocultos y pipe privado; nunca en argumentos.
4. Consumir el permiso de un solo uso mediante marcador exclusivo `wx`, manteniendo todos los marcadores/resultados anteriores. El resultado del intento usa el ID nuevo; el artefacto cifrado recibe además un UUID de operación propio.
5. Validar ACL/custodia, identidad, esquema, historial, seeds, ausencia de contenido e integridad. Capturar snapshot y bookmark válido.
6. Iniciar como máximo un export completo. El sondeo acotado solo consulta el mismo trabajo, no reinicia un export. Cualquier rechazo o interrupción detiene el intento.
7. Revalidar etapa 1 y snapshot completo tras exportar; exigir igualdad del bookmark y fingerprint. Descargar sin transmitir el token a la URL firmada; no persistir esa URL.
8. Cifrar mediante AES-256-GCM con DPAPI y recuperación independiente existentes. Comprobar ambos descifrados y los bytes cifrados releídos del disco.
9. Restaurar en SQLite aislada y comparar el fingerprint completo del origen, incluyendo seeds, historial y secuencia. Solo entonces promover el archivo y evidencia de verificación.
10. Limpiar credenciales y referencias, descartar temporales no verificados y detenerse. No existe escritor SQL ni migrador en el grafo de imports del CLI backup-only.

## Custodia y respaldo previo

Raíz existente fuera del repositorio: `C:\Users\JV\AppData\Local\Kuwago\D1Backups\development`.

Se reutilizan verificación NTFS/ACL, lock, escritura exclusiva, cifrado, limpieza y restauración. El respaldo nuevo tendrá su directorio propio. El archivo original de operación `7a492026-01dd-49fc-9ecb-40997d5b9e56` y su evidencia conservan exactamente sus hashes fijados; no se recifraron ni sustituyeron. Los informes de intentos anteriores y de 0001 permanecen intactos.

La nueva preparación **no convierte el futuro respaldo de etapa 1 en permiso de migración**. La validación del recibo histórico de etapa 0 y el ejecutor específico de 0001 permanecen sin ampliación. La continuación 0002–0006 requiere su propio ejecutor revisado y autorización.

## Archivos

Creado:

- `infra/cloudflare/dev/scripts/safe-d1/backup-stage-one.mjs`: estado esperado, lista de tablas, evidencias fijadas y comprobación del snapshot.
- `infra/cloudflare/dev/test/backup-stage-one.test.mjs`: siete grupos de regresión local.
- Este informe.

Modificado:

- `infra/cloudflare/dev/scripts/safe-d1/backup-only.mjs`: pre/postflight etapa 1, comparación estricta de fingerprint y evidencia de restauración.
- `infra/cloudflare/dev/scripts/safe-d1/backup-once-permit.mjs`: ID nuevo; flag remoto sigue falso.
- `infra/cloudflare/dev/scripts/d1-backup-once.mjs`: preparación fijada a etapa 1.
- `infra/cloudflare/dev/scripts/d1-backup-once-status.mjs`: plan local con etapa, tablas e historial esperado.
- `infra/cloudflare/dev/scripts/backup-once-private.ps1`: etiquetas y validación del plan etapa 1; interfaz no abierta.
- `infra/cloudflare/dev/test/backup-once.test.mjs`: expectativa actualizada a etapa 1.

## Comprobaciones ejecutadas

Desde `infra/cloudflare/dev`:

```text
node --test test/backup-stage-one.test.mjs test/backup-once.test.mjs test/backup-only.test.mjs test/backup-readiness.test.mjs test/safe-migration-runner.test.mjs
56/56 PASS
npm run lint: PASS
npm run build: PASS (incluye TypeScript; compilación local, sin upload)
Parser PowerShell de backup-once-private.ps1: PASS
node scripts/d1-backup-once-status.mjs: bloqueado, etapa 1, ID sin consumir
```

La simulación válida usó D1 workerd efímera local y restauración SQLite: 21 tablas de aplicación + ledger + secuencia, 23 tablas restauradas. Se probaron etapas incorrectas, tablas/historial/seeds/contenido inesperados, cambio del timestamp del ledger, bookmark ausente o cambiado, dump incompleto, interrupción, bloqueo del CLI y ausencia de escritor en el grafo de imports. Las regresiones existentes cubrieron ACL, cifrado, clave incorrecta, corrupción, limpieza fallida, doble ejecución, destino fijo, límites y un solo inicio de export.

En la primera corrida un fixture adversarial intentó insertar un rol que el CHECK de D1 rechazó antes de probar el respaldo; se corrigió el fixture para alterar los grants existentes. La corrida final completa indicada pasó sin fallos. No se cambiaron las restricciones del esquema.

## Matriz de revisión

| Control | Estado |
|---|---|
| Preparación local etapa 1 y simulación de restauración exacta | GO |
| Preservación del respaldo y evidencias anteriores | GO, hashes locales comprobados |
| Destino fijo, formulario privado y permiso de un solo uso | GO local, flag deshabilitado |
| Captura real del fingerprint/bookmark de etapa 1 | Pendiente de ejecución expresamente autorizada |
| Nuevo export remoto | NO-GO sin autorización posterior y revisión de este cambio |
| Migraciones / bootstrap / despliegues | Fuera del alcance; no habilitados |

No hubo llamadas a Cloudflare, exportaciones remotas, SQL remoto, migraciones remotas, despliegues, commits ni push. Los tokens y la clave real no se solicitaron ni utilizaron; las pruebas criptográficas usaron exclusivamente material sintético local. La evidencia real nueva de respaldo sigue pendiente.
