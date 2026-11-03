# Spec NNN — {{título corto}}

- **Estado:** borrador | lista | en curso | en revisión | hecha
- **Ejecuta:** Codex (lógica/mecánico) | Antigravity (UI desde design/) | Claude Code (delicado)
- **Revisa:** Gemini CLI
- **Diseño:** `design/{{NN-pantalla}}/` (obligatorio si toca UI; "n/a" si no)
- **Rama:** `spec/NNN-{{slug}}`

## Objetivo
{{Qué debe quedar funcionando, en 1-3 frases, desde el punto de vista del usuario final.}}

## Archivos que toca
- `{{ruta/archivo}}` — {{qué cambia}}
- (Nuevos) `{{ruta/archivo}}` — {{para qué}}

## Restricciones
- No tocar: {{archivos o zonas prohibidas}}
- No añadir dependencias salvo: {{lista o "ninguna"}}
- {{rendimiento, accesibilidad, compatibilidad, estilo de marca…}}

## Criterio de verificación
- [ ] `{{npm run build}}` termina sin errores
- [ ] {{comprobación concreta y observable, p. ej. "en /cursos aparecen 10 rutas"}}
- [ ] La UI coincide con `design/{{NN-pantalla}}/captura.png` (layout, jerarquía, espaciado)
- [ ] {{comprobación en móvil / modo oscuro / etc.}}

## Decisiones
<!-- El agente anota aquí lo que interpretó o eligió, con una línea de motivo. -->

## Resultado de la revisión
<!-- La herramienta revisora pega aquí su veredicto: OK / Cambios requeridos + lista. -->
