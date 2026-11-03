# Cloudflare — ejemplos locales de Fase 2A

Estado: PROPUESTA NO DESPLEGABLE. No se han creado recursos ni código de Workers.
Los nombres son propuestas; los IDs contienen marcadores deliberadamente inválidos.
Los valores vacíos de Access NO constituyen una configuración válida.

## Archivos

- environments.example.json: inventario esperado por ambiente, sin IDs reales.
- wrangler.catalog.example.json: catálogo publicado, sin acceso a D1 ni imágenes privadas.
- wrangler.admin-web.example.json: futuro Worker que protegerá y servirá el React existente.
- wrangler.admin-api.example.json: API interna, D1 privado y buckets del mismo ambiente.
- security-policy.example.json: límites y retención propuestos; NO aplicados.
- .dev.vars.example: metadatos vacíos/no sensibles; sin tokens ni contraseñas.

No se creó wrangler.json/jsonc/toml activo. No hay main, assets o migraciones
utilizables. No copiar las plantillas a una configuración activa ni sustituir
marcadores sin pasar la revisión de Fase 2B.

Cada plantilla contiene env.development, env.staging y env.production con bindings
y vars explícitos. El nivel superior queda deshabilitado y sin recursos. workers_dev
y preview_urls son false; routes está vacío. Sin cron ni source maps públicos.

remote:false afecta al modo de desarrollo, NO hace local un futuro deploy.
MUTATIONS_ENABLED/REQUIRE_ACCESS_JWT son requisitos de código futuro: por sí solos
no implementan seguridad. Wrangler no se instaló ni ejecutó. Solo se comprueban
JSON e invariantes, no compatibilidad con un Wrangler instalado.

Admin web debe ejecutar el Worker ANTES de todos los assets, verificar JWT y luego
servir ASSETS o reenviar /api/v1/* por ADMIN_API. La API revalida JWT y roles; no
hay propagación implícita de identidad. La AUD Admin se comparte solo en esa cadena
de la misma aplicación/entorno, nunca entre entornos o con catálogo no productivo.

Los hostnames son propuestas de DNS. Ninguno se registra desde estos archivos.
Todos los buckets serán privados a nivel R2, incluido publication; este contiene
únicamente copias aprobadas servidas por el Worker público. Backups no tiene binding
en los Workers de aplicación.

Informe: docs/PHASE-2A-CLOUDFLARE.md en la raíz.
Procedimiento: docs/PHASE-2B-RUNBOOK.md en la raíz.
No ejecutar comandos remotos como parte de esta entrega.
