# Spec 006 — Recorrido real de servicios en el Admin DEV

- **Estado:** borrador (depende de la spec 003)
- **Ejecuta:** Claude Code (Cloudflare + D1, delicado)
- **Revisa:** Antigravity (`/revisar-diff`)
- **Diseño:** pantallas actuales de Services en `apps/admin` (extensión del sistema 1A, sin export Stitch propio)
- **Rama:** `spec/006-recorrido-servicios-dev`

## Objetivo
Que JV, como super_admin, cree un servicio de prueba en DEV con foto y textos ES/EN, lo autoapruebe de forma explícita, lo publique y lo retire, y que cada paso quede auditado.

## Archivos que toca
- `infra/cloudflare/dev/wrangler.services-development.candidate.json` → se convierte en config DEV activa (Images, PUBLICATION, Cron de reconciliación)
- `infra/cloudflare/dev/src/**` — solo correcciones que salgan del recorrido
- (Nuevo) `docs/DEV-SERVICES-WALKTHROUGH.md` — evidencia del recorrido

## Restricciones
- Requiere 0007 aplicada (spec 003) y un respaldo vigente.
- Usar solo la PNG sintética de 64×64 ya autorizada; sin fotos reales del cliente ni precios comerciales.
- Deploy DEV solo con permiso explícito; nada de producción, Hostinger ni DNS.
- PUBLICATION comparte temporalmente el R2 privado: no exponer ningún endpoint público.

## Criterio de verificación
- [ ] `npm --prefix infra/cloudflare/dev run build` y `test` pasan
- [ ] Borrador → imagen procesada → aprobación `super_admin_self` → publicado → retirado, con un 202 resuelto en cada transición
- [ ] `audit_events` registra `service.super_admin_self_approved` y `media.super_admin_self_approved`
- [ ] Un rol editor no puede autoaprobar (prueba negativa)
- [ ] Al terminar, D1 queda sin servicios activos o el de prueba archivado

## Decisiones

## Resultado de la revisión
