# Spec 003 — Nueva comparación de baseline D1 y decisión sobre la migración 0007 (DEV)

- **Estado:** borrador
- **Ejecuta:** Claude Code (Cloudflare + D1, delicado)
- **Revisa:** Antigravity (`/revisar-diff`)
- **Diseño:** n/a
- **Rama:** `spec/003-baseline-0007-dev`

## Objetivo
Desbloquear la gestión de servicios en el Admin DEV: decidir con evidencia si la migración 0007 puede aplicarse, después del NO-GO del 2026-10-27 (la tabla de auditoría pasó de 72 a 80 eventos tras el respaldo).

## Enfoque propuesto (del inventario de Codex, 2026-11-02)
El drift viene de que el middleware escribe `security.authorization` en `audit_events` incluso en lecturas. Secuencia: 1) autorizar un modo de mantenimiento DEV que corte el tráfico autenticado antes del middleware que audita; 2) nuevo respaldo completo con UUID propio, restauración y comparación de todas las tablas; 3) aplicar 0007 sobre esa baseline estable; 4) desplegar el candidato de servicios. Cada paso con su propia autorización.

## Archivos que toca
- `infra/cloudflare/dev/scripts/**` — solo si hace falta que la comparación ignore de forma explícita y acotada los eventos `security.authorization` posteriores al respaldo; cualquier relajación de la guarda se documenta y la aprueba JV.
- (Nuevo) `docs/D1-0007-BASELINE-RECOMPARISON.md` — resultado tabla por tabla y veredicto GO / NO-GO.
- `docs/DEV-SINGLE-OPERATOR-SERVICES.md` — enlazar el nuevo informe.

## Restricciones
- No tocar: `packages/database/migrations/0001–0006` ni `migrations.sha256.json` salvo para registrar 0007 como aplicada tras un GO ejecutado.
- Ninguna escritura en D1 remota sin respaldo nuevo verificado y autorización explícita de JV en ese momento.
- No `wrangler deploy` ni cambios en Access, R2, Images, DNS, Hostinger ni producción.
- No pedir ni guardar tokens/JWT en el chat ni en archivos del repo.

## Criterio de verificación
- [ ] `npm --prefix infra/cloudflare/dev test` y `run typecheck` pasan
- [ ] El informe compara las 32 tablas (no solo recuentos de servicios/categorías/imágenes)
- [ ] El veredicto indica qué diferencias se aceptan y por qué
- [ ] Si hay GO y JV lo autoriza: 0007 aplicada, 33 tablas, y un servicio de prueba creado y aprobado por super_admin en DEV

## Decisiones

## Resultado de la revisión
