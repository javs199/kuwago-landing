# Spec 019 — Marketplace: subtotal y total estimado en el carrito

- **Estado:** en revisión
- **Ejecuta:** Claude Code
- **Revisa:** Antigravity (`/revisar-diff`)
- **Diseño:** n/a (se reutiliza el resumen existente del carrito; no hay pantalla nueva en `design/`)
- **Rama:** `claude/project-thread-dkf0mb` (rama asignada a esta sesión en lugar de `spec/019-…`)

## Objetivo
En `concierge-marketplace.html`, cuando el huésped agrega servicios con precio al carrito, ve el subtotal y el total estimado calculados con el precio de la opción elegida, las unidades y el descuento vigente. "Por confirmar" queda solo para lo que de verdad no tiene precio (opciones "Por cotizar", referencias de Stitch, servicios retirados o cambiados).

## Causa (verificada)
El resumen del carrito nunca se calculaba: en `concierge-marketplace.html:81` los tres importes son texto fijo `data-i18n="mp.pending"` y `renderCart()` en `assets/js/marketplace.js` no los toca.

## Reglas de cálculo
- Por línea: precio de la opción elegida en el catálogo cargado (no el guardado en el carrito), con el descuento vigente (`activeDiscount` + `discountedMinor`, redondeo por unidad como en la tarjeta).
- Cantidad: `unit = person` → × viajeros. `group`, `service`, `dinner` → × 1.
- `kind = fixed` suma normal. `kind = from` suma como mínimo y el subtotal se muestra "Desde …".
- `kind = quote`, `referencePrice` (Stitch), servicio retirado/cambiado o sin verificar → no suma; la línea dice "Por cotizar"/"Por confirmar" y el subtotal añade "+ por cotizar".
- Monedas mezcladas → todo "Por confirmar" (hoy todo es USD).
- Impuestos y cargos: "Por confirmar" (decidido por JV el 2026-11-04). El total estimado muestra el subtotal con "+ impuestos".
- Cada línea del carrito muestra su importe (p. ej. "USD 90,00 × 2 = USD 180,00").

## Ajuste de la tarjeta
Con varias opciones, la tarjeta mostraba "Desde 45,00 USD / persona · 20 min": la duración era la de la opción más barata (un complemento de 20 min) mientras la línea de arriba decía 60 min. Ahora: el precio "Desde" va sin duración y la línea de datos muestra el rango de duraciones ("20–60 min") cuando las opciones difieren.

## Archivos que toca
- `assets/js/catalog-adapter.js` — nueva función pura `cartTotals(cart, catalog, now)`.
- `assets/js/marketplace.js` — pinta el resumen y el importe por línea; tarjeta multiopción sin duración en el precio y con rango en los datos.
- `assets/js/marketplace-data.js` — claves ES/EN nuevas (`plusTaxes`, `plusQuote`).
- `concierge-marketplace.html` — ids en los importes del resumen.
- `assets/css/marketplace.css` — estilo de la línea de importe.
- `scripts/test-catalog.mjs` — pruebas.

## Restricciones
- No tocar admin, API, contratos ni D1. Sin dependencias nuevas.
- ES/EN, claro/oscuro, 390 px sin scroll horizontal.
- Es una estimación visual: no se envía nada ni se cobra.
- **Deploy de la landing solo con permiso explícito de JV** (ZIP de `dist/`, conservar `public_html/menu`).

## Criterio de verificación
- [x] `npm run build`, `npm run check`, `npm run test:catalog`, `npm run test:assets`, `npm run lint:catalog` pasan.
- [x] Prueba: opción USD 90 / persona × 2 viajeros → subtotal USD 180,00; con 15 % → USD 153,00.
- [x] Prueba: unidad `service` × 3 viajeros → × 1.
- [x] Prueba: precio `from` → "Desde"; opción `quote` → "+ por cotizar"; carrito solo con cotización → "Por confirmar".
- [x] Prueba: catálogo estático (Stitch) sigue en "Por confirmar".
- [ ] Manual: ES/EN, claro/oscuro, 390 px.

## Decisiones
- `dinner` se cuenta × 1 (una cena por línea), igual que `group` y `service`. [Probable]
- El descuento se evalúa con la fecha de hoy en Costa Rica, no con la fecha del servicio, porque así lo definió la spec 017.
- Impuestos: JV eligió el 2026-11-04 dejarlos "Por confirmar"; el total muestra el subtotal con "+ impuestos". No se suma IVA hasta que JV defina la regla.

## Resultado de la revisión
<!-- La herramienta revisora pega aquí su veredicto. -->
