# Spec 021 — Cerrar sesión en el menú móvil del admin

- **Estado:** en revisión
- **Ejecuta:** Claude Code (arreglo pequeño pedido por JV el 2026-11-05)
- **Revisa:** Antigravity (`/revisar-diff`)
- **Diseño:** n/a (se reutiliza el botón "Cerrar sesión" de la barra lateral de escritorio)
- **Rama:** `claude/project-thread-ul505n`

## Objetivo
En móvil (< 1024 px), el menú "Más" del admin muestra el botón "Cerrar sesión". Hoy solo está en la barra lateral de escritorio, que en móvil está oculta.

## Archivos que toca
- `apps/admin/src/components/AdminShell.tsx` — botón en el diálogo móvil, con la misma condición y la misma acción (`signOutToPublicSite`) que el de escritorio.
- `apps/admin/src/styles/app.css` — estilo `.dialog-signout` (44 px de alto, tokens existentes).
- `apps/admin/src/test/App.test.tsx` — el diálogo móvil contiene "Cerrar sesión".

## Criterio de verificación
- [x] Admin: `typecheck`, `lint`, `test` (50/50), `build` y `verify:isolation` pasan.
- [x] Captura a 390 px: el botón aparece debajo de "Apariencia e idioma".
- [ ] Tras el deploy: en el móvil, con sesión de Access, "Cerrar sesión" lleva a grupokuwago.com.

## Decisiones
- En el build local, sin sesión, el botón aparece deshabilitado, igual que en escritorio.

## Resultado de la revisión
