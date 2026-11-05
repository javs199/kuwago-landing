# Spec 022 — Rediseño de Propiedades en el admin (desde Stitch)

- **Estado:** en revisión
- **Ejecuta:** Antigravity (UI desde `design/`)
- **Revisa:** Codex (`/revisar-diff`), porque ejecuta Antigravity
- **Diseño:** `design/05-admin-propiedades-lista/` y `design/06-admin-propiedades-editor/` (leer sus `notas.md`: qué se implementa y qué no)
- **Rama:** `spec/022-diseno-propiedades-admin`

## Objetivo
La sección Propiedades del admin se ve como las capturas de Stitch (claro y oscuro, 1440 y 390 px), sin cambiar la API ni los datos: solo la presentación de lo que la spec 020 ya guarda.

## Archivos que toca
- `apps/admin/src/features/properties/PropertiesModule.tsx` — lista en cuadrícula, chips con conteo, buscador (filtra en cliente por nombre, slug y ubicación), estados vacío/cargando/error.
- `apps/admin/src/features/properties/PropertyEditor.tsx` — cabecera, pestañas, panel Publicación fijo (barra inferior en móvil).
- `apps/admin/src/features/properties/copy.ts` — textos ES/EN nuevos.
- (Nuevo) `apps/admin/src/features/properties/properties.css` — estilos con los tokens de `apps/admin/src/styles/tokens.css`.
- (Nuevo) `apps/admin/src/features/properties/covers.ts` y `apps/admin/src/assets/properties/*.webp` — una portada por slug (las 4 actuales, ≤ 120 KB cada una, sacadas de `assets/images/properties/<slug>/` de la landing, primera foto del carrusel). Slug sin portada → marcador neutro.
- `apps/admin/src/test/Properties.test.tsx` — ajustar y ampliar.

## Restricciones
- **No tocar** la API, los contratos ni D1. Si un campo de la captura no existe en `AdminProperty`, no se muestra (ver `notas.md`).
- **Portadas empaquetadas en el admin**: la CSP del admin es `img-src 'self' blob:` (`infra/cloudflare/dev/src/gateway.ts:11`), así que no se pueden cargar desde grupokuwago.com.
- Sin dependencias nuevas. Sin Material Symbols ni Tailwind CDN de Stitch: íconos `lucide-react` (ya instalado) y CSS propio.
- Hanken Grotesk ya alojada en el admin; KUWAGO en Libre Bodoni solo en el logo existente.
- Pestaña **Fotos**: solo un aviso "Las fotos se gestionan en el sitio por ahora" y la portada; sin contador.
- Pestañas **Huéspedes** y **Calendario**: visibles, deshabilitadas, con etiqueta "Pronto".
- **Orden**: sigue siendo el campo numérico "Orden en el sitio" del panel de publicación. La lista solo muestra el número (#1, #2…). Sin arrastre en esta spec.
- Accesibilidad: AA en claro y oscuro, foco visible, objetivos de 44 px, pestañas con `role="tablist"` y flechas.

## Criterio de verificación
- [x] Admin: `typecheck`, `lint`, `test`, `build`, `verify:isolation` pasan.
- [x] Capturas locales (`dev:admin-test`) de lista y editor en 1440 y 390, claro y oscuro, comparadas con `design/05` y `design/06`, sin desbordamiento horizontal.
- [x] Ninguno de los elementos de "NO se implementa" de los `notas.md` aparece.
- [x] Guardar, publicar, despublicar y archivar siguen funcionando igual que en la spec 020 (pruebas existentes en verde).
- [x] Bundle del admin: aumento ≤ 600 KB por las portadas.

## Decisiones
- Base visual: lista en **cuadrícula** de la versión clara (no las filas del oscuro de escritorio), porque coincide con el móvil (Claude, 2026-11-05).
- El arrastre para reordenar queda fuera: cambiar el orden de varias propiedades obligaría a publicar cada una o a un endpoint nuevo de orden en lote. Si JV lo quiere, va en una spec de API aparte.
- Descripción en texto plano: el contrato no admite formato y la landing no lo renderiza.

## Resultado de la revisión
- Implementación completa de la UI de lista y editor de Propiedades según Stitch y tokens semánticos del proyecto.
- Verificaciones del admin ejecutadas y aprobadas: typecheck (0 errores), lint (0 errores), test (6 suites, 53 pruebas pasadas), build (éxito), verify:isolation (aislamiento estricto confirmado).
- Portadas webp optimizadas empaquetadas en `apps/admin/src/assets/properties/` (468 KB total, < 600 KB presupuesto).
- 8 capturas completas generadas en claro y oscuro (1440 px y 390 px) contra `dev:admin-test` sin desbordamiento horizontal (`scrollWidth === clientWidth`).
