# Spec 023 — Arreglar la lista de Propiedades tras guardar

- **Estado:** en revisión
- **Ejecuta:** Claude Code (bug en producción reportado por JV el 2026-11-05)
- **Revisa:** Codex (`/revisar-diff 023`)
- **Diseño:** n/a (sin cambios de UI)
- **Rama:** `claude/project-thread-ul505n`

## Síntoma
Después de guardar Carabao Villa en el admin, Propiedades muestra "API DEV no disponible". `GET /api/v1/properties` responde 503 `security_unavailable`.

## Causa
Al guardar, el Worker escribe `updated_by` con el id del principal de Access, que tiene la forma `access:<sha256>`. `AdminPropertySchema` validaba `updatedBy` y `publishedBy` con `id()`, que no admite `:`. Al leer, `hydrate()` lanza un error, el Worker lo convierte en 503 genérico y se cae la lista completa. La propiedad que se abre después también falla. Las pruebas no lo detectaron porque los principales de prueba usan ids sin `:` (`fixture-admin`).

Evidencia (lectura D1 autorizada por JV): Carabao tiene `row_version=2` y `updated_by='access:b329…dcfd'`. El guardado sí se aplicó.

## Archivos que toca
- `packages/contracts/src/admin.ts`: `updatedBy` y `publishedBy` se validan como texto no vacío de hasta 200 caracteres, igual que `uploadedBy` en multimedia.
- `packages/contracts/test/properties.test.mjs`: acepta `access:<64 hex>` y rechaza vacío, solo espacios, más de 200 caracteres y números.

## Criterio de verificación
- [x] Contratos: `build`, `lint` y `test` (13/13).
- [x] Admin: `typecheck`, `test` (53/53) y `build`. `verify:isolation` necesita el build de la landing, que no se corrió en este entorno.
- [x] Backend: `typecheck`, `build` y `test/properties-api.test.mjs` (8/8).
- [ ] Tras el deploy del Worker admin (candidate): la lista de Propiedades carga y Carabao muestra los cambios guardados.

## Decisiones
- No se toca D1: el dato es válido y lo que estaba mal era el contrato.
- Solo hay que redeplegar el Worker admin. Su bundle incluye el contrato del servidor y el del cliente. El barrier y el Worker público no validan `updatedBy`.

## Resultado de la revisión
