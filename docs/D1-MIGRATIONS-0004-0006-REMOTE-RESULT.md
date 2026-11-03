# Lote DEV 0004–0006 — parada después de ejecutar 0004

25/10/2026 · America/Costa_Rica. Finalización: **19:38:24.412** (`2026-10-26T01:38:24.412Z`).

**RESULTADO PARCIAL: un único lote de 0004 ejecutado con HTTP 200; inspección de esquema e historial de etapa 4 superada. El checkpoint final de postflight quedó bloqueado por cambio de bookmark. 0005 y 0006 no se intentaron.**

Autorización consumida: `3771d065-f5e5-4bb0-b0fc-0091834f92c8`.
Estado: `stopped_review_required`.
Error: `postflight_concurrent_change`.

## Alcance efectivamente ejecutado

| Migración | Resultado |
|---|---|
| 0004_catalog_operations.sql | **Una única escritura aceptada**. Después se superaron `inspect(4)` y la captura del snapshot de etapa 4. La igualdad de bookmarks del postflight falló; no hay checkpoint final verificado |
| 0005_publication_resilience.sql | **No intentada**; sin marcador de inicio ni petición mutante |
| 0006_media_lifecycle.sql | **No intentada**; sin marcador de inicio ni petición mutante |

Hash original de 0004: `dfa41753ca3e91628077ceec2557ec8d77a02ef59062439e8adaf7780a19550b`. No se ejecutaron de nuevo 0001–0003. El esquema comprobado por `inspect(4)` es el aprobado de etapa 4: `05b62a741ad2a8b84caac31dbd9977cb19840e7d588dfb2c3e92ce7a1e25e26f`, con historial exacto 0001–0004.

La conclusión sobre la inspección posterior se apoya en el orden de controles del código y la traza de solicitudes: el error registrado solo se alcanza después de que `inspect(4)` y la captura aprobada devuelvan correctamente. No se almacenaron sus respuestas SQL crudas ni se repitieron consultas tras la parada. La sexta lectura de bookmark se ejecutó, por lo que también se superó la condición `post.stage === 4` que la precede.

**No se declara completado el postflight completo.** La comprobación posterior de preservación de la transición y la persistencia del checkpoint no se alcanzaron. `stages:[]` refleja ausencia de etapas cerradas como verificadas; no significa que no se haya ejecutado SQL. No se afirma el estado remoto actual más allá de las comprobaciones realizadas durante este intento.

## Requisitos previos aprobados

Destino fijo: cuenta `7a8bcd7992a3de359d2aff87df2fb693`, D1 `kuwago-admin-db-development`, UUID `c5cfbe44-4fd0-4c2a-83c1-b833935534ba`.

Se verificaron la identidad, etapa 3, 24 tablas de aplicación, historial exacto 0001–0003, integridad, seeds y ausencia de contenido. Los seis hashes originales y dependencias coincidieron. El respaldo de etapa 3, operación `249fc1c0-e980-4197-a2f9-ced122f72dd2`, fue comprobado por hashes, ACL, descifrado DPAPI y restauración exacta SQLite aislada (26 tablas y 51 filas). Los dos snapshots completos del preflight coincidieron con su fingerprint.

El bookmark histórico del respaldo difería del fresco; se conservó protegido, sin sustituir el respaldo. El baseline fresco cumplió la igualdad de las tres lecturas y la comprobación final antes del escritor. No se flexibilizó ninguna guarda.

El plan del lote usa ese respaldo previo para las tres etapas; no exige export adicional entre ellas. No se realizó ninguno ni se llamó a R2.

## Bookmarks: ubicación exacta del fallo

Ordinales dentro de las **254 solicitudes API**, todas HTTP 200:

| Solicitud | Función | Hora registrada en Costa Rica / relación |
|---|---|---|
| 35 | first del preflight de 0004 | 19:37:56.437 |
| 94 | middle, tras el primer snapshot | 19:38:03.091; igual a first |
| 153 | last, tras el segundo snapshot | 19:38:09.724; igual a middle |
| 171 | Última comprobación antes de escribir | Igual al baseline fresco |
| 172 | Único lote mutante: 0004 y su ledger | HTTP 200 |
| 173–190 | Inspección de etapa 4 | Controles completados antes de llegar al siguiente punto |
| 191 | Bookmark anterior al snapshot del postflight | Sin timestamp individual persistido |
| 192–253 | Captura completa del snapshot posterior | Etapa 4 aprobada por el capturador |
| 254 | Bookmark posterior a ese snapshot | **Distinto de 191**; sin timestamp individual persistido; activó la guarda |

En este intento se identifica el par exacto: **191 frente a 254**. Los valores individuales de ese par no se persistieron porque el checkpoint de postflight se guarda únicamente tras comprobar su estabilidad. No se imprimen, inventan ni intentan recuperar retrospectivamente.

La observación protegida del preflight sí quedó registrada: `status:verified`, `logicalMatch:true`, `originalEqualsFirst:false`, `firstEqualsMiddle:true`, `middleEqualsLast:true`, con tiempos y valores protegidos para las tres lecturas. Los dos snapshots se completaron a las **19:38:02.809** y **19:38:09.469**, respectivamente.

El cambio que activó la parada ocurrió entre dos lecturas **posteriores** al lote mutante. No se confunde con un avance esperado entre el bookmark anterior a ejecutar 0004 y el posterior a esa escritura. No hay otra petición mutante del ejecutor en ese intervalo. Eso no demuestra la causa del avance: no se atribuye a otro actor ni se considera un fallo inocuo. No hubo reconsulta, reintento ni renovación silenciosa.

Distribución de las solicitudes: **7 metadatos, 240 consultas SQL de lectura, 6 bookmarks y 1 lote mutante**. Todas HTTP 200; la parada fue por comparación local de seguridad.

## Evidencia y custodia

Raíz fuera de Git: `C:\Users\JV\AppData\Local\Kuwago\D1Backups\development`.
Prefijo: `migration-0004-0006-3771d065-f5e5-4bb0-b0fc-0091834f92c8`.

| Archivo | Estado / SHA-256 |
|---|---|
| `.attempt.json` | Presente; intento consumido |
| `.result.json` | `0b2bb9cde45c154895d77dc323a657630ab30d56cfc2ef5f2736b659ddf038cd` |
| `.stage-3.observation.private.json` | `edbe7c14856eebc75de16f1570d703d711e02ddebf2d98f7baeea55661c91512` |
| `.stage-3.baseline.private.json` | `604a6bd82f3ec0f3c2050888ce0880d10e31c4bd414eeedc24bb012096a8fd2d` |
| `.stage-3.started.json` | Presente; 0004, resultado pendiente de cerrar al iniciar |
| `.stage-3.verified.json` / `.postflight-stage-4.private.json` | Ausentes: checkpoint final no aprobado |
| Marcadores de 0005 / 0006 | Ausentes |

Los respaldos de etapas 0, 1 y 3 conservan sus hashes originales; evidencia del respaldo de etapa 3 sin cambios y ACL verificadas nuevamente. No se sobrescribieron informes o intentos anteriores.

## Cierre

`credentialDisposed:true`. El formulario utilizó exclusivamente token enmascarado y pipe privado, sin pedir la clave. Campos/referencias y buffers se limpiaron según el flujo; no se promete borrado físico absoluto de memoria administrada. Token fuera de archivos, argumentos y logs. La revocación de la credencial en Cloudflare sigue bajo control del usuario.

`finalApproved=false` después de la parada. Los permisos de los lotes anteriores y los flags remotos generales continúan bloqueados. El ID no puede repetirse ni reanudarse. No se hicieron nuevas consultas remotas después del error.

Pruebas locales previas: **6/6 específicas y 30/30 regresiones**, lint, TypeScript/build y parser PowerShell aprobados, según `D1-MIGRATIONS-0004-0006-EXECUTION-PLAN.md`. No equivalen a un postflight remoto completado.

Sin Super Admin, despliegues, commit, push, cambios de Access, DNS, Hostinger, Workers o R2. Se detiene para revisión antes de cualquier diagnóstico remoto o continuación.
