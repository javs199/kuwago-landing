# Spec 009 — Plan de paso a producción del Admin y la API

- **Estado:** borrador (planificación; no implementa)
- **Ejecuta:** Claude Code
- **Revisa:** Antigravity (`/revisar-diff`)
- **Diseño:** n/a
- **Rama:** `spec/009-plan-produccion-admin`

## Objetivo
Tener un plan aprobado para llevar el Admin y la API a producción, con costos, dominios, monitoreo y recuperación definidos, antes de crear un solo recurso.

## Archivos que toca
- (Nuevo) `docs/PRODUCTION-PLAN.md`
- `infra/cloudflare/environments.example.json` — solo si cambia la propuesta

## Restricciones
- No crear recursos de Cloudflare, ni DNS, ni deploy.
- Debe responder: dominios (`admin.` / `api.grupokuwago.com`) y si el DNS pasa a Cloudflare; D1/R2/Images de producción y costo mensual estimado; quién paga; alertas y presupuestos; respaldo y restauración remota de extremo a extremo; política de operador único frente a revisión independiente.

## Criterio de verificación
- [ ] El documento lista cada recurso, su costo y su responsable
- [ ] Incluye criterios GO/NO-GO y orden de autorizaciones
- [ ] JV lo aprueba por escrito

## Decisiones

## Resultado de la revisión
