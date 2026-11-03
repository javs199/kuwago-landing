# Spec 001 — Guía Carabao dentro del repo y del build (sin la contraseña Wi-Fi)

- **Estado:** borrador
- **Ejecuta:** Codex (cambio mecánico de build)
- **Revisa:** Gemini CLI
- **Diseño:** n/a (se copia la página ya publicada, sin cambios visuales)
- **Rama:** `spec/001-guia-carabao-en-build`

## Objetivo
Que https://grupokuwago.com/menu/ salga del propio `npm run build`, para que un deploy completo de la landing no pueda borrarla ni dejarla desfasada, y que su fuente quede versionada en Git **sin publicar en GitHub la contraseña del Wi-Fi** (el repo es público).

## Archivos que toca
- (Nuevos) `menu/index.html`, `menu/carabao-welcome.css`, `menu/img/**`, `menu/.htaccess` — copia de la versión publicada (paquete `release/kuwago-menu-20261027T231458-full.zip`), con el valor de la contraseña Wi-Fi sustituido por el marcador `{{WIFI_PASSWORD}}`. Si el nombre de la red o cualquier otro dato de acceso (códigos de puerta, cajas de llaves) aparece, recibe su propio marcador.
- (Nuevo) `menu/secrets.example.json` — claves de los marcadores con valores vacíos.
- `.gitignore` — ignorar `menu/secrets.json`.
- `scripts/build.mjs` — copiar `menu/` a `dist/menu/` y sustituir los marcadores con los valores de `menu/secrets.json` (archivo local que JV crea a mano, nunca en Git).
- `scripts/check.mjs` — fallar si `dist/menu/index.html` no existe, si le falta `noindex`, si queda algún `{{...}}` sin sustituir o si falta un recurso local.
- `docs/MENU-PUBLICATION.md` — anotar que la guía ya forma parte del build y cómo se configuran los secretos.

## Restricciones
- **Nunca** commitear la contraseña Wi-Fi ni otros datos de acceso. Antes de cada commit: `git diff --cached` no debe contener esos valores.
- No tocar: `index.html`, `concierge-marketplace.html`, `assets/**`, `apps/**`, `infra/**`, `packages/**`.
- No añadir dependencias.
- No enlazar la guía desde la landing ni añadirla a `sitemap.xml`; conservar meta robots y `X-Robots-Tag: noindex, nofollow, noarchive`.
- No incluir el PDF original ni ZIPs en `menu/`.
- No hacer deploy.

## Criterio de verificación
- [ ] `npm run build` termina sin errores con `menu/secrets.json` presente
- [ ] Sin `menu/secrets.json`, `npm run check` falla con un mensaje claro (no publica una guía con marcadores)
- [ ] `npm run check` pasa con los secretos y comprueba `dist/menu/`
- [ ] `dist/menu/index.html` es byte a byte igual al publicado (SHA-256 `8cbb9c33700b4a449468fcabbf9224619c2bde3b601e3e648b6384b436e138bf`)
- [ ] `git grep` del valor real de la contraseña en la rama = 0 resultados
- [ ] `npm run dev` sirve /menu/ con portada, CSS e imágenes cargando (0 recursos 404)
- [ ] `dist/sitemap.xml` no menciona /menu/

## Decisiones
- 2026-11-02: el repo es público (JV), por eso la contraseña va por marcador y archivo local ignorado.

## Resultado de la revisión
