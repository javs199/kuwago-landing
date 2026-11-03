# Spec 010 — Calendario de disponibilidad por propiedad

- **Estado:** borrador (bloqueada: falta la fuente de disponibilidad)
- **Ejecuta:** Codex (adaptador) + Antigravity (UI)
- **Revisa:** Gemini CLI
- **Diseño:** {{pantalla de calendario en Stitch, aún no existe}}
- **Rama:** `spec/010-calendarios`

## Objetivo
Que el visitante vea fechas disponibles, ocupadas o sin confirmar de cada propiedad que se alquila, sin prometer disponibilidad que no viene de una fuente fiable.

## Archivos que toca
- `assets/js/main.js` (PROPERTY_DATA), `index.html` — punto de entrada por propiedad
- (Nuevos) adaptador de calendario y su prueba en `scripts/`
- Posible Worker para leer iCal si la fuente lo exige

## Restricciones
- Propiedades con calendario según Notion (21/10): Carabao Villa, Villa Maya y **Casa Cielo**. Casa Cielo es una propiedad real que aún no está en la landing: el cliente la está terminando para publicarla en Airbnb (JV, 2026-11-02). Agregarla a la landing es otra spec, con fotos y textos del cliente.
- Fuente: {{Airbnb iCal / Booking / PMS / manual}}. Las URLs iCal privadas no se ponen en el repo ni en el chat.
- Solo consulta: sin reservas ni cobros.
- Las propiedades sin alquiler no muestran calendario.

## Criterio de verificación
- [ ] `npm run build` y `npm run check` pasan
- [ ] Con la fuente caída, el calendario dice "sin confirmar", no "disponible"
- [ ] Móvil y escritorio, ES/EN, claro/oscuro

## Decisiones

## Resultado de la revisión
