# Fase 2C.5R — Ejecutor seguro de migraciones D1

24/10/2026 · America/Costa_Rica · Implementación y simulaciones exclusivamente locales.

**Resultado: base del ejecutor implementada y validada para una primera instalación vacía. GO técnico condicionado para revisión del flujo; NO-GO para ejecutar remotamente en esta versión.** La política contiene `remoteExecutionEnabled=false`; el CLI sale bloqueado antes de construir el transporte o enviar solicitudes. No se creó credencial ni se abrió el formulario. No se ejecutó SQL remoto, backup remoto, Time Travel remoto, despliegue, commit ni push. D1/R2 reales, Access, DNS y Hostinger permanecen sin cambios.

La eliminación del token Read anterior en Cloudflare se conserva como evidencia manual del usuario. No se intentó reutilizarlo ni se inspeccionaron almacenes de sesión.

## 1. Arquitectura

El flujo separa política, lectura, respaldo, escritura y orquestación. La operación remota futura usaría REST directo; **no lanza Wrangler para escribir**. Esto permite controlar cada intento y evitar heredar políticas de reintento/logging de un CLI o SDK genérico. Wrangler 4.152.0 permanece como referencia de compatibilidad, ledger y ensayos locales.

```text
Captura Windows existente —modo migraciones bloqueado en esta versión—
  → d1-safe-migrate.mjs, sin argumentos
  → política/versión/manifiesto
  → lock persistente de operación
  → read.mjs: identidad, esquema, ledger e integridad, solo SELECT/PRAGMA de lectura
  → backup.mjs: doble preflight vacío + bookmark observado + archivo lógico verificado
  → por cada etapa:
      nueva lectura + verificación de fuentes/respaldo
      write.mjs: lote cerrado + guardas SQL + SQL aprobado + ledger
      lectura posterior + checkpoint
  → descarte de credencial + informe depurado
```

El módulo de lectura no crea tablas ni utiliza `migrations list/apply`. La escritura no recibe SQL, UUID, cuenta, configuración o ruta de migración del operador. El transporte público del CLI tiene un único destino. Los transportes inyectados en tests son dobles locales explícitos; no se instancian desde argumentos o variables de entorno del CLI.

### Destino y versiones fijados

- Cuenta: `7a8bcd7992a3de359d2aff87df2fb693`.
- D1: `kuwago-admin-db-development`.
- UUID: `c5cfbe44-4fd0-4c2a-83c1-b833935534ba`.
- Fuente: documentación verificada de 2C.3/2C.4 y plan 2C.5; no se inventaron identificadores.
- Node: **26.1.0**; Wrangler instalado: **4.152.0**. Una actualización requiere revisión de esa política, no adaptación silenciosa.
- Metadatos D1 deben coincidir en nombre/UUID y declarar almacenamiento `version: production`. La aceptación de ese campo remoto sigue pendiente; si falta/difiere, el ejecutor bloquea.

Los objetos de política/lista están congelados. Cambiar `CLOUDFLARE_ACCOUNT_ID` o `KUWAGO_D1_DATABASE_ID` por otro valor bloquea; no hay selección alternativa. Otros overrides Cloudflare/Wrangler y determinados overrides Node se rechazan. No hay OAuth fallback, descubrimiento de otras cuentas ni listado de D1.

## 2. Archivos creados y modificados

Raíz: `C:/Users/JV/Desktop/Kuwago Landing/grupo-kuwago-landing-source`.

```text
infra/cloudflare/dev/
  scripts/
    d1-safe-migrate.mjs                 NUEVO: entrada cero argumentos, bloqueo remoto
    d1-read-credential.ps1              MODIFICADO: reutiliza GUI; modo MigrationRunner bloqueado
    safe-d1/
      policy.mjs                       NUEVO: destino, seis SQL/hashes, esquemas y versiones
      sql.mjs                          NUEVO: separación de SQL conservando triggers/comillas
      read.mjs                         NUEVO: preflight/postflight, capacidades de lectura
      backup.mjs                       NUEVO: backup lógico vacío + bookmark, hash y caducidad
      write.mjs                        NUEVO: etapas y guardas transaccionales
      transport.mjs                    NUEVO: REST fijo, límites y ninguna repetición
      runner.mjs                       NUEVO: lock, checkpoints, parada y limpieza
  test/safe-migration-runner.test.mjs   NUEVO: 19 pruebas, fixtures sintéticos
  package.json                        MODIFICADO: test:migrations:safe
docs/PHASE-2C5R-SAFE-MIGRATION-RUNNER.md NUEVO
```

No se modificaron SQL originales, manifiesto existente, contratos, Worker de negocio, Admin React, estilos o interfaz pública. Los builds regeneraron sus salidas locales habituales; el estado de los nueve archivos tracked previamente modificados se preservó. No se instalaron dependencias.

## 3. Migraciones y estado esperado

La lista literal en la política repite deliberadamente los seis hashes aprobados, además de contrastar el manifiesto existente. Modificar manifiesto y SQL juntos no basta para pasar: también deben coincidir con la política revisada. No existe comando de actualización automática de hashes.

| Etapa | Archivo | Requiere ledger de |
|---|---|---|
| 1 | 0001_admin_catalog.sql | 0 archivos; sin ledger |
| 2 | 0002_integrity_guards.sql | exactamente 0001 |
| 3 | 0003_access_rbac.sql | exactamente 0001–0002 |
| 4 | 0004_catalog_operations.sql | exactamente 0001–0003 |
| 5 | 0005_publication_resilience.sql | exactamente 0001–0004 |
| 6 | 0006_media_lifecycle.sql | exactamente 0001–0005 |

Los SHA-256 son los del plan 2C.5 y `packages/database/migrations.sha256.json`. Se verifican lista, orden, archivos regulares sin symlink y bytes antes del arranque y de cada etapa. Las fuentes se leen, validan y mantienen en memoria para construir el lote; no hay una segunda lectura del CLI susceptible a cambiar entre hash y ejecución.

La comparación de esquema usa hashes fijados por etapa de los objetos SQL ordenados. Solo normaliza espacios fuera de literales/identificadores entre comillas. No acepta un simple conteo de tablas como prueba de equivalencia. Se aceptan únicamente los internos identificados `_cf_KV` y `_cf_METADATA`; este último debe tener la forma exacta observada en workerd local. Una tabla desconocida que empiece por `_` sigue bloqueando.

También se comprueban:

- DDL y prefijo exactos de `d1_migrations`, incluidos IDs consecutivos.
- `PRAGMA quick_check=ok`, `foreign_key_check=[]`.
- Ausencia de personas, categorías, servicios/revisiones/media, aprobaciones, comandos, outbox y demás datos que no corresponden a una instalación vacía.
- Hash de los seeds de roles/permisos históricos y canónicos. No basta con tener el número esperado de grants.
- Desde 0005: publicación ready/vacía, época válida y sin generación/hash público.

Si el proceso arranca sobre una base parcialmente migrada, se detiene. La capacidad de leer etapas posteriores se utiliza solo dentro de la misma operación para postflight/siguiente etapa, no para elegir un punto de reanudación por parámetro.

## 4. Separación y control de escritura

`read.mjs` contiene consultas cerradas; `transport.select` rechaza cualquier sentencia fuera de esa lista. Los checks no inicializan el ledger. Nombre e ID se vuelven a verificar antes y después de cada etapa.

`write.mjs` exige una capacidad de preflight emitida realmente por el lector y un recibo de backup conocido en memoria. Copiar sus propiedades a otro objeto no crea autorización. Cada capacidad de etapa se consume antes del envío; un resultado ambiguo no permite reutilizarla.

Cada solicitud de escritura contiene un batch único:

1. Guarda transaccional temporal con CHECK abortante.
2. Solo en 0001, creación del ledger compatible con Wrangler, sin `IF NOT EXISTS`.
3. Comprobación SQL de esquema, prefijo de ledger, datos vacíos y seeds observados. En etapas posteriores también se comprueba la época/control de publicación.
4. Únicamente las sentencias de la migración aprobada, conservando cuerpos de triggers completos.
5. Inserción de su nombre en el ledger.
6. Eliminación de la guarda temporal.

La guarda comprueba en la transacción las precondiciones observadas, reduciendo la carrera entre lectura y escritura. Dos iniciadores que observaron la base vacía no pueden confirmar ambos la creación del ledger. Para etapas siguientes, el historial y la guarda abortan el intento obsoleto.

El transporte acepta batches emitidos por ese escritor, no arrays arbitrarios, y consume cada batch una sola vez. Envía exactamente una petición, sin SDK/CLI, redirects ni retries. Un timeout se trata como **resultado desconocido**, no como confirmación de rollback. Se bloquea la siguiente etapa si falta respuesta válida, postflight, integridad, journal o aceptación del respaldo.

La atomicidad local se probó con D1/workerd real: fallos inyectados dentro de 0001, 0003 y 0005 revierten SQL y ledger de esa etapa. La documentación REST indica que los statements se ejecutan como batch; la verificación del mismo comportamiento remoto queda como aceptación futura controlada. La cadena de seis etapas no se presenta como una transacción global.

### Concurrencia, checkpoints y reinicio

En el CLI, directorio fijo `.wrangler/safe-d1-development`, `operation.lock` creado con `wx`. Un segundo proceso no lo sobrescribe ni avanza. El lock **no se elimina automáticamente**, ni siquiera tras éxito: un reinicio/cancelación exige revisión de incidente. Cambiar el directorio no es un argumento disponible del CLI.

Por etapa se guarda un registro `started` antes del intento y otro `verified` solo después del postflight. Lock, backup y resultado comparten `operationId`; el resultado incluye destino, hash del plan, tiempos y última etapa intentada/verificada. No se persisten respuestas crudas o excepciones del proveedor.

La guarda D1 y el ledger protegen además contra dos copias del proceso con locks locales distintos. No sustituyen el control humano de otros escritores privilegiados de la cuenta. No hay script de reanudación automática ni eliminación automática de marcadores.

## 5. Respaldo verificable y recuperación

### Alcance del mecanismo nuevo

Es un **respaldo lógico del estado vacío de aplicación más un bookmark de Time Travel**, no un export SQL completo. Solo sirve para la primera instalación del estado confirmado en 2C.4. No copia datos internos de Cloudflare ni intenta recrearlos mediante SQL.

Procedimiento implementado:

1. Lector verifica nombre/UUID/almacenamiento, ausencia de objetos de aplicación/ledger e integridad.
2. GET del bookmark sobre el endpoint fijo de esa D1, mediante el transporte autorizado; requiere respuesta válida y bookmark con formato permitido.
3. Segundo preflight de la misma base vacía; cualquier diferencia bloquea.
4. Se crea un archivo nuevo `empty-logical-backup.json`, vinculado a destino, operación, etapa cero, hash de esquema, bookmark y hora.
5. Se relee y verifica SHA-256 contra el recibo creado en memoria. No se acepta un archivo externo que simplemente diga `verified: true`.
6. Cada etapa revalida archivo/recibo/vínculo y vigencia: **10 minutos** para el backup y menos de **30 segundos** para la lectura previa. Alteración, desaparición, recibo falso, retroceso de reloj o caducidad bloquean el envío.

Los tests usan bookmarks sintéticos de un transporte simulado. **No se obtuvo un backup ni bookmark real en esta fase; ningún resultado local declara lo contrario.** La capacidad de obtener y recuperar Time Travel en la cuenta sigue pendiente de verificación autorizada.

### Diferencia respecto al plan 2C.5

El plan anterior recomendaba export SQL además de bookmark. El ejecutor implementa la rama acotada de backup lógico vacío: la inexistencia comprobada de datos de aplicación se representa y contrasta con otra D1 local vacía. No sustituye un export con contenido ni la prueba de restaurar un export real.

**Antes de habilitar escrituras, el usuario debe aceptar expresamente esta rama de recuperación vacía o mantener el gate del export SQL del plan 2C.5.** Si se exige ese export, debe implementarse/verificarse su recibo y recuperación antes de activar el ejecutor. No se ha eliminado ni dado por cumplido silenciosamente ese requisito previo. El resultado es NO-GO remoto mientras esa decisión siga pendiente.

### Recuperación e incidentes

- Un fallo/timeout deja el lock y journals. Mantener la base sin backend nuevo y detenerse; no repetir lote ni borrar ledger.
- Autorizar lectura diagnóstica aparte para distinguir etapa aplicada, rollback o estado desconocido; los checkpoints locales no prueban el estado remoto después de perder una respuesta.
- Si se autoriza recuperar el punto previo mediante Time Travel, cotejar cuenta/UUID/bookmark, alcance de pérdidas y ventana. Esa restauración es una operación distinta, no ejecutada por este programa.
- La verificación lógica del estado vacío usa otra D1 local aislada y confirma ausencia de tablas de aplicación, esquema equivalente e integridad. Esto no es una prueba real de restauración Time Travel remota.
- Con datos posteriores, el ejecutor bloquea: corresponde usar el procedimiento coordinado D1–R2 de 2B.4R/2B.6 con backup de revisiones/auditoría, inventario/hash de objetos, nueva época, publicación pausada y aprobaciones retiradas. No hay transacción distribuida D1–R2.

Se repitió `d1-readiness-local.mjs`: seis migraciones locales, segunda pasada no-op y restauración aislada con nueva época, publicación pausada, FK limpias, ledger conservado y media local consistente. Evidencia nueva: `.wrangler/phase2c3/run-d420a500ffdc/result.json`. Este ensayo de recuperación posterior a las migraciones tampoco demuestra un backup remoto previo a 0001.

## 6. Credenciales y formulario reutilizado

Se extendió el script Windows existente con `-MigrationRunner`, sin otro almacén o sistema de credenciales. Reutiliza campo enmascarado, entorno del hijo, captura privada y limpieza. La evidencia/lock de ese modo están separados del diagnóstico Read anterior; no se borró su marcador ni resultado.

**En esta versión el modo migraciones muestra el botón bloqueado y dice que no se introduzca una credencial Write.** El CLI tiene una segunda barrera independiente, `remoteExecutionEnabled=false`. No se abrió la GUI durante las pruebas. Activar esas barreras requiere otra revisión/autorización; no es una opción de línea de comandos o variable de entorno.

El token nunca va en argumentos, archivos, historial, configuración de Worker, React ni registros. El transporte retiene solo una referencia en memoria, la elimina con `dispose`; el runner elimina la variable en `finally`. No imprime excepciones externas, cuerpos o Authorization. Requests y respuestas tienen timeout/límite de tamaño y no siguen redirecciones. No se promete borrado físico de todas las copias de cadenas administradas ni protección frente a malware/volcados del sistema.

No se creó credencial ni se amplió OAuth. El programa no necesita permisos de administrar tokens. Una futura credencial D1 Write sería temporal y separada del token Read eliminado; la **revocación remota seguirá siendo responsabilidad humana**, con registro del responsable y hora, tanto al terminar como ante fallo/cancelación. La limpieza del entorno no equivale a revocarla.

## 7. Pruebas ejecutadas

| Área | Resultado |
|---|---|
| Backend, suite completa | **189/189**, 0 fallos/omitidas/canceladas |
| Ejecutor específico | **19/19**; repetido tras ajustes de journal/captura |
| Admin React | **31/31**, build, TypeScript y lint correctos |
| Contratos | **12/12**, build correcto |
| Marketplace público | **6/6**, incluye comportamiento de UI ES/EN |
| Versionado de assets | **3/3** |
| Backend TypeScript/build/lint | Correctos |
| Landing check/build | Correctos; sin cambios de interfaz |
| Aislamiento Admin/landing | Aprobado |
| Sintaxis PowerShell | 0 errores |
| Migraciones y restauración local repetidas | 6 hashes intactos; restore aislado y pausado aprobado |

El build público avisó que su base Browserslist está desactualizada; no se instalaron actualizaciones para resolver un aviso ajeno al alcance. El tooling del ejecutor es Node ESM; lint lo revisa y sus pruebas se ejecutan con Node fijado. No se presenta la comprobación TypeScript del backend como un typecheck estricto de todos los `.mjs`.

Las simulaciones cubren:

- ID, nombre, cuenta o almacenamiento incorrectos; ninguna escritura.
- Archivos manipulados, orden/nombres/cantidad/hash diferentes y manifiesto alterado.
- Historial corrupto, esquema inesperado, tablas desconocidas con `_` y permisos seed alterados.
- Time Travel ausente/inválido; backup falso, perdido, alterado o vencido; preflight obsoleto.
- Fallo dentro de una etapa, fallo de postflight, error de red/resultado desconocido y ausencia de reintentos.
- Capacidad duplicada, dos batches concurrentes y lock persistente que impide reinicio inseguro.
- Credencial sintética inválida, 403/10000, redirect, respuesta ilegible y redacción de errores.
- Intentos de SQL arbitrario y argumentos alternativos al CLI.
- Instalación parcial detectada y bloqueada; recuperación local existente mantiene publicación pausada.
- Inserción de una fila entre lectura y lote: la guarda aborta dentro de D1 sin aplicar la etapa siguiente.
- Simulación REST completa: URL fija, GET/POST y cuerpo reales del protocolo contra D1 workerd local, con exactamente seis envíos de escritura simulados.

No hubo prueba de credencial real, MFA, latencia remota, rollback remoto ni Time Travel real. Los tokens/claims/usuarios de los tests existentes son sintéticos, no credenciales Cloudflare ni administradores reales.

Comandos seguros para repetir, desde la raíz:

```powershell
npm --prefix packages/contracts run build
npm --prefix infra/cloudflare/dev run build
npm --prefix infra/cloudflare/dev run test:migrations:safe
npm --prefix infra/cloudflare/dev run lint
npm --prefix apps/admin run build
npm --prefix apps/admin test
npm --prefix apps/admin run verify:isolation
```

Suite completa usada desde `infra/cloudflare/dev`: `node --test test/*.test.mjs`. Logs depurados y fixtures locales están bajo `.wrangler/safe-runner-tests/`; en particular `full-backend-final.txt` y `latest.txt`. Son artefactos ignorados por Git, sin tokens reales. No se ofrece comando de migración remota para ejecutar en esta entrega.

## 8. Riesgos residuales y límites

1. **Permiso por cuenta:** D1 Write no se convierte en una ACL por UUID por usar esta herramienta. Restringimos la ruta del CLI; otro programa con la credencial podría acceder a otras D1. Requiere aceptación explícita o una separación de cuenta/operador distinta.
2. **Máquina confiable:** un operador que modifica código o importa interfaces de inyección de tests puede eludir controles locales. La congelación de objetos y el bloqueo de lanzamiento protegen el uso previsto, no un host comprometido. Revisar/copiar un lote de código y hashes estable antes de usar credenciales reales.
3. **Aceptación remota pendiente:** formatos de metadatos/bookmark, permisos, representación de SQL y comportamiento del batch real aún no probados. Una diferencia debe bloquear y revisarse; no flexibilizar verificaciones automáticamente.
4. **Backup vacío limitado:** decisión explícita entre la rama lógica vacía implementada y el export completo del plan anterior. No hay respaldo remoto ya completado.
5. **No resume ni upgrade con contenido:** un proceso interrumpido exige lectura/recuperación independiente. No reutilizar este programa para una futura 0007 sobre una base activa.
6. **Protección de archivos:** modos Unix 0600/0700 son orientativos en Windows, no una prueba de ACL NTFS. Las evidencias nuevas contienen solo SQL/metadata/estado vacío, no secretos; la carpeta operativa deberá quedar bajo permisos del operador antes del uso real.
7. **Revocación y supervisión humanas:** TTL, responsable, exclusión de otros escritores y revisión de journals requieren operación aprobada. No existe garantía de recuperación remota o SLA medido en esta fase.

## 9. Matriz GO / NO-GO y autorizaciones

| Gate | Estado |
|---|---|
| Destino fijo, seis hashes, separación lectura/escritura | **Implementados y probados localmente** |
| Rechazo sin backup, control por etapa y concurrencia | **Implementados y probados localmente** |
| Captura/limpieza sin persistencia de token | **Reutilizada**; GUI/CLI remoto bloqueados, no solicitó token |
| Recuperación D1–R2 local | **Probada**; sin operación real |
| Revisión técnica para preparar una futura credencial D1 Edit | **GO condicionado** a aceptar alcance de cuenta, responsables y rama de backup; no es autorización para crearla |
| Crear D1 Edit en esta fase | **NO-GO / no autorizado** |
| Activar transporte/formulario remotos | **NO-GO** hasta aprobación específica y revisión del lote de código |
| Migrar D1 DEV | **NO-GO** hasta preflight/backup reales aceptados y autorización de los seis SQL |
| Bootstrap, restore, deploy, R2/Images/Access/DNS | **Fuera de alcance**, autorizaciones distintas |

Secuencia propuesta de autorizaciones independientes:

1. **Revisión:** aceptar este informe y decidir recuperación vacía con bookmark o mantener el export completo exigido en 2C.5.
2. **Credencial:** autorizar al operador a crear D1 Write temporal para una cuenta específica, con TTL corto y revocación obligatoria. Reconocer que su alcance subyacente incluye otras D1; no autoriza SQL.
3. **Lectura/respaldo:** permitir identidad, esquema, integridad y bookmark del objetivo exacto y cualquier export adicional decidido. Habilitar solamente la herramienta de esa fase revisada, sin abrir escritura por efecto colateral.
4. **Ejecución:** después de aceptar el respaldo real, aprobar activación del escritor, lote/hashes, ventana, responsables y política de parada. El runner vuelve a verificar/capturar el baseline fresco como parte de la operación aprobada; un backup antiguo no se reutiliza como permiso de escritura.
5. **Cierre:** comprobar seis etapas y revocar credencial; cualquier timeout o resultado ambiguo pasa a revisión de incidente.
6. **Bootstrap/recuperación/despliegue:** aprobaciones específicas posteriores, nunca implícitas en disponer de Write.

No se solicitan credenciales ni se pide que el usuario pegue secretos. **Se detiene para revisión antes de cualquier operación remota.**

## 10. Referencias oficiales

- [REST Query D1](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/): endpoint fijo, cuerpos SQL/batch y resultados. El uso de batch no convierte las seis etapas en una transacción global.
- [Wrangler D1](https://developers.cloudflare.com/d1/wrangler-commands/): compatibilidad del historial y comportamiento de migraciones por archivo.
- [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/): bookmarks y recuperación. Disponibilidad de cuenta y restore real no certificados aquí.

Se consultó documentación pública; ninguna consulta autenticada a la cuenta o transformación Images se realizó en esta fase.
