# Migraciones 0002–0006 — revisión previa

25/10/2026 · America/Costa_Rica · **NO-GO: detenido antes de operaciones remotas.**

La autorización del lote exige detenerse si el plan requiere un nuevo export. Esa condición se cumple: el único respaldo remoto cifrado y restaurado corresponde a etapa 0; el último estado remoto aprobado corresponde a etapa 1, después de 0001.

## Evidencias locales

| Control | Resultado |
|---|---|
| Manifiesto cerrado | `approvedSources()` aprobó los seis archivos, nombres, orden y SHA-256 |
| Hash 0001 | Coincide con el manifiesto y con `D1-MIGRATION-0001-FRESH-BASELINE-RESULT.md` |
| Dependencias declaradas | 0002 requiere etapa 1; 0003 etapa 2; 0004 etapa 3; 0005 etapa 4; 0006 etapa 5 |
| Respaldo original | Ciphertext y evidencia conservan sus hashes fijados; no modificados |
| Alcance del respaldo | Etapa 0: restauración histórica verificada con 0 tablas de aplicación y 0 filas |
| Último postflight aprobado | Etapa 1: 21 tablas de aplicación más `d1_migrations`, con exactamente 0001 aplicada |
| Estado remoto actual | No reconsultado en esta revisión; no se presenta el resultado anterior como una consulta nueva |
| Bookmark previo al lote | No obtenido; la preparación se detuvo por el requisito de respaldo |

## Motivo del bloqueo

`PHASE-2C5S-D1-BACKUP-READINESS.md` establece exportación SQL completa, punto Time Travel del mismo estado y restauración local verificable. El baseline fresco utilizado para 0001 conservó el respaldo original y comprobó que ambos representaban la misma base vacía. Esa equivalencia no cubre la etapa 1: ahora existen el esquema, los seeds y el historial resultantes de 0001.

El respaldo antiguo sigue siendo evidencia válida de etapa 0, pero no es un export del estado previo a 0002. No se lo sustituyó, recifró ni reclasificó. Tampoco se consideró suficiente reproducir 0001 sobre el respaldo antiguo o conservar solamente un bookmark nuevo.

## Limitaciones del ejecutor existente

- `safe-d1/encrypted-backup-receipt.mjs` exige restauración vacía y recibo de lectura de etapa 0.
- `d1-backup-once.mjs` fija `expectedStage:0`.
- `safe-d1/runner.mjs` es el flujo inicial de seis etapas: comienza con `inspect(0)`. No debe habilitarse para continuar desde etapa 1.
- El ejecutor específico de 0001 no autoriza 0002–0006.

No se modificaron esas guardas ni se habilitó un ejecutor genérico como alternativa.

## Próximo procedimiento necesario

1. Preparar y probar localmente un flujo backup-only limitado a etapa 1, preservando destino fijo, captura privada, cifrado y restauración aislada. Mantener separados respaldo y migración.
2. Obtener autorización independiente para un nuevo export de etapa 1; verificar identidad, historial exacto de 0001, esquema, filas, fingerprint, ACL y punto de recuperación. Conservar el respaldo original.
3. Verificar el nuevo respaldo cifrado y su restauración contra el snapshot completo de origen, incluyendo historial y seeds.
4. Preparar y revisar el ejecutor limitado a 0002–0006: nuevo ID, guardas de concurrencia, postflight de cada etapa y parada sin reintentos ante cualquier fallo.
5. Retomar la ejecución únicamente con los requisitos cumplidos y autorización correspondiente, revalidando el estado remoto inmediatamente antes de escribir.

## Alcance realizado

Solo inspección local, comprobación de hashes y este informe. **Ninguna migración aplicada en esta operación.** No se capturaron credenciales, consultó Cloudflare, exportó, restauró remotamente, creó Super Admin, desplegó, hizo commit ni push. Los informes y respaldos anteriores permanecen intactos.
