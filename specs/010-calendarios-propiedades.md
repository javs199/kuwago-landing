# Spec 010 — Calendario de disponibilidad por propiedad

- **Estado:** borrador (fuente definida; falta elegir iCal o channel manager)
- **Ejecuta:** Codex (adaptador) + Antigravity (UI)
- **Revisa:** Antigravity revisa el adaptador (Codex); Codex revisa la UI (Antigravity)
- **Diseño:** {{pantalla de calendario en Stitch, aún no existe}}
- **Rama:** `spec/010-calendarios`

## Objetivo
Que el visitante vea fechas disponibles, ocupadas o sin confirmar de cada propiedad que se alquila, sin prometer disponibilidad que no viene de una fuente fiable.

## Archivos que toca
- `assets/js/main.js` (PROPERTY_DATA), `index.html` — punto de entrada por propiedad
- (Nuevos) adaptador de calendario y su prueba en `scripts/`
- Posible Worker para leer iCal si la fuente lo exige

## Restricciones
- Propiedades con calendario: Carabao Villa y Villa Maya. **Casa Cielo queda fuera** hasta que los dueños den luz verde (cliente, 2026-11-03).
- Fuente (cliente, 2026-11-03): reservas de **Airbnb** + reservas **directas** desde el sitio. Airbnb no tiene API abierta para anfitriones individuales [Probable]; opciones: (a) importar el iCal de Airbnb y exportar un iCal propio que Airbnb importe; (b) un channel manager con API (de pago). Decidir antes de pasar a "lista": {{iCal o channel manager}}.
- Riesgo de doble reserva: Airbnb refresca iCal cada pocas horas [Probable]. Mientras no haya channel manager, una reserva directa queda "pendiente de confirmar" hasta que JV o el cliente la bloquee en Airbnb.
- Las URLs iCal privadas no se ponen en el repo ni en el chat.
- Solo consulta: sin reservas ni cobros.
- Las propiedades sin alquiler no muestran calendario.

## Criterio de verificación
- [ ] `npm run build` y `npm run check` pasan
- [ ] Con la fuente caída, el calendario dice "sin confirmar", no "disponible"
- [ ] Móvil y escritorio, ES/EN, claro/oscuro

## Decisiones

## Resultado de la revisión
