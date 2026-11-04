# Spec 016 — Marketplace: diálogo centrado y elegir entre las opciones de un servicio

- **Estado:** lista
- **Ejecuta:** Codex
- **Revisa:** Antigravity (`/revisar-diff`)
- **Diseño:** n/a (no hay pantalla en `design/`; ver Decisiones)
- **Rama:** `spec/016-marketplace-opciones`

## Objetivo
En `concierge-marketplace.html`, un huésped que abre "Opciones" de un servicio:
1. Ve el diálogo **centrado vertical y horizontalmente** en cualquier pantalla. Hoy aparece pegado abajo.
2. Puede **elegir entre todas las opciones publicadas** del servicio (por ejemplo, "Relajante 60 min", "Relajante 90 min", "Piedras calientes 60 min"…). Al elegir una, ve su precio, duración y modalidad, y esa opción es la que entra al carrito. Hoy el marketplace solo usa la primera opción (`toMarketplaceCard` toma `service.options[0]`).

## Causa del punto 1 (verificada)
El `<style>` en línea de `concierge-marketplace.html` (línea 11) tiene `main > :last-child { margin-bottom: 0 !important; }`. El `<dialog id="mp-dialog">` es el último hijo de `<main>`, así que pierde el `margin:auto` con que el navegador centra los diálogos modales: queda con `margin-bottom:0` y se va hacia abajo. Lo comprobé con las reglas computadas en Chromium a 1440×900 (`margin: 432px 450px 0`).

## Archivos que toca
- `concierge-marketplace.html`:
  - Cambiar la regla a `main > :last-child:not(dialog)` (o mover el `<dialog>` fuera de `<main>`; elige lo más simple y anótalo en Decisiones).
  - Dentro de `#mp-options`, antes de la fecha, agregar un grupo `<fieldset id="mp-option-choices">` con `<legend data-i18n="mp.chooseOption">`. Lo llena el JS.
- `assets/js/catalog-adapter.js`: `toMarketplaceCard` conserva la opción 0 como predeterminada (la tarjeta sigue mostrando "Desde"/precio de esa opción) y además expone `options`: la lista completa con `id`, nombre ES/EN, `durationMinutes`, `experienceType`, `venue` y `price`.
- `assets/js/marketplace.js`:
  - `openOptions` dibuja un radio por opción, con nombre, precio formateado (misma función que hoy, `reference`) y duración. Si hay una sola opción, se muestra seleccionada (sin ocultarla).
  - Al cambiar el radio se actualiza `#mp-dialog-meta` con el precio y la duración de la opción elegida.
  - Al enviar, el ítem del carrito guarda el `optionId` elegido. Al editar un ítem del carrito, el radio aparece marcado con su `optionId`.
  - El carrito muestra el nombre de la opción bajo el título del servicio.
  - El cambio de idioma (bloque de las líneas ~125-131) también redibuja los nombres de las opciones.
  - En la tarjeta del servicio, si tiene más de una opción, el precio se muestra como "Desde" + el **menor** precio entre las opciones con precio fijo o "desde" (no cambia si solo hay una).
- `assets/js/i18n.js` (o donde vivan las claves `mp.*`): `mp.chooseOption` = "Elige una opción" / "Choose an option".
- `assets/css/marketplace.css`: estilos de la lista de opciones (radios en tarjetas apiladas, tokens existentes `--mp-*`, foco visible, claro/oscuro).
- `scripts/test-catalog.mjs`: pruebas nuevas (ver verificación).

## Restricciones
- No tocar el admin, la API, los contratos ni D1.
- No añadir dependencias. JS vanilla como el resto de la landing.
- ES/EN, temas claro/oscuro y 390 px sin scroll horizontal.
- Después de cambiar clases: `npm run css`.
- **Deploy de la landing solo con permiso explícito de JV** (ZIP de `dist/` a Hostinger, conservar `public_html/menu`).

## Criterio de verificación
- [ ] `npm run build`, `npm run check`, `npm run test:catalog`, `npm run test:assets` y `npm run lint:catalog` pasan.
- [ ] Prueba: un servicio con 3 opciones dibuja 3 radios; al elegir la 2.ª y enviar, el carrito guarda el `optionId` de la 2.ª.
- [ ] Prueba: editar ese ítem abre el diálogo con la 2.ª opción marcada.
- [ ] Prueba: la tarjeta de un servicio con opciones de $90 y $130 muestra "Desde USD 90".
- [ ] Manual (`npm run dev`, catálogo real o el estático): a 1440×900 y 390×844 el diálogo queda centrado (distancia arriba ≈ distancia abajo, ±2 px), ES/EN, claro/oscuro.
- [ ] Manual: con teclado, Tab llega a los radios, las flechas cambian de opción y Esc cierra el diálogo.

## Decisiones
- No hay pantalla de Stitch para el selector. Se usan radios dentro del diálogo existente porque mantiene el flujo actual (tarjeta → Opciones → carrito) y es accesible por teclado (regla 9).
- La opción predeterminada es la primera del admin, así el orden del admin manda.
- Los descuentos (pedido 3 de JV) quedan fuera: requieren cambios en contrato, D1 y admin. Van en otra spec.

## Resultado de la revisión
<!-- La herramienta revisora pega aquí su veredicto: OK / Cambios requeridos + lista. -->
