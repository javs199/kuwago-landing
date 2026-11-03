# 0004 — reconciliación de lectura, checkpoint y preparación de respaldo

25/10/2026 · America/Costa_Rica · **0004 confirmada por reconciliación remota exclusivamente de lectura. Sin exportación ni nuevas migraciones remotas.**

Auditoría consumida: `597b711f-55c9-432d-945d-12eaa3ac5cae`.
Inicio: **19:49:50.600**. Finalización: **19:50:09.617** (`2026-10-26T01:50:09.617Z`).

## 1. Resultado verificable

| Control | Resultado |
|---|---|
| Identidad | Cuenta `7a8bcd7992a3de359d2aff87df2fb693`; D1 `kuwago-admin-db-development`; UUID `c5cfbe44-4fd0-4c2a-83c1-b833935534ba` |
| Historial | Exactamente 0001, 0002, 0003 y 0004, ids 1–4, sin 0005/0006 |
| SQL de 0004 | SHA-256 `dfa41753ca3e91628077ceec2557ec8d77a02ef59062439e8adaf7780a19550b`, coincide con manifiesto y registro de inicio del intento original |
| Hash registrado en D1 | **No existe esa columna**: `d1_migrations` guarda id, nombre y fecha. No se presenta el hash local como si estuviera almacenado en D1 |
| Esquema | Etapa 4, SHA-256 `05b62a741ad2a8b84caac31dbd9977cb19840e7d588dfb2c3e92ce7a1e25e26f` |
| Fingerprint esperado y remoto | `df24b03cf675ef1cebb593888fbcc5f4e5765aed84f061fe358e6b344de1c010` |
| Comparación completa | Dos snapshots iguales entre sí y al resultado esperado; **sin diferencias** |
| Tablas / filas | **26 tablas de aplicación**; 28 incluyendo `d1_migrations` y `sqlite_sequence`; 53 filas totales |
| Integridad y contenido | quick_check/FK correctos; seeds originales y canónicos correctos; sin administradores, asignaciones o contenido comercial |
| Bookmarks | Tres lecturas estables; first=middle=last |
| Solicitudes | **146**, todas HTTP 200: 3 metadatos, 140 consultas SQL de lectura y 3 bookmarks |
| Credencial | Entrada privada; `credentialDisposed:true`; sin secreto en argumentos, archivos, logs o informe |

Se confirmó que 0004 sí estaba aplicada. No se volvió a ejecutar ni se marcó artificialmente como aplicada. No se escribieron tablas de historial ni se modificaron metadatos D1.

## 2. Cómo se comprobó el resultado esperado sin ocultar diferencias

La referencia se reconstruyó en **workerd local efímero**, restaurando el respaldo cifrado aprobado de etapa 3 y aplicando allí únicamente el SQL original de 0004, con hashes verificados. Esa proyección local se comparó contra todos los datos y definiciones de dos snapshots remotos. El snapshot remoto no se utilizó como su propia referencia.

La única entrada generada por la escritura cuyo valor original no se había conservado era `applied_at` de la nueva fila 0004. Se observó su valor por lectura, se comprobó su formato/calendario y se exigió que estuviera dentro de la ventana del intento original, con tolerancia de un segundo por resolución temporal. Se usó únicamente ese valor observado para reproducir la inserción en el ledger local. Las fechas y filas previas provienen del respaldo: cualquier modificación de 0001–0003 produciría un fingerprint diferente.

**Límite explícito:** esto no prueba que el timestamp de 0004 jamás haya cambiado a otro valor dentro de esa misma ventana, porque no existía una copia histórica independiente de su valor. No se normalizaron fechas arbitrarias, no se excluyeron campos del fingerprint y no se admitió contenido diferente. La reconciliación actual fija desde ahora el fingerprint completo observado, incluyendo esa fecha.

## 3. Valores y tiempos de bookmark conservados

Los valores completos se conservan **protegidos con DPAPI CurrentUser**, fuera del repositorio. La evidencia depurada contiene las horas y relaciones, sin valores en claro:

| Lectura | Inicio de petición (Costa Rica) | Respuesta observada (Costa Rica) | Comparación |
|---|---|---|---|
| first | 19:49:55.289 | 19:49:55.570 | Válido |
| middle | 19:50:01.995 | 19:50:02.383 | Igual a first |
| last | 19:50:08.508 | 19:50:08.771 | Igual a middle |

Snapshots completados a las **19:50:01.995** y **19:50:08.508**, ambos etapa 4, 28 tablas/53 filas, con el mismo fingerprint señalado arriba.

Evidencia bajo `C:\Users\JV\AppData\Local\Kuwago\D1Backups\development`, prefijo `stage4-audit-597b711f-55c9-432d-945d-12eaa3ac5cae`:

| Archivo | SHA-256 |
|---|---|
| `.result.json` | `e333b4aa7087f27d39431973085e7f0b552336c31225e3a472f399244c61d522` |
| `.private.json` | `355b38a94898037f47f2aa6de388f5df3bf502fad65b6ec5eab5aad3185cbb02` |

El marcador `.attempt.json` impide reutilizar la auditoría. El transporte usado solo expone metadatos, consultas expresamente permitidas y bookmarks; no expone `applyBatch`, exportación o restauración. Todas las peticiones se limitaron a la D1 fija.

## 4. Por qué falló el control 191/254

El intento anterior hizo: escritura propia aceptada → inspección etapa 4 → bookmark 191 → snapshot largo → bookmark 254. La igualdad final era una **guarda conservadora añadida por el ejecutor** para evitar cerrar un checkpoint durante cambios; no era una condición de éxito del batch SQL impuesta por D1.

Ambos bookmarks se tomaron después de la escritura. Por ello su desigualdad no puede justificarse simplemente comparando un punto anterior con otro posterior a nuestra migración. Los valores de ese par no se guardaron, así que no se demuestra la causa histórica del avance ni se atribuye a un actor concreto. La reconciliación demuestra el estado actual esperado, no reconstruye los eventos intermedios.

La [API oficial de Time Travel](https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/methods/get_bookmark/) proporciona el punto actual o el más próximo anterior a un timestamp para recuperación. La [documentación de Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) describe bookmarks estables para timestamps fijos. No documenta ese GET como un contador de cambios de contenido o una prueba de exclusión mutua. **Inferencia de diseño:** no debe emplearse su sola igualdad/desigualdad como sustituto de verificar el resultado lógico del SQL.

Las [sesiones D1](https://developers.cloudflare.com/d1/worker-api/d1-database/) ofrecen otro mecanismo: un bookmark de sesión identifica la versión vista por la última consulta y permite [consistencia secuencial](https://developers.cloudflare.com/d1/best-practices/read-replication/). El ejecutor REST actual no obtiene ese bookmark causal mediante `getBookmark()`. No se simula que el GET de Time Travel tenga esa garantía ni se habilita replicación o infraestructura nueva.

## 5. Corrección local preparada — dos fases, sin fallback

Se añadió el prototipo `safe-d1/owned-write-checkpoint.mjs`, **solo para 0004 y no conectado al ejecutor remoto**:

1. El transporte genera un recibo no serializable de escritura propia únicamente tras aceptar un batch aprobado. Un objeto fabricado o una respuesta fallida no producen ese recibo. Se comprueba etapa y antigüedad.
2. Se verifica esquema/historial y se reconstruye la transición esperada desde el respaldo y el SQL original. No se acepta como modelo esperado una copia recién leída del remoto. Solo el timestamp nuevo se observa y acota a la ventana de la escritura reconocida.
3. Se compara el snapshot posterior completo contra esa proyección. Cualquier diferencia lógica detiene el proceso antes de fijar un checkpoint.
4. **Después** de validar la escritura, se toma el nuevo punto candidato, se exige su persistencia protegida y se abre una única ventana de checkpoint. El punto anterior a validar la escritura no se reutiliza como supuesto bloqueo de esa nueva ventana.
5. Esa ventana mantiene enlace exacto al candidato, dos snapshots iguales al resultado esperado, tres bookmarks iguales, evidencia obligatoria y última comprobación de actualidad. Si algo cambia, se detiene: no vuelve a elegir otro candidato ni repite la ventana.

El prototipo conserva detección de diferencias persistentes, carreras durante la nueva ventana y fallos de evidencia. Las guardas SQL transaccionales del siguiente escritor permanecen intactas. **No demuestra ausencia de cambios transitorios que otro actor haya revertido antes de empezar la ventana verificada**, ni garantiza resolver todos los avances de Time Travel. Esa limitación no se oculta. Un aislamiento más fuerte requiere control de escritores o un mecanismo causal/versionado adecuado, revisado por separado.

El recibo REST no se presenta como bookmark causal D1. El prototipo no consume permisos, no crea rutas de API, no ejecuta escrituras por sí mismo y no se activa como respuesta automática al fallo histórico. Generalizarlo a 0005/0006 exige revisar sus campos generados y probar sus proyecciones; esta fase no lo autoriza ni lo hace.

## 6. Backup-only preparado para etapa 4

Nuevo ID, **no consumido y sin autorización remota**:

`472f450d-3410-4808-a491-c14aa3cc16ae`.

Requisitos fijados en `safe-d1/backup-stage-four.mjs`:

- Misma cuenta, UUID y nombre inmutables.
- Etapa 4, esquema `05b62a741ad2a8b84caac31dbd9977cb19840e7d588dfb2c3e92ce7a1e25e26f`.
- 26 tablas de aplicación: las 24 de etapa 3 más `catalog_state` y `mutation_guards`.
- Historial exactamente 0001–0004; snapshot completo fijado al fingerprint **`df24b03cf675ef1cebb593888fbcc5f4e5765aed84f061fe358e6b344de1c010`**.
- Hashes de resultado y evidencia privada de esta reconciliación fijados. Se conservan los respaldos aprobados anteriores.

Una futura ejecución autorizada deberá coincidir exactamente con ese fingerprint antes de exportar. No puede sustituirlo por uno nuevo si detecta cambios. Se mantienen dos snapshots y triplete estable previo al export, un único inicio, igualdad tras exportar y restauración exacta en SQLite aislada. El cifrado AES-256-GCM, recuperación independiente/DPAPI, ACL, root fuera del repositorio, escritura exclusiva y limpieza son los existentes.

El formulario existente se actualizó a etapa 4 y permanece deshabilitado. No se abrió un formulario de respaldo ni se introdujo clave de recuperación en esta fase. El token usado para reconciliar se descartó; no queda disponible para exportar.

## 7. Archivos y validación

Nuevos:

- `infra/cloudflare/dev/scripts/safe-d1/stage-four-expectation.mjs`: proyección local y comparación completa.
- `safe-d1/reconcile-stage-four.mjs`, CLI `scripts/d1-reconcile-0004.mjs` y formulario `scripts/reconcile-0004-private.ps1`: auditoría estrictamente de lectura, captura privada existente y evidencia protegida.
- `safe-d1/owned-write-checkpoint.mjs`: prototipo local no activado remotamente.
- `safe-d1/backup-stage-four.mjs`: preparación fijada a esta reconciliación.
- Pruebas `test/reconcile-stage-four.test.mjs`, `test/owned-write-checkpoint.test.mjs`, `test/backup-stage-four.test.mjs` y este informe.

Modificados: `safe-d1/transport.mjs` añade recibo de escritura reconocida; flujo backup-only, plan/CLI/formulario y permiso de respaldo apuntan a etapa 4 con flag falso; expectativas de plan en tests anteriores se actualizaron. No se modificaron migraciones, frontend ni informes previos. Las rutas relativas del listado, salvo la primera explícita, están bajo `infra/cloudflare/dev`.

Pruebas ejecutadas:

| Suite / comprobación | Resultado |
|---|---|
| Reconciliación | 4/4 PASS: transición exacta, discrepancias de datos/ledger, identidad incorrecta, bookmarks variables, fecha fuera de ventana y error de evidencia |
| Prototipo de checkpoint | 3/3 PASS: recibo genuino, rechazo de falsificación/diferencia lógica/error de evidencia, cambio de bookmark terminal sin rebaselining |
| Respaldo y regresiones de etapas anteriores | 36/36 PASS; incluye restauración exacta del fingerprint reconciliado y rechazo de cambios de catálogo/fecha, bookmarks y dumps incompletos |
| Regresiones baseline/0001/ejecutor | 30/30 PASS |
| Lint | PASS, tras retirar dos imports no usados en un test |
| TypeScript/build local | PASS; sin upload |
| Sintaxis PowerShell de formularios | PASS |
| Integridad local final | Seis hashes SQL y backups anteriores intactos; ACL aprobadas; flags de respaldo y migración falsos |

Los ensayos y la proyección escribieron únicamente bases locales efímeras, necesarias para comparar la transición. **En Cloudflare se hicieron solo las lecturas autorizadas de esta auditoría**, sin repetición de 0004, SQL mutante, export, restauración remota, 0005–0006, deploy, cambios de Access/DNS/Hostinger, commit o push. Se detiene para revisión.
