# Spec 004 — Llenar design/ con los exports de Stitch existentes

- **Estado:** borrador
- **Ejecuta:** Codex (mecánico)
- **Revisa:** Antigravity (`/revisar-diff`)
- **Diseño:** n/a (esta spec crea la carpeta de diseño)
- **Rama:** `spec/004-design-stitch`

## Objetivo
Que cada pantalla aprobada tenga su referencia en `design/NN-pantalla/` (captura + código), para que las specs de UI puedan apuntar a ella como exige la regla 8 de AGENTS.md.

## Archivos que toca
- (Nuevos) `design/01-landing/` — desde `docs/reference/screen.png` y `stitch-export.html`.
- (Nuevos) `design/02-concierge-marketplace-*/` — desde `../Marketplace/stitch_kuwago/` (escritorio claro/oscuro).
- (Nuevos) `design/10-admin-login-*/`, `design/11-admin-dashboard-*/` — desde `../Admin Portal/stitch_kuwago/` (8 variantes: claro/oscuro × móvil/escritorio).
- (Nuevos) `design/*/notas.md` — qué está aprobado y qué no (p. ej. login sin implementar; marketplace sin diseño móvil).

## Restricciones
- Copiar, no mover: los originales fuera del repo y `docs/reference/` quedan intactos.
- Renombrar `screen.png` → `captura.png` y `code.html` → `codigo.html` según `design/LEEME.md`.
- No tocar código de la landing ni del admin.
- Confirmar con JV el peso total antes de commitear si supera {{N}} MB.

## Criterio de verificación
- [ ] Cada carpeta de `design/` tiene `captura.png`
- [ ] Los hashes de las capturas coinciden con los originales
- [ ] `npm run build` sigue pasando y `dist/` no contiene `design/`

## Decisiones

## Resultado de la revisión
