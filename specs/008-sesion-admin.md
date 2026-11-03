# Spec 008 — Sesión del Admin: entrada, cierre y pantalla de login

- **Estado:** borrador (decisión de JV pendiente)
- **Ejecuta:** Antigravity (UI) + Claude Code (Access)
- **Revisa:** Codex la parte UI (la hizo Antigravity); Antigravity la parte Access
- **Diseño:** `design/10-admin-login-*/` (spec 004; 4 variantes de Stitch)
- **Rama:** `spec/008-sesion-admin`

## Objetivo
Que el operador entienda dónde entra y cómo sale del Admin. Hoy la autenticación es solo de Cloudflare Access, el botón de logout está deshabilitado y las 4 pantallas de login de Stitch no se usan.

## Archivos que toca
- `apps/admin/src/components/AdminShell.tsx` — habilitar el cierre de sesión (logout de Access)
- (Nuevo) pantalla de entrada o de bienvenida, según la decisión
- `apps/admin/src/i18n.ts` — textos ES/EN

## Restricciones
- No crear contraseñas ni auth propia: la identidad sigue siendo Access (issuer + subject).
- {{Decisión de JV: (a) personalizar la página de login de Access con la marca, o (b) pantalla propia que solo redirige a Access}}.
- No tocar el gateway JWT ni RBAC.

## Criterio de verificación
- [ ] `npm --prefix apps/admin run typecheck`, `lint`, `test` y `build` pasan
- [ ] El logout cierra la sesión de Access y una nueva visita pide login otra vez
- [ ] La UI coincide con `design/10-admin-login-*/captura.png` en móvil y escritorio, claro/oscuro

## Decisiones

## Resultado de la revisión
