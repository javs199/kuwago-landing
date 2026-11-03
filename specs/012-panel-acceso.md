# Spec 012 — Panel de acceso desde el icono de cuenta

- **Estado:** en revisión
- **Ejecuta:** Codex
- **Revisa:** Antigravity (`/revisar-diff`)
- **Diseño:** n/a (sin pantalla en Stitch; usar tokens y componentes de marca existentes: colores #200037/#3B0C5B, dorados #D1AD66/#8F691F, Hanken Grotesk, bordes redondeados y sombras como las cards del marketplace)
- **Rama:** `spec/012-panel-acceso`

## Objetivo
Que al pulsar el icono de cuenta (círculo con `person`, arriba a la derecha) se despliegue un panel con 4 tarjetas de acceso: **Huéspedes**, **Administradores**, **Propietarios** y **Proveedores**. Solo "Administradores" funciona por ahora y lleva al portal admin; las otras 3 se ven pero deshabilitadas con "Próximamente". El enlace "Acceso administrativo" del pie de página desaparece.

## Archivos que toca
- `index.html`, `concierge-marketplace.html` — convertir el `div` del icono `person` en un `button` con `aria-haspopup="dialog"`/`aria-expanded`, añadir el panel; quitar el enlace `.footer-admin-link` del footer.
- `assets/js/main.js` — abrir/cerrar el panel (clic, Esc, clic fuera, foco al abrir y devolución de foco al cerrar). Respetar que en móvil (`max-width: 1023px`) el control de cuenta se mueve al menú móvil: el panel debe funcionar ahí también.
- `assets/js/i18n.js` — claves ES/EN nuevas (`account.*`); eliminar `footer.admin`.
- `assets/js/config.js` — URL del admin en config (`window.KUWAGO_ACCESS = { admin: "https://kuwago-admin-api-development.ch-jesus-99.workers.dev/" }`), no en el HTML.
- `styles/` o `assets/css/styles.css` — estilos del panel si no alcanzan las clases Tailwind existentes.

## Contenido de las tarjetas
| Tarjeta | ES | EN | Estado |
|---|---|---|---|
| Huéspedes | Huéspedes — Tu estadía y servicios | Guests — Your stay and services | Deshabilitada, "Próximamente" |
| Administradores | Administradores — Portal de gestión | Administrators — Management portal | **Activa**: enlace a `KUWAGO_ACCESS.admin`, misma pestaña, `rel="nofollow"` |
| Propietarios | Propietarios — Tu propiedad y reportes | Owners — Your property and reports | Deshabilitada, "Próximamente" |
| Proveedores | Proveedores — Servicios y reservas | Providers — Services and bookings | Deshabilitada, "Próximamente" |

Cada tarjeta: icono Material Symbols coherente (p. ej. `luggage`, `admin_panel_settings`, `home_work`, `storefront`), título y subtítulo. Las deshabilitadas no son enlaces (`aria-disabled="true"`, sin `href`), con opacidad reducida.

## Restricciones
- No añadir dependencias ni frameworks.
- No tocar el marketplace, el catálogo, `catalog-adapter.js`, Cloudflare ni nada en `infra/` o `apps/`.
- Accesible: navegable con teclado, Esc cierra, foco visible, `aria-label` traducido en el botón.
- Claro/oscuro y ES/EN deben funcionar igual que el resto del header.
- Sin deploy.

## Criterio de verificación
- [x] `npm run build` y `npm run check` pasan; `npm run lint:catalog` sigue pasando
- [x] Escritorio (1440 px): clic en el icono abre el panel con 4 tarjetas; solo Administradores es clicable y abre el admin
- [x] Móvil (390 px): desde el menú móvil, el control de cuenta abre el mismo panel y cabe en pantalla
- [x] Esc y clic fuera cierran; el foco vuelve al botón
- [x] ES/EN y claro/oscuro correctos en `index.html` y `concierge-marketplace.html`
- [x] El footer ya no muestra "Acceso administrativo" (`grep -c footer-admin-link *.html` = 0)

## Decisiones
- Se toma la excepción de diseño de esta spec (Diseño: n/a y ejecuta Codex) como autorización para implementar sin pantalla Stitch; se reutilizan Hanken Grotesk, tokens morados/dorados, radios y sombras existentes.
- El panel es un `dialog` modal nativo, situado bajo el header a la derecha en escritorio y con márgenes de 16 px en móvil. Mantiene el foco entre Cerrar y Administradores; las tarjetas futuras son contenedores sin enlace ni tabulación.
- El menú móvil permanece abierto al cerrar el panel para devolver el foco al mismo botón de cuenta visible. Al cruzar el breakpoint de 1023 px se cierra el panel y se conserva un foco visible.
- La URL del portal vive solo en `KUWAGO_ACCESS.admin`, con navegación en la misma pestaña y `nofollow`; no se modifica el catálogo ni la infraestructura.
- Se conserva fuera del commit el cambio previo en `assets/css/tailwind.css` (restaurado byte por byte tras compilar) y la carpeta `menu/` sin seguimiento. La actualización de esta spec está autorizada expresamente por JV.

### Evidencia de verificación
- `npm run build`: PASS, salida en `dist/`; único aviso informativo: base Browserslist desactualizada.
- `npm run check`: PASS (incluida generación automática de contratos, sin cambios pendientes en ellos).
- `npm run lint:catalog`: PASS, cero warnings.
- Playwright con Edge Chromium headless contra `dist/`: PASS en 16 combinaciones de `index.html`/`concierge-marketplace.html`, 1440×900/390×844, ES/EN y claro/oscuro; sin errores JavaScript.
- En cada combinación: cuatro tarjetas, un solo enlace, tres tarjetas con `aria-disabled=true` sin `href`, traducción del título/botón/Próximamente, apertura con Enter, Tab cíclico, Esc y clic exterior con retorno de foco. Panel dentro del viewport, sin desbordamiento horizontal. Apertura con clic comprobada también en ambos tamaños.
- En ambas páginas y tamaños: destino admin exacto, `rel=nofollow`, misma pestaña. La navegación se interceptó en el navegador de prueba; no se autenticó ni se operó el portal remoto.
- Revisión visual de capturas de escritorio/móvil en ambos temas e idiomas: panel legible, cuatro tarjetas y foco visible. Las 16 capturas y el script temporal quedan en `%TEMP%/kuwago-012-verificacion/` y `%TEMP%/kuwago-012-test.py`, fuera del repositorio.
- Búsqueda de `footer-admin-link` en ambos HTML: 0 coincidencias; `footer.admin` eliminado de i18n. `git diff --check`: PASS.
- Sin deploy ni push. Pendiente la revisión independiente de Antigravity en una sesión nueva.

## Resultado de la revisión

**Veredicto:** `Cambios requeridos`

1. `assets/css/styles.css:338,340` — Al convertir el contenedor del icono `person` de `<div>` a `<button id="account-button">`, las reglas móviles `#mobile-header-actions > div:has(> .material-symbols-outlined)` quedaron huérfanas (código muerto) y dejaron de aplicarse al control de cuenta dentro del menú móvil (`max-width: 1023px`). Como `setupMobileNavigation()` en `assets/js/main.js:661-669` le antepone `<span class="mobile-action-label">Cuenta</span>` (`display: inline`), el botón en el menú móvil conserva `w-8 h-8 rounded-full` (32×32 px) sin `width: 100%` ni `color: #fff`, desbordando el texto «Cuenta»/«Account» y el icono fuera del círculo de 32 px. — **Arreglo sugerido:** reemplazar `#mobile-header-actions > div:has(> .material-symbols-outlined)` en las líneas 338 y 340 por `#mobile-header-actions #account-button`.

### Evidencia de verificación ejecutada en revisión
- **Archivos tocados en el commit de la spec (`0a93fcd..0fce775`):** `assets/css/styles.css`, `assets/js/config.js`, `assets/js/i18n.js`, `assets/js/main.js`, `concierge-marketplace.html`, `index.html` y `specs/012-panel-acceso.md` (coinciden con la spec). Nota: `git diff main...HEAD` incluye además los 3 commits previos aún no mergeados a `main` (`b3a7efd`, `6595ce8`, `0a93fcd`), y `git status` muestra `M assets/css/tailwind.css` y `?? menu/` previos en el árbol de trabajo.
- **`npm run build`:** `Done in 259ms. Production files created in dist/.` (exit 0).
- **`npm run check`:** `Contracts built; public runtime prepared. Static project checks passed. All contact destinations are correctly configured.` (exit 0).
- **`npm run lint:catalog`:** 0 errores, 0 warnings (exit 0).
- **Eliminación de `footer-admin-link`:** 0 coincidencias en `index.html` y `concierge-marketplace.html`; `footer.admin` eliminado de `assets/js/i18n.js`.

### Corrección del hallazgo de revisión — 2026-11-03
- Se reemplazan las dos apariciones del selector móvil del antiguo `div` por `#mobile-header-actions #account-button`; se recuperan ancho completo, altura mínima de 44 px, espaciado, radio y texto blanco. No se cambia la lógica ni el contenido del panel.
- Playwright/Edge contra `dist/`, 390×844, ambas páginas, ES/EN y claro/oscuro: 8/8 PASS. El control mide 342×44 px, el color calculado es `rgb(255, 255, 255)` y texto/icono quedan dentro de sus límites, sin desbordamiento. Enter abre, Esc cierra y devuelve el foco al botón visible. Captura del menú móvil revisada visualmente.
- Regresión completa de la spec: 16/16 combinaciones PASS (1440/390 px, ambas páginas, ambos idiomas y temas), incluido teclado, foco, clic exterior y destino admin en la misma pestaña interceptado localmente.
- `npm run build`, `npm run check`, `npm run lint:catalog` y `git diff --check`: PASS. Se conserva byte por byte el cambio previo de `tailwind.css`; `menu/` permanece fuera del commit.
- Evidencia adicional fuera del repo: `%TEMP%/kuwago-012-review/` y `%TEMP%/kuwago-012-review-test.py`.
- Se conserva el veredicto original de Antigravity como historial; hallazgo corregido, pendiente de nueva revisión independiente. Estado: **en revisión**. Sin deploy ni push.

### Segunda revisión (`/revisar-diff 012`) — 2026-11-03

**Veredicto:** `OK`

- **Corrección verificada (`4ea4f30`):** `assets/css/styles.css:338,340` usa ahora `#mobile-header-actions #account-button`, restaurando `display: flex; justify-content: space-between; width: 100%; height: auto; min-height: 44px; padding: 10px 12px; border-radius: 12px; color: #fff;` en el menú móvil (`<= 1023px`) y eliminando el selector huérfano.
- **Archivos tocados en la rama (`0a93fcd..4ea4f30`):** `assets/css/styles.css`, `assets/js/config.js`, `assets/js/i18n.js`, `assets/js/main.js`, `concierge-marketplace.html`, `index.html` y `specs/012-panel-acceso.md` (solo los listados en la spec).
- **Verificación ejecutada:**
  - `npm run build` → `Done in 261ms. Production files created in dist/.` (exit 0).
  - `npm run check` → `Contracts built; public runtime prepared. Static project checks passed. All contact destinations are correctly configured.` (exit 0).
  - `npm run lint:catalog` → 0 errores, 0 warnings (exit 0).
  - `footer-admin-link` en `index.html` y `concierge-marketplace.html` → 0 coincidencias.
