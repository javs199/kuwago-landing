# Plantilla de proyecto para IA — Astro Gecko

Copia esta carpeta a la raíz de cada repo nuevo y rellena los `{{...}}` de `AGENTS.md`.

## Qué hay aquí
| Archivo | Para qué |
|---|---|
| `AGENTS.md` | Fuente única: stack, comandos, reglas, roles y **Estado actual**. Codex lo lee directo. |
| `CLAUDE.md` / `GEMINI.md` | Una línea `@AGENTS.md` (importa el archivo; no dupliques contenido). |
| `design/` | Referencia visual exportada de Stitch; cada spec de UI apunta a una pantalla de aquí. |
| `specs/_plantilla.md` | Plantilla de spec: objetivo, archivos que toca, restricciones, verificación. |
| `.claude/commands/` | `/nueva-spec`, `/revisar-diff`, `/cerrar-sesion` para Claude Code. |
| `.codex/prompts/` | Los mismos 3 para Codex. **Cópialos a `%USERPROFILE%\.codex\prompts\`** (Codex solo los lee ahí); se usan como `/prompts:nueva-spec`. |
| `.gemini/commands/` | Los mismos 3 para Gemini CLI (`/revisar-diff`, etc.), en formato `.toml`. |
| `.agent/workflows/` | Los mismos 3 como workflows de Antigravity (`/nueva-spec`, etc.). |

## Quién hace qué
| Herramienta (plan) | Papel en el ciclo | Por qué ahí |
|---|---|---|
| Claude Code (Pro) | Escribe las specs y hace lo delicado: Cloudflare, scripts, Affinity | Es el más fiable planeando, pero tiene la cuota más corta: no la gastes en cambios masivos |
| Codex (ChatGPT Plus) | Ejecutor principal de specs | Buena cuota para ejecutar y sigue bien una spec cerrada |
| Antigravity (Google) | Ejecutor de UI desde `design/` | Gasta cuota de Google, no de Claude/OpenAI; agente con navegador para comparar la pantalla |
| Antigravity IDE (Google AI Pro) | Revisor por defecto (`/revisar-diff`, workflow en `.agent/workflows/`) | Modelo distinto al que ejecutó, así detecta otros errores. Gemini CLI ya no acepta login de cuentas individuales (2026-11-03) |
| Gemini app | Deep Research y NotebookLM (contenido AGA, investigación de clientes) | Viene en tu plan y ya usas NotebookLM |
| ChatGPT app | Lluvia de ideas, copy, pensar en voz alta | Fuera del repo; lo útil se pasa a una spec |
| Grok (gratis) | Dudas rápidas y lo que pasa en X | Prescindible; no le des contexto de clientes |
| Stitch | Diseño de pantallas → `design/` | Paso 0 |
| Obsidian | Tus notas, ideas y memoria personal | El estado técnico NO va aquí: vive en `AGENTS.md` y `specs/` |

## Infraestructura ya pagada
| Servicio | Incluye (resumen) | Úsalo para |
|---|---|---|
| **Hostinger Business** (50 sitios) | Hosting compartido PHP/MySQL, WordPress, correo con dominio, backups, SSL. Apps Node.js [Probable, revisa tu panel] | WordPress del cliente, correo `@dominio`, sitios PHP, landings simples |
| **Cloudflare Workers Paid** (~5 USD/mes) | Workers, Pages, D1 (SQL), KV, R2 (archivos; cobra aparte al pasar el nivel gratis), Queues, Durable Objects, Cron. Access gratis hasta 50 usuarios [Probable] | Sitios estáticos y apps a medida, APIs, login privado, CDN y DNS de todos los dominios |

## Inicio de proyecto: ¿alcanza lo que tenemos?
Responde cada punto y anota el resultado en la sección **Infraestructura** del `AGENTS.md` del proyecto.

1. **¿Estático o con lógica?** Estático o SPA → Cloudflare Pages/Workers. Si el cliente necesita WordPress para editarlo él mismo → Hostinger.
2. **¿Backend / API?** → Workers. PHP heredado → Hostinger.
3. **¿Base de datos?** Relacional pequeña o mediana → D1. Clave-valor o caché → KV. WordPress → MySQL de Hostinger. Postgres grande o con mucha escritura → **se contrata** (Neon, Supabase).
4. **¿Archivos o medios?** → R2. Muchos GB o video → calcula el costo de R2 o usa Cloudflare Stream (**se contrata**).
5. **¿Login?** Equipo interno (menos de 50 personas) → Cloudflare Access. Usuarios finales del cliente → auth propia (Workers + D1) o un servicio externo (**se contrata**: Clerk, Auth0…).
6. **¿Correo?** Buzones `@dominio` → Hostinger. Envío transaccional (formularios, avisos) → **se contrata** (Resend, Postmark; tienen nivel gratis).
7. **¿Tráfico esperado?** Normal → cubierto. Más de ~10 M requests/mes o picos virales → revisa el uso de Workers y los límites de Hostinger.
8. **¿Pagos?** → Stripe o Mercado Pago (comisión por transacción, sin costo fijo).
9. **¿Quién paga lo extra?** Todo lo marcado como "se contrata" va cotizado al cliente en la propuesta.

## El ciclo (una sesión por tarea)
0. **Diseñar** — en Google Stitch. Exporta cada pantalla a `design/NN-pantalla/` (HTML/CSS + `captura.png`). Ver `design/LEEME.md`.
1. **Planear** — Claude Code en *plan mode*: `/nueva-spec <tarea>` → revisas y marcas la spec como "lista".
2. **Ejecutar** — sesión nueva en la herramienta indicada en "Ejecuta", rama `spec/NNN-slug`: "Implementa specs/NNN-....md".
3. **Revisar** — Antigravity, sesión nueva: `/revisar-diff NNN`. Solo diff contra spec. (Si ejecutó Antigravity, revisa Codex.)
4. **Corregir** — si hay "Cambios requeridos", vuelve al ejecutor con esa lista.
5. **Cerrar** — `/cerrar-sesion`: build, spec en "hecha", Estado actual de AGENTS.md, commit. Tú haces el merge y el deploy.

Reglas de oro: sin spec no se trabaja; una spec = una sesión = una rama; el deploy lo decides tú.
Notion solo para lo que ve el cliente; el estado técnico vive en `AGENTS.md` y `specs/`.

## Notas de compatibilidad
- `@AGENTS.md` como import: Claude Code y Gemini CLI lo soportan [Cierto]. Antigravity lee `GEMINI.md`/`AGENTS.md` [Probable]; si un día no carga el contexto, pega el contenido de AGENTS.md en GEMINI.md.
- Comandos de Gemini CLI: `.gemini/commands/*.toml` con `description` + `prompt` y `{{args}}` [Cierto].
- Ruta de workflows de Antigravity (`.agent/workflows/`) [Probable]: si no aparecen, créalos desde su panel de Customizations y pega el texto.
