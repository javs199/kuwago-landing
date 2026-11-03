# Spec 007 — La página Servicios lee el catálogo publicado de la API

- **Estado:** borrador (depende de la spec 006)
- **Ejecuta:** Codex (adaptador) + Claude Code (Worker público)
- **Revisa:** Antigravity (`/revisar-diff`)
- **Diseño:** `design/02-concierge-marketplace-*/` (spec 004)
- **Rama:** `spec/007-servicios-desde-api`

## Objetivo
Que la página pública `/concierge-marketplace.html` muestre los servicios publicados desde el Admin, sin editar HTML. Es el criterio de cierre del MVP.

## Archivos que toca
- `infra/cloudflare/dev/src/public.ts`, `src/barrier.ts` — Worker público aislado (solo DTO aprobado)
- (Nuevo) config wrangler del Worker público DEV
- `assets/js/catalog-adapter.js`, `assets/js/marketplace.js`, `assets/js/config.js` — fuente API con estados vacío/error; sin fallback silencioso a la referencia estática
- `scripts/test-catalog.mjs`

## Restricciones
- El Worker público no tiene acceso a credenciales del Admin ni a imágenes privadas.
- Catálogo real (cliente, 2026-11-03): los servicios concierge publicados en la guía https://grupokuwago.com/menu/, con sus precios en **USD**. Se cargan en el Admin DEV (spec 006); los ejemplos de Stitch no se publican.
- No mostrar precios sin moneda explícita: la moneda es USD (`currency: null` hoy en la API, se corrige en esta spec o en la 006).
- La página sigue `noindex` hasta que el cliente apruebe el catálogo.
- Sin deploy a Hostinger dentro de esta spec.

## Criterio de verificación
- [ ] `npm run build`, `npm run check`, `npm run test:catalog`, `npm run lint:catalog` pasan
- [ ] Con la API caída, la página muestra estado de error, no los ejemplos de Stitch
- [ ] Un servicio retirado en el Admin desaparece de la página después de la reconciliación
- [ ] La UI coincide con la captura de `design/` en 390 px y 1440 px, ES/EN, claro/oscuro

## Decisiones

## Resultado de la revisión
