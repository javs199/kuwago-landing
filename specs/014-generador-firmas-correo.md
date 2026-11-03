# Spec 014 — Generador de firmas de correo

- **Estado:** en revisión
- **Ejecuta:** Claude Code
- **Revisa:** Antigravity (`/revisar-diff`)
- **Diseño:** `recursos-marca/02-uniformes-y-firmas/PT2-R3/06-firmas.png` (fuera del repo; firmas aprobadas revisión 03)
- **Rama:** `claude/project-thread-wjsprh` (rama asignada a la sesión; equivale a `spec/014-generador-firmas-correo`)

## Objetivo
Una página local (`herramientas/firmas.html`, se abre con doble clic) donde cualquier persona de Grupo Kuwago rellena nombre, cargo, teléfono y correo, ve su firma en vivo con el diseño PT2-R3 y la copia para pegarla en Gmail, Hostinger Webmail u Outlook.

## Archivos que toca
- (Nuevo) `herramientas/firmas.html` — generador. No entra en `dist/`.
- (Nuevo) `assets/images/email/kuwago-firma-claro-v1.png` y `kuwago-firma-oscuro-v1.png` — logo vertical 284×345 (se muestra a 74×90, ~3,8×), renderizado del vector de la firma PT2-R3. Sí entran en `dist/` y se publican con el próximo deploy.
- `scripts/check.mjs` — exige los dos PNG en el build.

## Restricciones
- HTML de la firma: tablas, estilos en línea, sin fuentes web (Georgia + Segoe UI/Tahoma/Arial), logo PNG con URL absoluta `https://grupokuwago.com/assets/images/email/…` y `width`/`height` fijos.
- Sin dependencias nuevas. Sin servidor.
- El repo es público: no guardar teléfonos personales en los presets.

## Criterio de verificación
- [x] `npm run build` y `npm run check` pasan; los PNG están en `dist/assets/images/email/`; `herramientas/` no está en `dist/`.
- [x] La firma coincide con PT2-R3 (claro y oscuro): nombre serif morado, cargo / empresa, filete dorado, teléfono y sitio.
- [x] «Copiar firma» escribe `text/html` + `text/plain` en el portapapeles (probado en Chromium con permiso de portapapeles).
- [x] UI en ES/EN, tema claro/oscuro, sin scroll horizontal a 390 px.
- [ ] Tras el deploy: `https://grupokuwago.com/assets/images/email/kuwago-firma-claro-v1.png` responde 200 y la firma recibida en Gmail y Outlook muestra el logo.

## Decisiones
- Vive como archivo local + logos en la landing (lectura más probable; 3 usuarios hoy). Si JV elige página pública o Admin, solo cambia la ubicación del HTML.
- Nombres de PNG con `-v1`: los correos ya enviados apuntan a esa URL; un logo nuevo debe ser `-v2`, nunca sobrescribir.
- Paleta de las firmas PT2-R3 (`#3B0C5B`, `#B98850`, `#F6F1E9`, `#241332`), no los tokens web: es la entrega aprobada para firmas.
- Variante clara sin fondo (se adapta al blanco del correo); la oscura lleva fondo morado y se marca como no recomendada por el modo noche de Gmail/Outlook.
- Se añadió correo como dato opcional (no estaba en PT2-R3).
- 2026-11-03, pedido de JV: firma más ancha y baja que PT2-R3. Ancho fijo 660 × ~100 px, logo 74×90, contactos en una sola línea separados por «·» dorado, filete al ancho del bloque. Correos muy largos la ensanchan (nowrap). En móvil puede requerir desplazamiento horizontal.
- Presets: Nahomy (con el teléfono público de la landing), Jesus y Katherine sin teléfono; cada uno escribe el suyo. Los datos se recuerdan en `localStorage` del navegador.

## Resultado de la revisión
<!-- La herramienta revisora pega aquí su veredicto: OK / Cambios requeridos + lista. -->
