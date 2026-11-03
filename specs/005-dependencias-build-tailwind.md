# Spec 005 — Cerrar los avisos de npm audit del build de la landing

- **Estado:** borrador
- **Ejecuta:** Codex
- **Revisa:** Gemini CLI
- **Diseño:** `design/01-landing/captura.png` (tras la spec 004) — la salida visual no debe cambiar
- **Rama:** `spec/005-audit-tailwind`

## Objetivo
Eliminar los 7 avisos de `npm audit` (5 altos, 2 moderados) de las herramientas de build de la landing sin cambiar nada de lo que ve el visitante.

## Archivos que toca
- `package.json`, `package-lock.json` — actualizar dentro de Tailwind 3.x u `overrides` de las dependencias transitivas afectadas.
- `tailwind.config.cjs` — solo si la actualización lo exige.

## Restricciones
- No migrar a Tailwind 4 en esta spec (sería otra, con revisión visual completa).
- No tocar `index.html`, `concierge-marketplace.html`, `assets/js/**`, `apps/**`, `infra/**`.
- No hacer deploy.

## Criterio de verificación
- [ ] `npm audit` en la raíz: 0 altos (los que no tengan arreglo en 3.x se listan con su motivo)
- [ ] `npm run build`, `npm run check` y todos los `npm run test:*` pasan
- [ ] `assets/css/tailwind.css` generado es idéntico o la diferencia está justificada línea a línea
- [ ] Revisión en navegador: 390 px y 1440 px, claro/oscuro, ES/EN, sin cambios visibles

## Decisiones

## Resultado de la revisión
