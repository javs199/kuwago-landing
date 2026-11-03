# Spec 011 — Retirar la guía /menu/ del sitio y del proyecto

- **Estado:** borrador (se activa cuando JV dé el sitio por terminado)
- **Ejecuta:** Claude Code (toca Hostinger y documentación de deploy)
- **Revisa:** Antigravity (`/revisar-diff`)
- **Diseño:** n/a
- **Rama:** `spec/011-retirar-menu`

## Objetivo
Que https://grupokuwago.com/menu/ deje de existir y que el proyecto no conserve ninguna referencia operativa a ella, para que el código de puerta y la contraseña Wi-Fi dejen de estar publicados.

## Archivos que toca
- `AGENTS.md` — quitar la URL de /menu/, la regla 11 ("Conservar `public_html/menu`") y la mención en Estado actual.
- `docs/MENU-PUBLICATION.md` — marcar como histórico o borrar (decide JV).
- Fuera de Git: borrar `public_html/menu/` en Hostinger (File Manager) — lo hace JV, con respaldo ZIP previo.

## Restricciones
- No tocar la landing ni el build.
- Respaldo ZIP de `public_html/menu/` guardado fuera del repo antes de borrar.
- Avisar al cliente antes de retirarla (el huésped puede seguir usándola).
- Después de retirar: recomendar al cliente cambiar el código de puerta y la contraseña Wi-Fi, porque estuvieron públicos.

## Criterio de verificación
- [ ] `https://grupokuwago.com/menu/` responde 404 (o redirige a la portada, si JV lo prefiere)
- [ ] `grep -rn "public_html/menu" AGENTS.md` = 0 resultados
- [ ] `npm run build` y `npm run check` pasan

## Decisiones
- 2026-11-03 — Creada al cancelar la spec 001: JV decidió que /menu/ es temporal para un cliente.

## Resultado de la revisión
