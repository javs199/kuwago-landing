---
description: Crea una spec nueva en specs/ a partir de la plantilla
---

Crea una spec nueva para esta tarea: (lo que escribí después del comando)

Pasos:
1. Lee `AGENTS.md` (stack, reglas, Estado actual) y lista `specs/` para obtener el siguiente número NNN (3 dígitos).
2. Explora el código SOLO lo necesario para saber qué archivos se tocarán. No edites código.
3. Copia `specs/_plantilla.md` a `specs/NNN-<slug>.md` y rellénala:
   - Objetivo en 1-3 frases, desde el usuario final.
   - Archivos que toca: lista concreta de rutas reales.
   - Restricciones: incluye lo que NO se debe tocar.
   - Criterio de verificación: comprobaciones observables, incluido el build.
   - Ejecuta: Codex para lógica y cambios mecánicos; Antigravity para UI a partir de `design/`; Claude Code solo si hay Cloudflare, scripts, Affinity o lógica delicada. Revisa: Gemini CLI.
4. Si la tarea toca UI, busca su pantalla en `design/` y ponla en el campo Diseño. Si no existe, detente y pídeme exportarla de Stitch.
5. Si la tarea es demasiado grande para una sesión, divídela en varias specs y dilo.
6. Muéstrame la spec y las dudas abiertas. No empieces a implementar.
