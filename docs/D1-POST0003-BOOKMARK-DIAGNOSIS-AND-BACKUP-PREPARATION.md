# Estado posterior a 0003 — diagnóstico de bookmarks y preparación backup-only

25/10/2026 · America/Costa_Rica · **Inspección y pruebas locales únicamente. Operaciones remotas bloqueadas.**

## 1. Conclusión y límite de certeza

El lote anterior aplicó y verificó 0002 y 0003. La parada ocurrió en la comparación **first/middle/last del preflight de 0004**, no en el control que enlaza el bookmark posterior a 0003 con el primer bookmark de la siguiente etapa.

Se identifican exactamente las solicitudes implicadas, pero **no puede recuperarse cuál de los dos pares falló**: los tres valores del preflight rechazado no se conservaron. La evidencia solo contiene la secuencia de peticiones, sus códigos HTTP y el error de igualdad conjunta. No se ha inventado esa información ni se repitieron consultas remotas para intentar reconstruir el pasado.

## 2. Evidencias verificadas

Se preservó `D1-MIGRATIONS-0002-0006-REMOTE-RESULT.md`. Su SHA-256 local es `bfdd47e6941216c101cfb829587454d4faf658783b1b3162a164f3b24d9674d2`.

Resultado privado de la autorización `96a25c8d-186f-4b67-9653-1b399294903f`: SHA-256 `8d4410b2dae23af05ce063814152c5f2562d8d2213ab21757323a136a509d5f2`. Los baselines previos a 0002 y 0003 coinciden con sus hashes publicados. Se descifraron localmente sus bookmarks mediante DPAPI **solo para comparar igualdad/orden**, sin imprimirlos ni guardarlos en claro.

Se añadió el diagnóstico reproducible local `infra/cloudflare/dev/scripts/d1-bookmark-stage3-diagnosis.mjs`. No importa transportes remotos ni solicita credenciales; verifica hashes y emite exclusivamente relaciones booleanas, ordinales de peticiones y tiempos ya capturados.

## 3. Secuencia exacta del intento anterior

Los números siguientes son ordinales, comenzando en 1, dentro de las **581 peticiones API** conservadas en `.result.json`. No son bookmarks ni identificadores de datos.

| Solicitudes | Comprobación / operación | Lo demostrado |
|---|---|---|
| 33, 86, 139 | first, middle, last del baseline previo a 0002 | Iguales; los dos snapshots coincidieron con el respaldo de etapa 1 |
| 156 | Última comprobación de actualidad antes de 0002 | Igual al baseline anterior |
| 157 | Lote mutante de 0002 | HTTP 200; una única ejecución |
| 174, 227 | Bookmark anterior y posterior al snapshot de postflight de 0002 | Iguales; postflight aprobado |
| 244, 297, 350 | first, middle, last del baseline previo a 0003 | Iguales; 244 coincide con el bookmark posterior a 0002 |
| 367 | Última comprobación de actualidad antes de 0003 | Igual al baseline anterior |
| 368 | Lote mutante de 0003 | HTTP 200; una única ejecución |
| 386, 445 | Bookmark anterior y posterior al snapshot de postflight de 0003 | Iguales; postflight aprobado |
| 463 | first del preflight de 0004 | Igual a 386/445: el control `requireOriginalBookmark` se superó |
| 522 | middle, después del primer snapshot para 0004 | Valor individual no conservado |
| 581 | last, después del segundo snapshot para 0004 | Valor individual no conservado; aquí queda completa la comparación que falló |

El error `live_baseline_concurrent_bookmark_change` se lanza después de verificar los dos fingerprints completos contra el estado esperado posterior a 0003. Por el orden de las condiciones del código ejecutado, se superó la comparación lógica, pero no `first === middle && middle === last`.

Por tanto, el cambio se acota a **463→522, 522→581, o ambos**. No hay forma de elegir uno de esos casos con la evidencia retenida. No hubo ninguna petición `migration_batch` después de la 368: el segmento del preflight de 0004 contenía únicamente lecturas propias del ejecutor.

### Cambios esperados tras las migraciones

- La comparación privada demuestra que el bookmark fresco previo a 0002 y el posterior a 0002 **son distintos y están ordenados hacia adelante**. Hubo una escritura autorizada entre ellos; el avance es compatible con ese intervalo. No se considera un fallo de concurrencia por cruzar deliberadamente esa escritura.
- El bookmark posterior a 0002 coincide con el baseline previo a 0003; eso está demostrado por el campo histórico/fresco protegido del segundo baseline.
- Después de 0003 se estableció un nuevo bookmark de recuperación desde su postflight estable, no desde el baseline previo a escribir 0003. Sus valores individuales no quedaron guardados, por lo que no se puede demostrar retrospectivamente la desigualdad entre el bookmark anterior y el posterior a esa escritura; sí se sabe que el postflight pasó y que el primero del siguiente preflight coincidió con él.
- La discrepancia que detuvo 0004 surgió **dentro de sus lecturas previas**, después de esa transición ya verificada. No se explica simplemente diciendo que 0002 o 0003 escribieron antes.

No está demostrada la causa del avance durante esas lecturas. No se atribuye a otro usuario, un Worker o un error de Cloudflare. Tampoco una igualdad de snapshots excluye todo posible cambio transitorio. No se relajó la guarda ni se reinterpretó el error como éxito.

### Tiempos disponibles

En Costa Rica, el baseline previo a 0002 comenzó a las **19:10:13.083** y se verificó a las **19:10:23.332**. El previo a 0003 comenzó a las **19:10:35.831** y se verificó a las **19:10:46.465**. La parada final ocurrió a las **19:11:10.956**, el 25/10/2026. No hay timestamps individuales de las solicitudes 463, 522 y 581; no se deducen tiempos exactos de escritura a partir de los timestamps de los baselines.

## 4. Ajuste local del baseline: evidencia, no tolerancia adicional

El ejecutor ya reiniciaba correctamente su checkpoint después de cada migración verificada usando el fingerprint y bookmark de su postflight. No se encontró que comparara por error todas las etapas con el bookmark inicial de la etapa 1.

Se prepararon mejoras para **conservar evidencia duradera de ese mismo mecanismo**:

- `captureBatchBaseline` puede registrar también el intento rechazado: cada lectura first/middle/last con hora propia, fingerprints de ambos snapshots y comparaciones booleanas. Las igualdades exigidas no cambian.
- `persistBatchObservation` protege los valores individuales y el bookmark histórico con DPAPI antes de persistirlos fuera del repositorio, con creación exclusiva, fsync y hash releído. El registro es diagnóstico y no concede capacidad de escritura.
- Tras un postflight estable, `persistBatchPostflight` conserva el fingerprint completo, bookmark protegido y hora, antes de marcar la etapa verificada. La siguiente etapa usa ese mismo checkpoint. El fallo de persistencia detiene el lote, no abre una excepción.
- Se mantienen el enlace estricto con el checkpoint anterior, dos snapshots iguales, triplete estable, caducidad de 30 segundos, última lectura inmediatamente anterior al escritor y las guardas SQL transaccionales de esquema, historial, seeds y filas completas.
- Un cambio lógico, cambio de bookmark entre etapas o dentro del preflight sigue siendo terminal. No hay reintentos, estabilización por sondeos repetidos, renovación silenciosa ni aceptación automática de un bookmark diferente.

Estas mejoras están conectadas al CLI ya consumido, pero **su permiso continúa bloqueado y no puede reanudarse**. No se creó un permiso nuevo para migraciones. Las observaciones y checkpoints nuevos no reconstruyen retroactivamente la evidencia que faltó en el intento anterior.

## 5. Preparación del respaldo posterior a 0003

Nuevo ID preparado, **sin consumir ni autorizar ejecución remota**:

`6d61db52-444c-476d-b258-64dd4e323bd5`.

Destino fijo:

```text
Cuenta: 7a8bcd7992a3de359d2aff87df2fb693
D1: kuwago-admin-db-development
UUID: c5cfbe44-4fd0-4c2a-83c1-b833935534ba
```

Estado esperado fijado en `backup-stage-three.mjs`:

- Etapa 3 exclusivamente, hash de esquema `7b8fd74fa51a798fced27ea83491e8b9c18dc324539efcb7daf217914630f8f6`.
- **24 tablas de aplicación**: las 21 iniciales más `admin_role_definitions`, `admin_role_permissions` y `administrator_roles`. El respaldo también conserva `d1_migrations` y `sqlite_sequence`: la simulación restaura **26 tablas** en total.
- Historial exactamente con ids 1, 2 y 3 y nombres `0001_admin_catalog.sql`, `0002_integrity_guards.sql`, `0003_access_rbac.sql`; fechas presentes y válidas. Nada de 0004.
- Definiciones/permisos legacy y canónicos exactamente iguales a los seeds aprobados. Administradores, membresías y todas las demás tablas de contenido vacías.
- FK/quick_check aprobados, sin tablas, índices o triggers inesperados. Hashes de las seis migraciones originales intactos.
- Evidencias fijadas por hash del resultado parcial anterior, sus dos migraciones verificadas y su historial final, más ausencia de marcadores de escritura de 0004–0006. Backups anteriores de etapa 0 y 1 con sus hashes originales.

### Fingerprint esperado: dato no recuperable del pasado

El resultado anterior guarda el hash de esquema y los nombres de las migraciones, pero **no el fingerprint completo posterior a 0003 ni las nuevas fechas exactas del ledger**. El fingerprint interno usado durante aquel intento no se puede derivar del hash de esquema, y las huellas previas a 0003 no permiten recuperar las filas. No se fabricó un valor fijo ni se afirma una comparación contra un fingerprint histórico inexistente.

El flujo preparado para una futura autorización establece un baseline actual **solo tras validar todos los requisitos de etapa 3**, rodeando dos snapshots completos con tres bookmarks iguales. Su fingerprint se convierte en la referencia exacta para ese respaldo. Antes de iniciar el único export se comprueba estabilidad; después del export se exigen el mismo bookmark y fingerprint; la restauración SQLite debe producir exactamente el mismo snapshot, con tipos, todas las filas, ledger, fechas y secuencias.

Esto prueba coherencia con el estado validado durante ese futuro preflight. No puede certificar retrospectivamente que una fecha desconocida del historial nunca haya cambiado desde el postflight anterior. Si se requiere demostrar esa identidad histórica adicional, falta evidencia y deberá mantenerse el bloqueo hasta definirla; no se presenta el nuevo snapshot como una prueba del pasado.

### Cifrado, límites y custodia

Se reutilizan formulario privado, pipe, token y clave existente en memoria, permiso de un solo uso con marcador `wx`, un único inicio de export, transporte fijo sin SQL mutante, descarga sin enviar token API a la URL firmada, AES-256-GCM, DPAPI y recuperación independiente. Se revalidan ACL y bytes cifrados releídos; SQLite aislada compara el fingerprint completo antes de promover el archivo. La limpieza no elimina un respaldo ya verificado.

Raíz fuera de Git: `C:\Users\JV\AppData\Local\Kuwago\D1Backups\development`. El futuro artefacto recibe directorio propio por UUID de operación. No se sustituyen los respaldos de operaciones `7a492026-01dd-49fc-9ecb-40997d5b9e56` y `62c608c3-60c6-41fd-a811-8c9f273fe259` ni sus evidencias. El fingerprint y bookmark del respaldo quedan dentro del payload cifrado.

Si los bookmarks de pre-export difieren, se conserva además evidencia depurada de **qué igualdad falló y las horas de observación**, sin valores en claro. El export no comienza. No se repite automáticamente una solicitud fallida.

## 6. Archivos del cambio

Nuevos:

- `infra/cloudflare/dev/scripts/safe-d1/backup-stage-three.mjs`.
- `infra/cloudflare/dev/scripts/d1-bookmark-stage3-diagnosis.mjs`.
- `infra/cloudflare/dev/test/backup-stage-three.test.mjs`.
- `infra/cloudflare/dev/test/baseline-observation.test.mjs`.
- Este informe.

Modificados:

- `safe-d1/backup-only.mjs`, `backup-once-permit.mjs`, CLI `d1-backup-once.mjs`, plan `d1-backup-once-status.mjs` y `backup-once-private.ps1`: etapa 3, ID nuevo y ejecución bloqueada.
- `safe-d1/verified-baseline-control.mjs`, `migration-batch-runner.mjs` y CLI `d1-migrate-0002-0006.mjs`: observaciones y postflight duraderos, sin cambiar las igualdades ni habilitar el intento consumido.
- Pruebas `backup-once.test.mjs`, `backup-stage-one.test.mjs`, `migration-batch.test.mjs`: expectativa del plan actual y regresiones de los flujos existentes.

Los archivos originales de las migraciones y los informes aprobados anteriores no se modificaron.

## 7. Verificación local

Desde `infra/cloudflare/dev`:

```text
node --test test/backup-stage-three.test.mjs test/backup-stage-one.test.mjs test/backup-once.test.mjs test/backup-only.test.mjs
32/32 PASS

node --test test/baseline-observation.test.mjs test/migration-batch.test.mjs test/migration-0001.test.mjs test/baseline-audit.test.mjs
24/24 PASS

node --test test/backup-stage-three.test.mjs
6/6 PASS (repetidas tras añadir los diagnósticos de pares de bookmarks)

npm run lint: PASS
npm run build: PASS, incluye TypeScript; sin upload
Parser PowerShell backup-once-private.ps1: PASS
node scripts/d1-bookmark-stage3-diagnosis.mjs: evidencia local verificada
node scripts/d1-backup-once-status.mjs: etapa 3, 24 tablas, historial 0001–0003, executionApproved:false, alreadyUsed:false
```

Las pruebas cubren cada par de bookmarks por separado, rechazo del enlace al checkpoint anterior, cambio lógico, fallo de persistencia, última comprobación de actualidad, carrera de datos tras la última lectura, rollback por etapa, interrupciones, restauración incompleta, etapas erróneas, cambios de ledger y seeds, cifrado y preservación del respaldo. Se usan fixtures locales y claves sintéticas; no se solicitaron credenciales reales.

## 8. Estado para revisión

| Elemento | Estado |
|---|---|
| Diagnóstico del punto de parada | Comprobación y solicitudes identificadas |
| Par exacto cambiado / causa del avance histórico | No determinable con la evidencia retenida |
| Guarda de concurrencia | Conservada, sin tolerancias nuevas |
| Observabilidad futura y checkpoint duradero | Implementados y probados localmente |
| Preparación backup-only etapa 3 | Lista para revisión local |
| Fingerprint actual remoto | No consultado; requiere futuro preflight autorizado |
| Ejecución remota del respaldo | Bloqueada; ID sin consumir |
| Continuación 0004–0006 | Bloqueada; no autorizada por esta preparación |

No se abrió el formulario, se solicitaron secretos, hicieron llamadas a Cloudflare, exportaciones remotas, SQL remoto, migraciones remotas, despliegues, cambios de infraestructura, commits ni push. Se detiene para revisión.
