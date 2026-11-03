# Lote DEV 0002–0006 — resultado parcial y parada segura

25/10/2026 · America/Costa_Rica. Finalización: **19:11:10.956**, `2026-10-26T01:11:10.956Z`.

**PARCIAL: 0002 y 0003 aplicadas y verificadas. 0004, 0005 y 0006 no se intentaron.** El lote no se declara completado.

Autorización consumida: `96a25c8d-186f-4b67-9653-1b399294903f`.
Estado: `stopped_review_required`.
Motivo de parada: `live_baseline_concurrent_bookmark_change`, durante el preflight para 0004, antes de generar su marcador de inicio o enviar su SQL.

## Destino y requisitos previos

Cuenta fija `7a8bcd7992a3de359d2aff87df2fb693`; D1 `kuwago-admin-db-development`; UUID `c5cfbe44-4fd0-4c2a-83c1-b833935534ba`.

Se verificaron localmente las ACL, los seis hashes originales, informe/resultado de 0001 y respaldo completo de etapa 1. El respaldo de operación `62c608c3-60c6-41fd-a811-8c9f273fe259` se descifró mediante DPAPI y restauró en SQLite aislada con comparación exacta de fingerprint: 23 tablas incluyendo ledger/secuencia, 22 filas. Su ciphertext conserva SHA-256 `7935096090980e3e4ffc278899b790af9d13151285a2fb2a33b9db9e9b22a596`.

El preflight remoto validó identidad, etapa 1, 21 tablas de aplicación, historial únicamente 0001, semillas, integridad y ausencia de contenido. Dos snapshots completos coincidieron con el fingerprint del respaldo. Se registró baseline fresco con bookmark histórico y fresco protegidos mediante DPAPI, sin sustituir el respaldo y con comprobación de actualidad antes de escribir.

## Aplicación exacta

| Migración | Resultado remoto | SHA-256 SQL | Esquema posterior |
|---|---|---|---|
| 0002_integrity_guards.sql | **Aplicada una vez; postflight aprobado** | `47abe773445a464a7a25b412a11d35799aa1a704e14d6b7846885dff35d41ed4` | `f680fc373652e4e9399146f6bbaeeac05c91741c684270ebb591086c17ccb9ac` |
| 0003_access_rbac.sql | **Aplicada una vez; postflight aprobado** | `19ba25557c88f509927cd1fea912da3d3d4a815b56733e310be51dd155719336` | `7b8fd74fa51a798fced27ea83491e8b9c18dc324539efcb7daf217914630f8f6` |
| 0004_catalog_operations.sql | **No intentada**; bloqueo en preflight | Hash original verificado, sin ejecución | Sin postflight de 0004 |
| 0005_publication_resilience.sql | **No intentada** | Hash original verificado, sin ejecución | Sin postflight de 0005 |
| 0006_media_lifecycle.sql | **No intentada** | Hash original verificado, sin ejecución | Sin postflight de 0006 |

Último historial remoto verificado, en orden:

```text
1  0001_admin_catalog.sql
2  0002_integrity_guards.sql
3  0003_access_rbac.sql
```

Cada uno de los dos lotes incluyó la guarda transaccional, las sentencias originales de su migración y su registro de historial. No se ejecutó de nuevo 0001. Los postflight verificaron esquema, historial, fechas anteriores sin modificación, integridad FK/quick_check, semillas y tablas sin contenido. La creación de definiciones de roles canónicos por 0003 no creó personas ni asignaciones: no se creó Super Admin.

## Parada antes de 0004

El control exige tres bookmarks iguales alrededor de dos snapshots antes de cada escritura. En la preparación de 0004 esa igualdad falló. No se guardó un baseline aceptado para esa etapa ni se creó su marcador de inicio. No se envió su lote SQL.

El código comprueba coincidencia lógica completa antes de comprobar la igualdad de esos tres bookmarks; el error registrado corresponde a esta última guarda. Eso permite distinguirlo de un error de fingerprint, pero **no demuestra por sí solo la causa del avance del bookmark ni descarta cambios transitorios**. No se atribuye a un escritor externo ni se relaja la condición. Los valores del conjunto que falló no quedaron registrados; no se inventan ni reconstruyen.

No se repitió el preflight ni se efectuaron consultas remotas adicionales después de la parada. Cualquier diagnóstico remoto posterior requiere autorización de lectura; una nueva continuación no puede reutilizar este ID ni saltarse los requisitos de respaldo/recuperación del estado de partida correspondiente.

## Solicitudes, custodia y cierre

- **581 peticiones API**, todas HTTP 200: 16 metadatos, 548 consultas SQL de lectura, 15 bookmarks, **2 lotes mutantes**.
- Sin exportación adicional, descarga, migración remota extra o reintento.
- `credentialDisposed:true`; entrada mediante formulario privado y pipe; sin token o clave en informes, argumentos o archivos.
- El respaldo de etapa 1 y el original de etapa 0 conservan sus hashes; ACL verificadas de nuevo al cerrar.
- `batchApproved=false` tras la parada; flags remotos generales permanecen bloqueados. Marcador del intento y resultado conservados, sin reanudación automática.
- La revocación de la credencial en Cloudflare no fue ejecutada por esta herramienta; sigue bajo control del usuario.

## Evidencia depurada fuera del repositorio

Raíz: `C:\Users\JV\AppData\Local\Kuwago\D1Backups\development`.
Prefijo: `migration-0002-0006-96a25c8d-186f-4b67-9653-1b399294903f`.

| Archivo/sufijo | SHA-256 / estado |
|---|---|
| `.attempt.json` | `de3ac9f136ef056ee0b6dfe518f93160ed013f06f1c42c3c90d8a744fb9b32e5` |
| `.result.json` | `8d4410b2dae23af05ce063814152c5f2562d8d2213ab21757323a136a509d5f2` |
| `.stage-1.baseline.private.json` (previo a 0002) | `255e3c43471c8c24815627545ba36914c533c9c6d0b14de58d148a3f5a413b8d` |
| `.stage-2.baseline.private.json` (previo a 0003) | `84e097f587fad00c220f6c60ef829db0f85ff2d652a1da2b203697c86e18497a` |
| `.stage-1.started.json` / `.stage-1.verified.json` | Ambos presentes |
| `.stage-2.started.json` / `.stage-2.verified.json` | Ambos presentes |
| `.stage-3/4/5` de baseline/inicio/verificado | Ausentes; no se inició escritura de 0004–0006 |

Los bookmarks históricos y frescos se conservan protegidos, sin valores en este informe. Los baselines previos a 0002 y 0003 se verificaron respectivamente a las **19:10:23.332** y **19:10:46.465** de Costa Rica. No se han modificado los respaldos para incorporar esos puntos.

## Validación local y alcance

Preparación y controles del ejecutor documentados en `D1-MIGRATIONS-0002-0006-EXECUTION-PLAN.md`: suite final del lote **9/9**, regresiones previas **30/30**, lint, TypeScript/build local y sintaxis del formulario aprobados antes de habilitarlo. No se presenta esa simulación como prueba de éxito de 0004–0006 remotas.

No hubo bootstrap, despliegues, commit, push, cambios de Access, DNS, Hostinger, Workers desplegados o R2. Se detiene para revisión, sin intentar completar el lote por otra vía.
