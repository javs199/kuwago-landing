# Spec 002 — Correo de contacto y enlaces Canva de la guía Carabao

- **Estado:** cancelada (2026-11-03)
- **Ejecuta:** Codex
- **Revisa:** Antigravity
- **Diseño:** n/a (solo texto y enlaces)
- **Rama:** `spec/002-contacto-guia-carabao`
- **Depende de:** spec 001 (la guía debe estar en el repo)

## Objetivo
Que el huésped vea un único correo de contacto correcto y que ningún enlace de la guía lleve a una página de Canva rota o privada.

## Archivos que toca
- `menu/index.html` — sustituir el correo y corregir o quitar los enlaces Canva.

## Restricciones
- No tocar: `menu/carabao-welcome.css`, `menu/img/**`, ni nada fuera de `menu/`.
- Correo a usar: {{nahomysoraca@gmail.com o info.carabaovilla@gmail.com — lo decide el cliente}}. Hoy la web muestra `nahomysoraca@gmail.com` 3 veces.
- Enlaces Canva: {{URLs públicas correctas o "quitar"}}.
- No hacer deploy.

## Criterio de verificación
- [ ] `npm run build` y `npm run check` pasan
- [ ] `grep -c` del correo descartado en `menu/index.html` = 0
- [ ] Cada enlace externo de la guía responde 200 sin pedir login (comprobado con curl o navegador)

## Decisiones
- 2026-11-03 — **Cancelada.** El cliente confirma `nahomysoraca@gmail.com` (el que ya muestra la guía) y que no hay enlaces Canva que mantener. La guía se queda como está (ver spec 011).

## Resultado de la revisión
