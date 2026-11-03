# Spec 001 — Guía Carabao dentro del repo y del build

- **Estado:** borrador
- **Ejecuta:** Codex (cambio mecánico de build)
- **Revisa:** Gemini CLI
- **Diseño:** n/a (se copia la página ya publicada, sin cambios visuales)
- **Rama:** `spec/001-guia-carabao-en-build`

## Objetivo
Que https://grupokuwago.com/menu/ salga del propio `npm run build`, para que un deploy completo de la landing no pueda borrarla ni dejarla desfasada, y que su fuente quede versionada en Git.

## Archivos que toca
- (Nuevos) `menu/index.html`, `menu/carabao-welcome.css`, `menu/img/**`, `menu/.htaccess` — copia de la versión publicada (SHA-256 del HTML `8cbb9c33…`, paquete `release/kuwago-menu-20261027T231458-full.zip`), no de `../Menu/` si difieren.
- `scripts/build.mjs` — copiar `menu/` a `dist/menu/`.
- `scripts/check.mjs` — comprobar que `dist/menu/index.html` existe, tiene `noindex` y que sus recursos locales existen.
- `docs/MENU-PUBLICATION.md` — anotar que la guía ya forma parte del build.

## Restricciones
- No tocar: `index.html`, `concierge-marketplace.html`, `assets/**`, `apps/**`, `infra/**`, `packages/**`.
- No añadir dependencias.
- No enlazar la guía desde la landing ni añadirla a `sitemap.xml`; conservar meta robots y `X-Robots-Tag: noindex, nofollow, noarchive`.
- No incluir el PDF original ni ZIPs en `menu/`.
- La página contiene la contraseña Wi-Fi: el repo es {{público/privado}}; si es público, detenerse y preguntar antes de commitear.
- No hacer deploy.

## Criterio de verificación
- [ ] `npm run build` termina sin errores
- [ ] `npm run check` pasa e incluye la comprobación nueva de `dist/menu/`
- [ ] `dist/menu/index.html` es byte a byte igual al publicado (SHA-256 `8cbb9c33700b4a449468fcabbf9224619c2bde3b601e3e648b6384b436e138bf`)
- [ ] `npm run dev` sirve /menu/ con portada, CSS e imágenes cargando (0 recursos 404)
- [ ] `dist/sitemap.xml` no menciona /menu/

## Decisiones

## Resultado de la revisión
