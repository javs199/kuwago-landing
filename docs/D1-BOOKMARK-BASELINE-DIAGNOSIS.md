# Diagnóstico del bookmark y propuesta de baseline verificado

25/10/2026 · America/Costa_Rica.

**Resultado: no hay cambio lógico observable respecto al respaldo restaurado.** Dos capturas actuales de la D1 coinciden entre sí y con el respaldo: **0 tablas de aplicación, 0 filas**, mismo fingerprint. El bookmark actual es posterior y distinto del histórico. La corrección local está preparada, **sin habilitar ni ejecutar migraciones**.

## 1. Alcance y evidencia

Solo se reconsultó la cuenta `7a8bcd7992a3de359d2aff87df2fb693`, D1 `kuwago-admin-db-development`, UUID `c5cfbe44-4fd0-4c2a-83c1-b833935534ba`.

Auditoría: `9e727e66-ad85-4d6f-b1a8-e976ab2397ce`.

Ventana: **15:01:55.748–15:01:59.304 de Costa Rica**, `2026-10-25T21:01:55.748Z`–`21:01:59.304Z`.

Quince solicitudes, todas HTTP 200: dos consultas de identidad, ocho consultas SQL de lectura y cinco consultas de bookmark. No hubo exportación, SQL remoto de escritura o restauración remota. El transporte de auditoría no expone métodos de exportación ni aplicación de lotes. El token se introdujo en una ventana local enmascarada y se descartó al terminar; no se solicitó la clave de recuperación ni se capturaron secretos/pantallas en Codex.

Se restauró nuevamente el archivo cifrado original en SQLite local aislada. Su ciphertext, evidencia y el informe aprobado coincidieron con los hashes fijados; ninguno se modificó. Los hashes de las seis migraciones también permanecen intactos.

## 2. Comparación de bookmarks y tiempos

Se usan etiquetas; **no se publican los valores ni hashes individuales de los bookmarks**. Los tiempos son de observación del cliente o creación de evidencia, no certificaciones independientes del reloj del servidor.

| Punto | Tiempo Costa Rica | Resultado y calidad de evidencia |
|---|---|---|
| B-pre: antes del export original | Dentro de 14:39:31.230–14:39:37.900 | No hay copia separada ni hora exacta de aquella petición. Su igualdad con B-backup se deduce del código y resultado verificado del flujo |
| B-export: `at_bookmark` del export | Dentro de la misma ventana original | El exportador exigió igualdad exacta con B-pre antes de aceptar la descarga. La respuesta cruda no se conservó; no se presenta como observación histórica independiente |
| B-backup: contenido del respaldo cifrado | Evidencia creada a las 14:39:36.712 | Se recuperó privadamente y se conservó el valor original; fue el comparado en la auditoría |
| B-fallo: consulta que bloqueó 0001 | Dentro de 14:51:13.253–14:51:17.246 | Solo quedó registrada la desigualdad frente a B-backup. El valor exacto y el instante de esa petición no se conservaron y no se pueden reconstruir como hechos |
| B-actual-1 | 15:01:55.748–15:01:56.184 | Distinto y posterior a B-backup |
| B-actual-2 | 15:01:57.643–15:01:57.915 | Igual a B-actual-1 |
| B-actual-3 | 15:01:59.020–15:01:59.304 | Igual a B-actual-1 y B-actual-2 |
| B-fijo-1 y B-fijo-2 | Consultas 15:01:56.184–56.671 y 15:01:58.580–59.020 | Ambas solicitaron el mismo instante `15:01:45.748`; devolvieron el mismo bookmark |

Por tanto, B-pre = B-export = B-backup está respaldado por las validaciones obligatorias del export completado, con los límites de retención indicados. B-fallo != B-backup está registrado, pero **no se puede comparar B-fallo exactamente con B-actual**, porque se descartó aquel valor. No se rellenó ese hueco con una estimación.

La documentación oficial explica que Time Travel usa puntos temporales, genera bookmarks automáticamente y mantiene estable la conversión de un timestamp fijo. No los define como hashes de contenido lógico. [Time Travel y bookmarks](https://developers.cloudflare.com/d1/reference/time-travel/).

**Conclusión técnica:** exigir que un bookmark actual de otra hora sea idéntico al punto histórico del respaldo es una condición adicional a la equivalencia de datos; aquí bloqueó aunque el estado lógico observado seguía coincidiendo. No se atribuye el avance a una escritura de negocio o a una tarea interna concreta de Cloudflare: esa causa física no se auditó. La evidencia y el contrato temporal explican por qué la desigualdad no demuestra una mutación lógica.

## 3. Esquema, filas y fingerprint

| Captura | Intervalo Costa Rica | Etapa | Tablas de aplicación | Filas | Coincide con respaldo |
|---|---|---:|---:|---:|---|
| Respaldo restaurado | Validado localmente antes de consultar | 0 | 0 | 0 | Referencia |
| Captura actual 1 | 15:01:56.671–15:01:57.643 | 0 | 0 | 0 | Sí |
| Captura actual 2 | 15:01:57.915–15:01:58.580 | 0 | 0 | 0 | Sí |

Fingerprint lógico compartido:

```text
2c183f6290f0877cb22085c7c6c4b7da5cfdb7cd3c56eb775520f4e77df555e6
```

La comparación incluye esquema de aplicación, columnas, tipos, valores y secuencias si existen; no se limita a conteos. Se comprobaron `quick_check` y claves foráneas. Las tablas reservadas `_cf_KV`/`_cf_METADATA` no se tratan como contenido de aplicación ni se leen sus datos internos. No se afirma igualdad byte a byte del almacenamiento físico de D1.

Esto demuestra equivalencia del **estado actual observado** con el respaldo; no prueba ausencia de cambios intermedios revertidos desde entonces, ni sustituye una auditoría histórica completa de actores/escrituras.

## 4. Custodia de la evidencia nueva

Fuera del repositorio, bajo la ACL de custodia existente:

```text
C:\Users\JV\AppData\Local\Kuwago\D1Backups\development\
  baseline-audit-9e727e66-ad85-4d6f-b1a8-e976ab2397ce.attempt.json
  baseline-audit-9e727e66-ad85-4d6f-b1a8-e976ab2397ce.result.json
  baseline-audit-9e727e66-ad85-4d6f-b1a8-e976ab2397ce.private-bookmarks.json
```

El resultado público solo contiene tiempos, comparaciones booleanas, conteos, fingerprint y HTTP/códigos depurados. El tercer archivo guarda B-backup y los cinco bookmarks nuevos **protegidos mediante DPAPI CurrentUser**, usando el helper existente y bloques de 28 bytes más marcador BKM1; no hay valores en claro. Es evidencia privada de control, no un respaldo nuevo ni una sustitución del contenedor con recuperación independiente.

Hashes de los registros utilizados como candidato revisable:

- Resultado: `f279c721d3ddd9bf46fba0ffbed1b5ef21f22d18e8b9d9d960bc0afdc800d6d3`.
- Registro privado: `cbbbccf942ffab08025dc075e0690741ba94aba1c1a1361a30d223f5c25192a2`.

Los registros privados se descifraron localmente para comprobar sus relaciones sin imprimirlos: el histórico coincide con el original del respaldo y las igualdades actuales/fijas concuerdan con el resultado. No se persiste una clave DPAPI sin envolver ni se publican secretos.

## 5. Corrección preparada, sin activar

La propuesta conserva el respaldo aprobado y lo mantiene como punto histórico de recuperación. No cambia su bookmark ni hashes. Añade un baseline de control distinto, vinculado a ese respaldo y a esta auditoría.

Para una futura ejecución explícitamente autorizada de **solo 0001**, la rama propuesta deberá:

1. Volver a verificar/restaurar el respaldo y validar los hashes de este candidato revisado.
2. Capturar un **baseline fresco dentro de esa ejecución**, no reutilizar ciegamente el bookmark de esta auditoría: tres bookmarks delimitan dos snapshots completos.
3. Exigir etapa 0, cero tablas de aplicación, ambos fingerprints iguales al respaldo y los tres bookmarks frescos idénticos. Cualquier cambio durante esa ventana bloquea.
4. Persistir antes de escribir un registro separado que preserve, cifrados con DPAPI, el bookmark original, el de esta revisión y el nuevo. Escribir con `wx`, fsync y verificar hash por lectura posterior. Sin evidencia confirmada, no escribir.
5. Repetir `inspect(0)`, verificar hashes y comprobar que el bookmark sigue siendo el del baseline fresco y que este tiene menos de 30 segundos.
6. Mantener la guarda SQL dentro del lote único que compara esquema e historial. Para esta propuesta estrictamente de etapa 0 no hay tablas de aplicación preexistentes; una creación concurrente cambia el esquema y aborta el lote. No se generaliza este mecanismo a bases con datos ni a 0002–0006.
7. Aplicar como máximo el lote aprobado de 0001, verificar etapa 1 e historial y detenerse. Nunca rebasar automáticamente un cambio detectado ni reintentar escrituras.

Archivos nuevos de auditoría: `safe-d1/baseline-readonly-transport.mjs`, `safe-d1/baseline-audit.mjs`, `scripts/d1-baseline-audit.mjs`, `scripts/baseline-audit-private.ps1` y `test/baseline-audit.test.mjs`, bajo `infra/cloudflare/dev/scripts` o `test` según corresponda.

Control nuevo: `infra/cloudflare/dev/scripts/safe-d1/verified-baseline-control.mjs`. Se adaptaron el runner/CLI de 0001 y su estado local para admitir esa rama únicamente mediante configuración de código aprobada. `captureDatabase` conserva por defecto las validaciones estrictas originales; la auditoría puede recopilar esquemas diferentes para informarlos, sin que esa opción alcance al escritor.

**Gates actuales:** `firstMigrationApproved=false`, `firstMigrationVerifiedBaselineEnabled=false`, `remoteExecutionEnabled=false`. El intento anterior sigue consumido. No se creó autorización de migración nueva y no se abrió su formulario.

## 6. Pruebas y límites

42/42 pruebas locales aprobadas: auditoría, 0001, ejecutor seguro y backup-only. Incluyen coincidencia lógica con distinto bookmark histórico, aceptación de baseline fresco en D1 local simulada, preservación del bookmark original, rechazo de cambios concurrentes y ausencia de evidencia durable, cambios de esquema, rollback local y ausencia de reintentos. Lint, TypeScript y build correctos. Las pruebas de migraciones operaron exclusivamente sobre fixtures locales, no sobre Cloudflare.

La igualdad observada de bookmarks actuales permite preparar el control, pero no garantiza que sigan iguales al autorizar otra fase. El baseline debe capturarse de nuevo según los pasos anteriores. La revisión no autoriza esa captura asociada a una escritura ni habilita la migración.

No se aplicó 0001 ni otra migración, no se hizo export adicional, restauración remota, despliegue, commit o push. No se investigaron otras bases o actores. El token se descartó localmente; no se revocó en Cloudflare ni se promete borrado físico absoluto de memoria administrada.

**Se detiene para revisar el diagnóstico y la corrección local antes de una nueva autorización.**
