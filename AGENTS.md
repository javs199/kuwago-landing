# AGENTS.md — Grupo Kuwago (landing + admin)

> Fuente única de contexto para cualquier agente (Claude Code, Codex, Antigravity/Gemini).
> CLAUDE.md y GEMINI.md solo importan este archivo. Si algo cambia, se cambia AQUÍ.
> Lo que sigue entre `{{...}}` está pendiente de confirmar con JV o con el cliente.

## Proyecto
- **Cliente / marca:** Grupo Kuwago (agencia Astro Gecko)
- **Qué es:** landing pública bilingüe (ES/EN) e instalable (PWA) de Grupo Kuwago, con galerías de 4 propiedades (Carabao Villa 29 fotos, Villa Maya 113, Casa Bella Mía 88, Casa Heliconia 40; datos en `assets/js/main.js` e `inventory.json`), una página Concierge/Marketplace de vista previa y un portal Admin (React) con backend Cloudflare que por ahora solo existe en DEV.
- **URL producción:** https://grupokuwago.com/ (landing) · https://grupokuwago.com/menu/ (guía Carabao **temporal** para un cliente, publicada aparte, `noindex`, sin autenticación; se retira con la spec 011)
- **URL staging / DEV:** https://kuwago-admin-api-development.ch-jesus-99.workers.dev/ (Admin + API DEV, detrás de Cloudflare Access). La landing no tiene staging.
- **Repo:** https://github.com/javs199/kuwago-landing (rama única `main`)
- **Seguimiento con el cliente (Notion):** https://app.notion.com/p/40d8625cf846811393b4ee5f21de57ec — estado comercial, pagos, material y bitácora. El estado técnico vive aquí y en `specs/`.
- **Carpeta de trabajo local:** `C:\Users\JV\Desktop\Kuwago Landing\` contiene este repo (`grupo-kuwago-landing-source/`) y material FUERA de Git: `Menu/` (fuente de la guía Carabao), `Admin Portal/` y `Marketplace/` (exports de Stitch), `KUWAGO-Brandkit-2026/`, `logokuwago/`, `Tipografias/`, fotos y capturas de revisión.

## Stack
- **Landing (raíz):** HTML estático (`index.html`, `concierge-marketplace.html`) + JS vanilla (`assets/js/`: i18n, tema claro/oscuro, loader, PWA, footer, marketplace) + Tailwind CSS 3.4.19 compilado localmente. Sin runtime Node en producción.
- **Admin (`apps/admin/`):** React + TypeScript estricto + Vite + Tailwind 4, dependencias y lockfile propios (no hay workspaces).
- **Contratos (`packages/contracts/`):** TypeScript compartido entre admin, API y landing (`assets/js/contracts/` se genera, no se edita).
- **Backend / edge (`infra/cloudflare/dev/`):** un Worker DEV (`kuwago-admin-api-development`) = gateway JWT + API + assets del Admin. Wrangler 4.152.0 local (no global).
- **Datos:** D1 `kuwago-admin-db-development` (6 migraciones aplicadas; la 0007 está preparada y NO aplicada), R2 privado `kuwago-media-development` (vacío), Cloudflare Images (solo pruebas). Migraciones en `packages/database/migrations/` con hashes en `migrations.sha256.json`.
- **Auth:** Cloudflare Access (JWT) + RBAC propio en la API. Landing sin auth.
- **Node:** 26.1.0 (instalada y fijada por el ejecutor seguro D1 junto a Wrangler 4.152.0; Admin admite ^22.22.2 || ^24.15.0 || >=26, infra >=22) · npm 11.13.0 · sin workspaces: 4 `package.json` independientes (raíz, `apps/admin`, `packages/contracts`, `infra/cloudflare/dev`). Backend y `lint:catalog` reutilizan TypeScript/ESLint instalados en `apps/admin`.
- **Versiones clave:** React 19.3.1 · Vite 8.3.5 · TypeScript 5.9.3 · Tailwind 4.3.3 (admin) / 3.4.19 (landing) · Vitest 5.0.5 · jose 6.2.13 · Miniflare 5.20261019.2-beta · sharp 0.35.5.

## Comandos
| Acción | Comando |
|---|---|
| Instalar landing | `npm ci` |
| Instalar admin y backend | `npm --prefix packages/contracts ci` · `npm --prefix apps/admin ci` · `npm --prefix infra/cloudflare/dev ci` · `npm --prefix packages/contracts run build` |
| Desarrollo landing | `npm run dev` → http://127.0.0.1:4173 (regenera contratos antes) |
| Desarrollo admin | `npm --prefix apps/admin run dev` → http://127.0.0.1:5175 (solo loopback; proxy `/api` a 127.0.0.1:8794) |
| Desarrollo API local | `npm --prefix infra/cloudflare/dev run dev` (127.0.0.1:8790) · `run dev:stack` · `run dev:admin-test` (harness JWT sintético) · `run migrate:local` |
| Build landing | `npm run build` → `dist/` (compila Tailwind y versiona CSS/JS con SHA-256) |
| Build admin | `npm --prefix apps/admin run build` → `apps/admin/dist/` |
| Verificación landing | `npm run check` · `npm run test:assets` · `npm run test:loader` · `npm run test:pwa` · `npm run test:catalog` · `npm run test:contracts` |
| Verificación admin | `npm --prefix apps/admin run typecheck` · `run lint` · `test` · `run verify:isolation` · `run test:e2e:local` |
| Verificación backend | `npm --prefix infra/cloudflare/dev run typecheck` · `run lint` · `run build` · `test` · `run validate:config` · `run validate:gateway` · `run test:e2e:gateway` (requiere `KUWAGO_PLAYWRIGHT_MODULE`) |
| Lint | `npm run lint:catalog` (landing) · `npm --prefix apps/admin run lint` |
| CSS tras cambiar clases | `npm run css` |
| Deploy landing | `npm run build` + `check` → ZIP versionado de `dist/` (con `.htaccess`) en `release/` → respaldo del alojamiento → subida y extracción en `public_html` por File Manager de Hostinger → verificación HTTPS/hashes/ES-EN/temas → registro `release/*-deploy.json`. Sin CI/CD. **Solo con permiso explícito; un push no autoriza deploy.** |
| Deploy admin DEV | 1) `$env:VITE_DEPLOYMENT_TARGET='cloudflare-development'; npm --prefix apps/admin run build; Remove-Item Env:VITE_DEPLOYMENT_TARGET` 2) desde `infra/cloudflare/dev`: `node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.development.json`. **Solo con permiso explícito.** No desplegar `wrangler.services-development.candidate.json` (bloqueado hasta respaldo vigente + 0007). |
| Respaldo/recuperación D1 | Local: `npm --prefix infra/cloudflare/dev run backup:proof` · `recovery:backup` · `recovery:restore` · `recovery:verify`. Remoto: `scripts/backup-once-private.ps1 -BackupProfile current-admin` solo con permiso de operación; custodia en `%LOCALAPPDATA%\Kuwago\D1Backups\development`. |

## Estructura
```
index.html, concierge-marketplace.html   páginas públicas
assets/css, assets/js, assets/fonts, assets/images   estáticos de la landing
styles/tailwind.input.css, tailwind.config.cjs        entrada y tokens de Tailwind
scripts/        build, check, serve, tests de la landing (node --test)
apps/admin/     portal administrativo React
packages/contracts/   contratos TS compartidos
packages/database/    migraciones D1 y sus hashes
infra/cloudflare/     ejemplos (no desplegables) y dev/ (Worker DEV real, scripts D1, backups)
docs/           informes de cada fase (DESIGN.md, BRAND-WEB.md, DEPLOYMENT-V1.md, MENU-PUBLICATION.md, PHASE-*, D1-*, DEV-*)
preview/        evaluación tipográfica local; NO se publica
dist/, release/ salida de build y paquetes/evidencias de deploy (ignorados por Git)
design/         referencia visual exportada de Google Stitch (ver design/LEEME.md) — aún vacía
specs/          una spec por tarea (ver specs/_plantilla.md)
```

## Infraestructura
- **Hosting / runtime:** Hostinger Business para la landing (estática). Cloudflare Workers solo para Admin/API en DEV; producción del Admin no existe.
- **Datos:** D1 + R2 + Images en DEV. La landing no usa base de datos.
- **Correo del cliente:** buzón Hostinger `nahomysoraca@grupokuwago.com` (plan Starter: 1 buzón de 5 GB + 5 alias, pagado hasta 09/2028); alias pedidos: `katherinesandi@`, `facturas@` [Probable]; envío/recepción por alias sin probar. MX/SPF/DKIM/DMARC sin revisar. La landing enlaza aún a `grupokuwago@gmail.com` y WhatsApp `+506 8988 3466` {{¿contactos definitivos?}}.
- **Dominio y DNS:** `grupokuwago.com` con nameservers de Hostinger; no se movió a Cloudflare. {{¿se migrará el DNS a Cloudflare?}}
- **Contratación extra:** ninguna por ahora. Images y R2 pueden generar costo al salir del nivel gratis; {{quién lo paga}}.

Infra de la agencia ya pagada: Hostinger Business (50 sitios) y Cloudflare Workers Paid. No propongas servicios de pago fuera de ellos sin decirlo explícitamente.

## Marca del cliente
- **Colores (tokens en `tailwind.config.cjs`, origen `docs/DESIGN.md`):** morado `primary #200037` / `primary-container #3b0c5b`; dorado `secondary #775a1a`, `bright-gold #D1AD66`, `dark-gold #8F691F`; fondos claros `surface #fff7fc`, `warm-off-white #F8F6FA`; oscuro `dark-bg #160B1D`, `dark-surface #24172C`.
- **Tipografías:** Hanken Grotesk (texto/UI; en la landing vía Google Fonts, en el admin alojada local); Libre Bodoni Regular/Bold para la palabra KUWAGO (local, OFL, `assets/fonts/libre-bodoni`). TT Ramillas es Trial: prohibido en páginas públicas. Tipografía web definitiva: {{pendiente de licencia/decisión}}.
- **Logos:** isotipo e imagotipos morado/dorado en `assets/images/brand/` (copias de `KUWAGO-Brandkit-2026/`, fuera del repo). Temas claro y oscuro obligatorios.
- **Idiomas:** español e inglés en toda pantalla pública y del admin.
- **Tono / copy:** {{guía de voz del cliente}}.

## Diseño
- La **referencia visual es `design/`**: pantallas exportadas de Google Stitch (HTML/CSS + captura PNG por pantalla). Hoy está vacía; los exports existentes están en `../Admin Portal/stitch_kuwago/`, `../Marketplace/stitch_kuwago/` y `docs/reference/`.
- El HTML de Stitch es **referencia, no código de producción**: replica layout, espaciado y jerarquía con el stack y los tokens del proyecto; no lo copies tal cual ni importes su Tailwind si el proyecto no lo usa.
- Si Stitch y la marca chocan (fuentes, colores), manda la marca y se anota en "Decisiones" de la spec.

## Reglas para agentes
1. **Una sesión = una spec.** No trabajes sin una spec en `specs/`. Si no existe, pídela o créala con el comando `nueva-spec`.
2. **Toca solo los archivos listados en la spec.** Si necesitas otro, detente y dilo.
3. **No hagas deploy, no borres ramas, no toques secretos** (`.env`, `.dev.vars`, `wrangler*.json` con IDs reales, tokens, JWT, claves de recuperación, backups en `%LOCALAPPDATA%\Kuwago\`).
4. **Antes de terminar**, corre el build y la verificación de la spec y pega el resultado.
5. Commits pequeños, formato `tipo: descripción` (`feat`, `fix`, `docs`, `refactor`, `chore`). En español (decidido por JV el 2026-11-02; el historial anterior está en inglés y no se reescribe). Informes técnicos en `docs/` en español, con prefijo `PHASE-*`, `D1-*` o `DEV-*` y secciones de alcance, evidencia, GO/NO-GO, pruebas y límites.
6. Trabaja en una rama `spec/NNN-nombre`, nunca directo en `main`.
7. Identidad visual: la **del cliente**, no la de Astro Gecko. Tokens en `tailwind.config.cjs` (landing) y en los tokens semánticos de `apps/admin/src` (admin).
8. Toda spec de UI referencia su pantalla en `design/`. Sin pantalla, no se implementa UI nueva.
9. Si algo es ambiguo, elige la lectura más probable y anótala en la spec bajo "Decisiones".
10. **D1 remota:** ninguna escritura ni migración sin respaldo completo vigente y restaurable y autorización explícita por operación (lectura, credencial, export, migración, bootstrap y deploy se autorizan por separado). Destino fijo: D1 `c5cfbe44-4fd0-4c2a-83c1-b833935534ba`. Ante una respuesta ambigua, parar y reconciliar por lectura: nunca reintentar. No edites migraciones aplicadas (0001–0006) ni sus hashes. Un ID de D1 recordado de memoria nunca sustituye al de `scripts/safe-d1/policy.mjs` (el 2026-11-02 la cuenta tenía una sola D1: esta).
11. **Deploy de la landing:** subir solo el contenido de `dist/`; nunca el repo, `preview/`, `release/` ni material de marca. **Conservar `public_html/menu`** (no está en el build) hasta que se ejecute la spec 011.
12. Landing y admin están aislados: no mezcles dependencias ni salidas (`verify:isolation` lo comprueba).

## Roles de herramientas
| Herramienta | Hace | No hace |
|---|---|---|
| Claude Code | Escribe las specs (plan mode) y hace lo delicado: lógica, Cloudflare, scripts, Affinity | Cambios masivos (su cuota es la más escasa) |
| Codex | **Ejecutor principal** de specs de lógica y cambios mecánicos | Deploy, decisiones de arquitectura |
| Antigravity | **Ejecutor de UI**: convierte pantallas de `design/` (Stitch) en código | Lógica de negocio, Cloudflare |
| Antigravity como revisor | **Revisor por defecto** del diff contra la spec (`.agent/workflows/revisar-diff.md`, modelo Gemini) | Escribir código en la misma sesión en que revisa |
| Gemini CLI | No se usa: Google cerró el login de cuentas individuales (2026-11-03) | — |

Regla de revisión: revisa Antigravity en una sesión nueva. Si Antigravity fue quien ejecutó (UI), revisa Codex.

## Estado actual
<!-- Lo actualiza el comando cerrar-sesion. Máx. 10 líneas. Lo más reciente arriba. -->
- **Última actualización:** 2026-11-03
- **Hecho:** landing V1.1 en producción (galerías, ES/EN, temas, PWA, redes, Concierge/Marketplace de vista previa); guía Carabao en /menu/; Admin + API DEV desplegados con Access (Google + MFA) y solo lectura (`MUTATIONS_ENABLED=false`); primer Super Admin (JV) creado en D1 DEV. Sistema IA mergeado en main (PR #1, `99c39aa`).
- **En curso:** gestión de servicios en DEV (migración 0007 y autoaprobación super_admin preparadas en local).
- **Siguiente:** spec 004 (design desde Stitch) → 003 → 006 → 007. 001 y 002 canceladas (la guía /menu/ es temporal). 010 espera elegir iCal o channel manager. 011 al terminar el sitio.
- **Bloqueos / decisiones pendientes:** 0007 en NO-GO (la auditoría D1 cambió tras el respaldo; requiere nueva comparación completa). Marketplace con precios/proveedores sin confirmar. Guía /menu/ expone código de puerta y Wi-Fi sin autenticación (aceptado por JV como temporal). Casa Cielo en espera de los dueños. 7 avisos de npm audit en Tailwind 3 (solo build).
