# Kuwago DEV — Admin/API integrado y desplegado

Fecha: 2026-10-27. Alcance autorizado: integración y comprobación de acceso en DEV. Resultado: **PASS para acceso protegido y lectura administrativa real**. No habilita gestión comercial, multimedia ni producción.

## URLs y versión efectiva

- Panel: https://kuwago-admin-api-development.ch-jesus-99.workers.dev/#overview
- Servicios: https://kuwago-admin-api-development.ch-jesus-99.workers.dev/#services
- Sesión protegida: `/api/v1/session`.
- Catálogo administrativo protegido: `/api/v1/services`.
- Versión final: `327af77c-43fd-4b2a-8e11-7478a9ee4074`, creada `2026-10-27T21:56:10.129Z`, despliegue al 100% `21:56:10.889Z`.
- Hubo dos despliegues DEV autorizados: integración `920ebc72-0dc4-4d3a-a000-4ed6452c86a4` y ajuste de textos de entorno en la versión final. Ningún despliegue a otros recursos.

## Inventario comprobado antes de modificar Cloudflare

| Elemento | Existía remotamente | Acción/estado final |
|---|---|---|
| Worker `kuwago-admin-api-development` | Hello World, versión `1345e9a4-c6fe-4cba-85e5-6759f3128a04`, sin variables ni bindings | Reutilizado; gateway, API y assets React en el mismo Worker |
| Cuenta | `7a8bcd7992a3de359d2aff87df2fb693` | Misma cuenta; sesión OAuth Wrangler existente, sin login ni ampliación de permisos |
| D1 `kuwago-admin-db-development` | UUID `c5cfbe44-4fd0-4c2a-83c1-b833935534ba` | Binding `DB` efectivo confirmado con `wrangler versions view` |
| Esquema D1 | SELECT directo: 32 tablas de aplicación, 6 migraciones, 1 principal activo, 1 rol super_admin, 0 servicios | Sin migraciones ni cambios de esquema |
| R2 `kuwago-media-development` | 0 objetos, URL r2.dev deshabilitada, sin dominios personalizados | Binding privado `PRIVATE_MEDIA`; sin uploads ni cambios de exposición |
| Images | No existía binding en el Worker; prueba histórica PNG sintético documentada | Sin binding ni transformaciones en este despliegue; sin activación/facturación nueva |
| Access | App `742bd449-ad58-4032-bc11-d44ab9dee3ba`, política `052dcadb-258e-44b8-a219-1d1b20594468` | Conservados sin guardar cambios en el panel |
| Rutas | workers.dev activo; previews deshabilitadas; sin rutas/dominos personalizados | Conservado |
| Cron/Queues | Ninguno | Ninguno; publicación/reconciliación no habilitadas en este alcance |

La lista general D1 mostraba «0 tablas», pero la consulta SQL directa devolvió **32**. No se trató ese indicador agregado como estado de esquema; la comprobación directa resolvió la discrepancia antes del despliegue.

## Arquitectura y seguridad

`Access → gateway JWT → API interna JWT/RBAC/D1 → respuesta protegida`.

`src/development.ts` compone los handlers existentes dentro del Worker DEV. No crea otro Worker ni una URL alternativa de API. El gateway exige una sesión administrativa válida también antes de servir HTML, JS, CSS y fuentes. `assets.run_worker_first: true` impide que Static Assets evite el middleware. El frontend usa `/api/v1` con credenciales del mismo origen; no recibe tokens permanentes ni almacena JWT.

Se conservan RS256/JWKS, issuer/audiencia/vigencia, búsqueda de principal por issuer+subject, roles de D1, CSRF/origen, rechazo de rutas desconocidas, CSP y no-store. `MUTATIONS_ENABLED=false` queda además forzado en el handler de integración, aunque se cambiase accidentalmente la variable. Los permisos de la sesión son los reales de D1; el aviso distingue esos permisos de las funciones deshabilitadas por este despliegue.

**El modo de comprobación deshabilita mutaciones de contenido, no la auditoría de seguridad:** el middleware existente registra autorizaciones en `audit_events`, incluso en solicitudes GET de usuarios registrados. Las pruebas de acceso provocaron esos eventos previstos. No se crearon usuarios, servicios, categorías ni imágenes.

## Comprobaciones remotas

- Access protege **todo el tráfico**, incluyendo URL principal y previews; previews siguen apagadas. Reconfirmado después del primer despliegue y configuración de la versión final sin ampliaciones de rutas.
- Política Allow: incluir únicamente `ch.jesus.99@gmail.com`, requerir Google. MFA de aplicación: autenticador, vigencia 6 h; sesión de aplicación 6 h; política hereda la aplicación. La configuración global sin MFA no anula este requisito específico.
- AUD confirmado `dd73f3792def5ce94841273f79026f08e326c98d6fd98925ba0551196bb16adc`; issuer/JWKS `https://blue-bread-0e64.cloudflareaccess.com` y `/cdn-cgi/access/certs`.
- Evaluador remoto de política existente: **1 usuario permitido, 3 bloqueados**. Es evaluación contra identidades conocidas por Cloudflare; no equivale a iniciar una nueva sesión Google con cada usuario rechazado.
- Seis solicitudes HTTP anónimas a HTML, sesión, servicios, bundle, ruta local de test y catálogo público: **302 a Access**, sin devolver contenido administrativo. Cuatro comprobaciones dirigidas posteriores sobre HTML, sesión, servicios y el bundle final repitieron ese resultado. Evidencia no incluye parámetros de redirección de autenticación.
- Jesús completó personalmente Google/MFA. Panel final cargado, rol **super_admin** y permisos reales visibles.
- Navegación autenticada a `/api/v1/session`: JSON con el principal `access:b329a52cf0fdf888743364ca9b3ff5a753aceb6fdd1d2937951e6c43c6e0dcfd`, rol super_admin y permisos. Coincide con el bootstrap aprobado; no se dedujo el rol del correo.
- Navegación autenticada a `/api/v1/services`: JSON exacto `{"items":[],"nextCursor":null}`. El panel Servicios muestra «No hay servicios en D1 DEV»; lectura administrativa real confirmada, sin fallback demostrativo.
- `/__local-test` autenticado: `not_found`. No se desplegó harness, login de prueba ni Worker público del catálogo.
- Consola del panel: sin warnings/errores observados. Se conservó el idioma ES y tema claro de la revisión del usuario.
- `wrangler versions view` confirmó bindings efectivos **DB al UUID correcto, PRIVATE_MEDIA al bucket existente, ASSETS** y variables esperadas. Compatibilidad `2026-10-24`, igual al Worker previo. Sin Images, service binding remoto ni Cron.

## Cambios locales de esta tarea

Nuevos:
- `infra/cloudflare/dev/src/development.ts`: composición gateway/API, mutaciones forzadas a false.
- `infra/cloudflare/dev/wrangler.development.json`: destino DEV fijo, recursos existentes, assets protegidos.
- `infra/cloudflare/dev/test/development.test.mjs`: integración combinada y configuración aislada.
- `apps/admin/src/deployment.ts`: identificación visual del despliegue DEV.
- Este informe.

Modificados:
- `infra/cloudflare/dev/scripts/build.mjs`: incluir entry point development.
- `apps/admin/src/components/AdminShell.tsx`, `src/features/services/api-copy.ts`, `src/preferences.tsx`: avisos ES/EN precisos de entorno, título y estado de Access, conservando diseño y comportamiento local por defecto.

Los cambios previos de Git se conservaron. Los archivos de la landing no se editaron en esta tarea.

## Validaciones locales

| Comprobación | Resultado |
|---|---|
| Backend TypeScript y build | PASS |
| Pruebas de gateway + nuevo entry point | **16/16 PASS** |
| Admin TypeScript/build final | PASS |
| Lint backend de archivos cambiados y lint Admin | PASS; cambios finales de textos nuevamente comprobados |
| Admin Vitest | **31/31 PASS** |
| Gateway E2E con build React real, claves sintéticas y D1/R2 locales | **13/13 PASS**, sin errores JS/CSP; 0 operaciones remotas |
| Aislamiento de build landing/Admin | PASS |
| Wrangler dry-run | PASS, assets y bindings correctos |

El primer test nuevo esperaba 503 para una operación bloqueada; el contrato existente devuelve 501 `operation_not_enabled`. Se corrigió la expectativa, sin modificar ni relajar el gate. Las suites no se repitieron globalmente. Los textos finales posteriores al E2E se validaron con build/lint y navegador DEV real; no se repitió ese recorrido de escritura local por cambios exclusivamente de copy.

Evidencia local sin secretos en `infra/cloudflare/dev/.wrangler/dev-integration/`: `preflight.json`, `source-hashes.json`, `final-source-hashes.json`, `anonymous.json`, `admin-dev.png`; resultados E2E en `.wrangler/gateway-e2e/report.json`. No contienen JWT, cookies ni tokens. Las credenciales de navegador permanecen bajo control del usuario; no fueron extraídas. No se abrió otra captura privada ni se creó una credencial.

## Operación, límites y pendientes

- **GO:** revisar el Admin protegido y leer catálogo DEV con el Super Admin existente.
- **Pendiente:** habilitar edición de contenido mediante autorización específica; las acciones mutantes actualmente devuelven 501. Los enlaces de edición existentes pueden mostrar su formulario, pero no guardan remotamente en este alcance.
- **Pendiente:** Images y multimedia, pruebas adicionales de formatos/carga, reconciliador/Cron y entrega pública; sin cambios en reglas de aprobación independiente comercial/multimedia.
- **Pendiente:** botón de cierre de sesión del shell (preexistente, deshabilitado); la sesión real la administra Cloudflare Access. No se presentó como logout funcional.
- Rutas públicas del catálogo y Hostinger no están conectadas. Este Worker no sirve la landing ni tiene rutas hacia producción.
- No se ejecutaron nuevas migraciones, exportaciones, restauraciones, bootstrap, publicaciones de servicios, cambios de Access/DNS/Hostinger, commit ni push.
- El respaldo completo disponible es **pre-bootstrap etapa 6**; no se afirma que respalde los eventos actuales. No se necesitó ni se ejecutó otro export para desplegar código/activos sin cambios de esquema.
- Rollback de código preparado conceptualmente: versión anterior Hello World `1345e9a4-c6fe-4cba-85e5-6759f3128a04`; debe ser una operación explícita, manteniendo Access y sin restaurar D1. **No ejecutado**.

Compilación reproducible del frontend para este destino: PowerShell `$env:VITE_DEPLOYMENT_TARGET='cloudflare-development'; npm --prefix apps/admin run build`. Despliegue desde `infra/cloudflare/dev`: `node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.development.json`. No ejecutar por rutina: requiere autorización de despliegue para futuras tareas.

Referencia oficial de la protección de assets: https://developers.cloudflare.com/workers/static-assets/binding/ (`run_worker_first`).
