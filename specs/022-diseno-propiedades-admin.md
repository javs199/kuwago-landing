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
- Hallazgo #1: se añadió `noValidate` al `<form>` del editor y validación explícita en `save()` con `PropertyInputSchema`; cuando falla un campo en otra pestaña, se activa esa pestaña, se enfoca el input con `aria-invalid="true"` y se muestra `role="alert"` con el motivo.
- Hallazgo #2: se reemplazó `role="tablist"`/`role="tab"` en los chips de filtro por `role="group"` y botones con `aria-pressed`.
- Hallazgo #3: `.badge-kind` usa ahora la pareja semántica `background: var(--action)` y `color: var(--on-action)` (contraste 13,56:1 en claro y 7,81:1 en oscuro, cumpliendo AA/AAA).
- Hallazgo #4: se ampliaron las áreas interactivas a ≥ 44 × 44 px (`.filter-chip`, `.properties-search-clear`, `.property-menu-item`, `.toggle-switch` e input, migas y enlaces) y se añadió margen/padding en `.properties-filter-chips` y `.editor-tabs-bar` con `flex-shrink: 0` para que el anillo de foco (`--focus`) sea visible sin recorte.
- Hallazgo #5: `bedsShort` en inglés se cambió de `'beds'` a `'bedrooms'` en `copy.ts` para reflejar habitaciones sin deducir camas.
- Hallazgo #6: las tarjetas muestran `"Visible en el sitio"` solo cuando `status === 'published'` y `showOnLanding` es verdadero; en borrador, archivada o despublicada muestran `"Oculta en el sitio"`, y si `status === 'published'` tiene `hasUnpublishedChanges` se añade `"(según el borrador)"`.
- Hallazgo #7: se eliminó `noCoverHelp` («Se requiere al menos 1 imagen para publicar» / «At least 1 photo is required to publish») de `copy.ts`, `PropertiesModule.tsx` y `PropertyEditor.tsx`.
- Hallazgo #8: se trasladaron a `copy.ts` (ES/EN) el nombre accesible del grupo de filtros (`filterGroupLabel`), el `aria-label` del `tablist` del editor (`editorTabsLabel`) y el placeholder de ubicación (`locationPlaceholder`).
- Hallazgo #9: en la pestaña Datos se separaron Modalidad Operativa, Ubicación, Distribución y Aforo, Enlace Airbnb y Slug en 5 tarjetas `.panel.data-card` independientes y se mantuvo `.capacity-grid` en 3 columnas a 390 px.
- Hallazgo #10: se recomprimió `apps/admin/src/assets/properties/carabao-villa.webp` a 111 224 bytes (≤ 120 000 bytes).
- Hallazgo #11: se restauró el subtítulo exacto `"Portafolio Activo · Uvita, CR"` (`"Active Portfolio · Uvita, CR"` en EN) y se retiró `"luxury"` de `integrateNewDesc` en inglés.
- Hallazgo #12: `covers.ts` usa ahora `Map<string, string>` para evitar heredar claves de `Object.prototype` y se añadieron pruebas unitarias para `constructor`, `toString` y `__proto__`.

## Resultado de la revisión

**OK** — Segunda revisión de Codex, 2026-11-05, sobre `4b1ecefc436760f475c401ac8028ac0137f16250`. Comparados `main...4b1ecef` y las correcciones `0fa4ea3..4b1ecef`. Los **12 hallazgos anteriores quedan cerrados** con las siguientes evidencias; esta sesión solo modifica este resultado de revisión.

### Comprobación individual de los 12 hallazgos

1. **Cerrado — `apps/admin/src/features/properties/PropertyEditor.tsx:191` y `:451`.** Repetido en navegador real el recorrido Datos → Airbnb `invalid-url` → General → Guardar cambios: `noValidate=true`, vuelve a Datos, foco en `prop-airbnb`, `aria-invalid="true"`, alerta visible con «Enlace Airbnb» y **cero peticiones PUT**. El valor inválido permanece para corregirlo. Tras introducir un Airbnb válido, Guardar devuelve éxito y una lectura de la API local confirma los cambios. La prueba persistente de regresión existe en `apps/admin/src/test/Properties.test.tsx:170` y comprueba cambio de pestaña, foco, alerta y ausencia de guardado.
2. **Cerrado — `apps/admin/src/features/properties/PropertiesModule.tsx:187`.** Filtros como `role="group"` con botones `aria-pressed`, sin semántica falsa de pestañas. Seleccionar Publicadas filtra las tarjetas y las aserciones de selección están en `Properties.test.tsx:210`. El tablist verdadero del editor sigue operable con flechas: General → ArrowRight mueve selección y foco a Datos, comprobado en las cuatro combinaciones de ancho/tema.
3. **Cerrado — `apps/admin/src/features/properties/properties.css:428`.** `.badge-kind` usa `--action`/`--on-action`. Colores calculados en navegador: claro `#FFFFFF` sobre `#3B0C5B`, **15,11:1**; oscuro `#241B29` sobre `#D1AD66`, **7,82:1**. Ambos superan AA. El valor claro medido es 15,11:1, corrigiendo la cifra de 13,56:1 anotada por el ejecutor en Decisiones. Las etiquetas de estado ahora tienen fondos opacos; no dependen de la foto para su contraste.
4. **Cerrado — `apps/admin/src/features/properties/properties.css:100`, `:195`, `:540` y `:1070`.** Medidas reales a 1440 y 390, claro/oscuro: chips **44 px** de alto (ancho mínimo observado 96,81 px), limpiar **44 × 44 px**, opciones del menú **176 × 44 px**, interruptor y su input **52 × 44 px**, migas **114,64 × 44 px**. Los tres inputs de capacidad también miden 44 px de alto y ≥ 83,32 px de ancho en móvil. Foco de teclado comprobado con Tab/Shift+Tab: contorno de **3 px**, separación **2 px**, `#784B98` en claro / `#D1AD66` en oscuro; visible y con espacio para no recortarse en el contenedor de filtros. Las capturas muestran también el anillo visible de las pestañas del editor.
5. **Cerrado — `apps/admin/src/features/properties/copy.ts:231`.** EN usa `bedrooms`. El navegador muestra «4 bedrooms» en la cabecera con el dato `bedrooms=4`; la prueba de EN comprueba «5 bedrooms» en `Properties.test.tsx:157`. No se añadió un campo de camas.
6. **Cerrado — `apps/admin/src/features/properties/PropertiesModule.tsx:293`.** La visibilidad exige estado publicado y `showOnLanding`; si la publicada tiene cambios se aclara «según el borrador». Tras despublicar y archivar mediante UI real, el estado de API coincide y la tarjeta archivada muestra **Oculta en el sitio** aunque conserva `showOnLanding=true`. El caso archivada con preferencia verdadera y el caso publicada con borrador están comprobados en `Properties.test.tsx:81`.
7. **Cerrado — `apps/admin/src/features/properties/copy.ts` y consumidores de Fotos/lista.** `noCoverHelp` y la supuesta exigencia de una foto desaparecieron. Fotos muestra solamente el aviso autorizado y la portada; comprobado también en EN: «Photos are managed on the website for now.» Sin contador ni nueva validación de fotos.
8. **Cerrado — `apps/admin/src/features/properties/PropertyEditor.tsx:419`, `:639` y `PropertiesModule.tsx:187`.** Navegador en EN: «Property editor tabs», «E.g. Uvita, Costa Rica» y «Property filter». Las claves están en `copy.ts`; las dos primeras tienen aserciones persistentes en `Properties.test.tsx:157`.
9. **Cerrado — `apps/admin/src/features/properties/PropertyEditor.tsx:597` y `properties.css:1231`.** Datos tiene **cinco tarjetas independientes**. A 390 px, capacidad mantiene **tres columnas de 101,33 px** con inputs sin desbordamiento, en ambos temas. Capturas contrastadas con diseño 06 móvil: recuperadas las agrupaciones de Modalidad, Ubicación, Distribución, Airbnb y Slug; sin mapa, amenidades ni sincronización.
10. **Cerrado — `apps/admin/src/assets/properties/carabao-villa.webp`.** **111 224 bytes**, por debajo del límite decimal **120 000 bytes**. Las otras portadas: Villa Maya **110 880 B**, Casa Bella Mía **118 552 B**, Casa Heliconia **118 026 B**. Todas cumplen; total **458 682 B**, menor que **600 000 B**. Solo se recomprimió Carabao respecto de la primera revisión; conserva su portada del carrusel.
11. **Cerrado — `apps/admin/src/features/properties/copy.ts:5`, `:121` y `:125`.** Restituido «Portafolio Activo · Uvita, CR» y su traducción; retirado «luxury» del texto de integración EN. «Casas y santuarios residenciales…» permanece porque sí tiene fuente en el diseño 05 aprobado, como se verificó en la primera revisión.
12. **Cerrado — `apps/admin/src/features/properties/covers.ts:6` y `:14`.** Usa `Map`. Importado el módulo real desde Vite en el navegador: `constructor`, `toString`, `__proto__` y `unknown-slug` devuelven **null**. Las tres claves heredadas tienen aserciones explícitas persistentes en `Properties.test.tsx:255`.

### Pruebas declaradas frente a pruebas existentes

El total **53** es correcto: `Properties.test.tsx` mantiene **8 casos `it`** tanto en `0fa4ea3` como en `4b1ecef`; el resto de la suite tampoco aumenta. El commit **amplía casos existentes**, con **39 → 57 llamadas a `expect`** en ese archivo (18 adicionales). No añadió nuevos casos independientes. Las comprobaciones nuevas de validación oculta, visibilidad, EN, filtros y claves heredadas existen en el diff y se ejecutan en verde. La afirmación del ejecutor debe entenderse como ampliación de cobertura; no como incremento de la cantidad de tests. No se añadieron pruebas persistentes de navegador ni medidas CSS al repositorio; las medidas de esta revisión se reprodujeron con el script local indicado abajo.

### Checks y evidencia de la segunda revisión

- `npm --prefix apps/admin test`: **PASS, 6 suites / 53 pruebas**. `npm --prefix apps/admin run typecheck`, `run lint`, `run build` y `run verify:isolation`: **PASS**. `git diff --check main...4b1ecef`: **PASS**. Build Vite: JS **365,05 kB**, CSS **52,89 kB**, sin comprimir.
- Playwright Python + Edge headless contra Vite `127.0.0.1:5175` y `dev:admin-test -- --provision-test-identities --allow-test-reviewer` en `127.0.0.1:8794`, usando identidad sintética y D1/R2 aislados del harness. **PASS**: validación del hallazgo 1, guardado posterior, publicar, despublicar y archivar, con lecturas posteriores de la API local. Sin operaciones remotas.
- Ocho capturas lista/editor × 1440/390 × claro/oscuro comparadas con diseños 05/06 y sus notas. General en escritorio; Datos en móvil. **Sin desbordamiento horizontal:** `scrollWidth === clientWidth` en las ocho (1440 o 390). Cuadrícula de lista, ES/EN de General, Datos por tarjetas, portadas reales y barra móvil conservados. El panel de login sintético y el shell previo no son cambios de producto de esta spec. Continúan diferencias menores ya descritas en la primera revisión (nombre debajo de la portada en móvil y posición del hero/pestañas en escritorio); no se abren requisitos nuevos en esta segunda revisión de los 12 hallazgos.
- Artefactos locales fuera del repo, sin credenciales guardadas: `%TEMP%\kuwago-review-022-second\` contiene `review.py`, `report.json`, las ocho capturas, `finding1.png` y capturas de foco. El script termina el harness al finalizar.
- Alcance confirmado: diff acumulado de **11 archivos permitidos**, incluida la spec. **Sin cambios en API, contratos, D1, migraciones, dependencias o configuración**. Ninguno de los elementos «NO se implementa» de las notas aparece; no se añadieron campos ajenos a `AdminProperty`. Huéspedes/Calendario siguen deshabilitados con Pronto; Fotos sin contador. Portadas locales empaquetadas compatibles con CSP. `menu/` no rastreado se dejó intacto y fuera del commit.

**Veredicto final de la segunda revisión: OK.** Sin correcciones de implementación en esta sesión, merge ni deploy.
