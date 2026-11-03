# Fase 2C.1 — Gateway protegido del Portal Admin

24/10/2026 · America/Costa_Rica · Implementación y validación exclusivamente locales.

**GO para el gateway local. NO-GO todavía para desplegar el sistema DEV completo.** Se cierra la falta de gateway señalada en 2C.0 a nivel de implementación local, sin acreditar políticas reales de Access, privacidad remota, bootstrap, recuperación remota ni habilitación multimedia.

Resultado final: **275 comprobaciones** —166 backend, 31 Admin, 49 contratos/público, 16 E2E existentes y 13 E2E del gateway— correctas. El contador Node incluye contenedores como las fases anteriores; las 14 comprobaciones específicas del archivo gateway están incluidas en las 166, no se suman otra vez. TypeScript, lint, builds, cinco dry-runs Wrangler y aislamiento correctos.

## 1. Arquitectura implementada

```text
Navegador → Access en el edge (requisito del despliegue futuro)
          → Gateway Worker
              ├─ validar origen canónico + JWT RS256/JWKS
              ├─ HTML/assets → API /session → principal habilitado + admin:read
              │             → binding ASSETS → respuesta protegida
              └─ /api/v1/* → CSRF/origen + headers permitidos
                            → Service Binding ADMIN_API
                            → segunda verificación JWT + RBAC + D1
                            → catálogo / previews privados autorizados

Worker público → PUBLICATION + CATALOG_BARRIER
                sin rutas administrativas ni acceso al gateway/PRIVATE_MEDIA
```

El Admin y la API utilizan el mismo origen HTTPS, definido por `ADMIN_ORIGIN`. No se publica una URL API distinta al navegador ni se abre CORS administrativo. El cliente React conserva sus rutas relativas `/api/v1` y su navegación por hash.

Se reutilizan `accessConfiguration`, `createAccessVerifier`, `requireMutationOrigin` y la matriz canónica de roles. No se implementó otro decodificador JWT ni otro repositorio de administradores.

El gateway recibe solo `ASSETS` y `ADMIN_API`. No tiene bindings D1, R2 ni Images. Antes de servir HTML, JS, CSS, fuentes o imágenes del build, consulta la sesión en la API privada: pertenecer a Access sin principal habilitado en D1 no permite descargar el Admin. No se cachea esa autorización; deshabilitar un principal se refleja en la siguiente solicitud de recursos o API. El navegador puede conservar contenido ya renderizado en memoria: esto no es borrado remoto de una pantalla abierta.

Para solicitudes API, la API misma aplica su permiso de ruta y revalida el rol dentro de las transacciones. El gateway no infiere privilegios del frontend ni sustituye RBAC por una comprobación visual.

## 2. Seguridad y comportamiento

### Identidad y límites de confianza

- JWT en `Cf-Access-Jwt-Assertion`, obligatorio y validado criptográficamente antes de servir o enrutar contenido administrativo. Se conservan firma RS256, issuer y AUD fijados, expiración/iat/nbf, `sub` estable, controles de cabecera, rotación/caché JWKS y tolerancia de reloj de cinco segundos del verificador existente.
- Sin issuer/AUD/origen válidos, bindings requeridos o entorno `development`, responde 503 de forma cerrada. La configuración local distribuida conserva esos valores vacíos; no autentica a nadie por defecto.
- Se valida `request.url.origin` contra el origen HTTPS configurado. No se descubre el host confiable desde `X-Forwarded-Host` ni se corrige un Origin ajeno en código de producción.
- Solo se reenvían assertion verificado, Accept, Content-Type, If-Match, X-Kuwago-Request, Origin y Sec-Fetch-Site. Cookies, Authorization, emails Access, roles del cliente y forwarded headers no llegan a la API.
- No hay cookies de sesión propias, endpoint de login ni token permanente del gateway. No se lee JWT desde localStorage o desde una cookie del navegador como alternativa. Las cookies Access futuras son responsabilidad del edge y deben revisarse allí.

### CSRF, CORS y rutas

Las mutaciones API conservan Origin HTTPS exacto, `X-Kuwago-Request: 1`, Content-Type JSON y Sec-Fetch-Site compatible con mismo origen cuando esté presente. La única excepción binaria es POST `/api/v1/media`, que mantiene las validaciones y límites de la API existente. No se relajan sus reglas multimedia.

Un Origin externo se rechaza también en lecturas. OPTIONS no concede preflight; no se emiten cabeceras CORS permisivas. No se cambian operaciones a GET ni se aceptan identidades en body/query.

Los errores devuelven códigos acotados y request ID del servidor, sin tokens, cookies, diagnósticos internos ni datos privados. Redirecciones del binding API se convierten en error: no se reenvía un assertion a otro destino ni una cabecera Location al navegador.

### Encabezados y caché

Todas las respuestas del gateway, incluidos errores, llevan `Cache-Control: no-store`, `Pragma: no-cache`, CSP, nosniff, DENY para frames, Referrer-Policy no-referrer, Permissions-Policy restrictiva, CORP same-origin, HSTS y noindex/nofollow/noarchive.

CSP aplicada:

```text
default-src 'none'; script-src 'self'; style-src 'self';
img-src 'self' blob:; font-src 'self'; connect-src 'self';
base-uri 'none'; form-action 'self'; frame-ancestors 'none';
object-src 'none'; worker-src 'none'
```

No se permite `unsafe-inline` o `unsafe-eval`. El permiso blob de imágenes conserva la compatibilidad de previews locales; no habilita scripts o workers blob.

Se eliminan Set-Cookie, cabeceras CORS, redirección/refresh y validadores de caché de assets. **La API conserva ETag**, porque representa la versión optimista requerida por Services, junto con If-Match, estados 409 y `202 pending`. `no-store` permanece: conservar una versión de API no autoriza caché de contenido privado.

## 3. Rutas y permisos

| Ruta | Método / control | Destino |
|---|---|---|
| `/`, `/index.html` | GET/HEAD, JWT + sesión D1 habilitada/admin:read | HTML del Admin |
| `/preferences-bootstrap.js` | GET/HEAD, mismo control | Restauración temprana de tema/idioma |
| `/assets/<nombre>-<hash>.(js,css,svg,woff,woff2,webp,png)` | GET/HEAD, mismo control, MIME de respuesta comprobado | Build Admin exclusivamente |
| `/api/v1/session` | JWT en gateway y API, RBAC | Identidad/rol/permisos mínimos |
| `/api/v1/services`, categorías y revisiones | Permisos existentes por endpoint | API privada |
| `/api/v1/.../approve,publish,unpublish,archive` | CSRF y permiso de publicación en API | Operaciones existentes; sin nueva concesión |
| `/api/v1/media/<id>/preview` | JWT, permiso privado, propietario/rol, estado e integridad | Preview mediante API; nunca acceso directo a R2 |
| `/api/v1/admins...` | Permiso super_admin; funcionalidad real aún reservada | La API puede responder 501, no éxito simulado |
| `/v1/*` del catálogo público | No se enruta aquí | 404; corresponde al Worker público separado |
| `/.env`, `/src/*`, prefijos R2, `/__local-test/*`, `/services` sin hash | No admitidas | 404, sin lectura de archivos/binding alternativo |

Dentro del espacio `/api/v1`, una ruta no reconocida por la API queda sujeta a su autorización y rechazo habitual; el gateway no inventa un handler. Rutas escapadas, doble separador o barras inversas no se usan para resolver archivos. No hay fallback SPA indiscriminado para endpoints o extensiones desconocidos. La navegación aprobada sigue siendo `/#overview`, `/#services` y sus hashes internos, no rutas arbitrarias `/services`.

Las respuestas de assets deben ser 200 y del MIME esperado. Una respuesta HTML de fallback para un supuesto JS no se entrega como script. No se sirven la raíz del repositorio, fuentes TS, sourcemaps ni archivos de entorno.

## 4. Archivos creados y modificados

Nuevos:

```text
infra/cloudflare/dev/src/gateway.ts
infra/cloudflare/dev/wrangler.gateway.local.json
infra/cloudflare/dev/test/gateway.test.mjs
infra/cloudflare/dev/test/gateway-harness.mjs
infra/cloudflare/dev/scripts/gateway-e2e.mjs
apps/admin/public/preferences-bootstrap.js
docs/PHASE-2C1-ADMIN-GATEWAY.md
```

Modificados en esta fase:

```text
infra/cloudflare/dev/scripts/build.mjs
infra/cloudflare/dev/scripts/local.mjs
infra/cloudflare/dev/package.json
infra/cloudflare/dev/README.md
apps/admin/index.html
apps/admin/README.md
```

El build backend incorpora el bundle del gateway. El wrapper admite únicamente una nueva validación en seco, `validate-gateway`, y comprueba configuración cerrada de assets/API, nombres locales, ingress deshabilitado y ausencia de recursos adicionales. La allowlist de claves impide introducir cuentas, bases, buckets, Images, overrides de assets por entorno o servicios inesperados en ese candidato local.

No se modificaron el Worker administrativo, el público, SQL/migraciones, contratos, lógica comercial, diseño/CSS/componentes React ni las candidatas remotas bloqueadas. No se instalaron dependencias. La landing pública no recibe cambios de esta fase y sigue construyéndose independientemente.

El script inline de preferencias de `apps/admin/index.html` se trasladó, con el mismo comportamiento, a `public/preferences-bootstrap.js`, cargado síncronamente en el head. Se preservan preferencias de tema e idioma y el diseño; el cambio permite la CSP estricta sin hashes de script ligados a cada build.

## 5. Configuración local y pruebas reproducibles

`wrangler.gateway.local.json` apunta a `src/gateway.ts`, assets de `../../../apps/admin/dist`, binding `ASSETS` y Service Binding `ADMIN_API` al Worker administrativo **local**. Incluye:

```text
assets.run_worker_first = true
assets.html_handling = none
assets.not_found_handling = none
workers_dev = false
preview_urls = false
routes = []
services.ADMIN_API.remote = false
```

No es un archivo remoto listo para desplegar. El wrapper elimina variables Cloudflare/Wrangler del proceso de validación y utiliza su directorio aislado local; no usa una sesión autenticada para estas comprobaciones.

Desde la raíz:

```powershell
npm --prefix apps/admin run build
npm --prefix infra/cloudflare/dev run build
npm --prefix infra/cloudflare/dev test
npm --prefix infra/cloudflare/dev run lint
npm --prefix infra/cloudflare/dev run validate:gateway
```

E2E nuevo, con Playwright ya instalado, sin instalar paquetes automáticamente:

```powershell
$env:KUWAGO_PLAYWRIGHT_MODULE = 'C:\Users\JV\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright\index.mjs'
npm --prefix infra/cloudflare/dev run test:e2e:gateway
```

El harness exige opt-in `--provision-gateway-test-identities`. Empieza anónimo y solo un canal operador stdin selecciona identidades sintéticas. No expone controles/login de test por HTTP. Genera claves RS256 efímeras en memoria; ambos Workers verifican firmas reales, con JWKS de prueba interceptado únicamente en el harness. No se guardan JWT ni claves privadas en React, archivos, cookies o localStorage.

El navegador conecta por loopback `127.0.0.1:5190`. El puente convierte únicamente el origen de ese loopback validado al HTTPS `https://localhost`, compatible con la protección CSRF del servidor de desarrollo Miniflare. **Esa conversión no existe en el gateway desplegable.** Un Origin ajeno no se convierte ni se admite. La lógica de autenticación sigue verificando JWT; no se introduce un bypass.

Se ejecutan el bundle real del gateway, el bundle de API en otro Worker, ASSETS nativo de Miniflare con `run_worker_first`, D1 efímera con las migraciones existentes y R2 simulado. El normalizador sharp participa solo como servicio de prueba local, nunca en el bundle gateway/API remoto. Todo outbound fuera del JWKS sintético permitido se rechaza; no hay Images remoto.

## 6. Resultados de verificación

| Comprobación | Resultado final |
|---|---|
| Backend completo | **166/166**, cero fallos/omitidas |
| Gateway unitario/integración | **14/14**, incluidas arriba |
| Admin Vitest | **31/31** |
| Público/contratos | **49/49**: assets 3, loader 4, PWA 24, catálogo 6, contratos 12 |
| E2E Admin existente | **16/16**, sin errores de consola |
| E2E gateway nuevo | **13/13**, sin pageErrors ni errores CSP |
| TypeScript | Backend/gateway, Admin y contratos correctos |
| Lint | Backend, Admin, contratos y catálogo correctos |
| Builds | Worker/gateway, Admin, contratos y landing correctos |
| Wrangler | Cinco dry-runs: API, público, barrera, reconciliador y gateway; sin uploads |
| Aislamiento | `verify:isolation` correcto; salida pública sin Admin ni contratos privados |
| Bundle gateway | Sin identidades de test, claves, sharp, fs, login de pruebas ni fixtures |
| Secretos | Escaneo acotado de 213 textos del árbol actual: sin patrones de claves privadas/JWT/credenciales AWS encontrados; no equivale a escaneo histórico exhaustivo |

Pruebas específicas: anónimo; JWT inválido/expirado/firma/issuer/AUD incorrectos; principal desconocido/deshabilitado/sin rol; editor sin permiso; spoofing de roles/email/cookies; CSRF y CORS; origen alternativo; rutas privadas/fuentes/test; versiones ETag/409 y 202; revocación sin caché; errores de binding, respuesta de sesión inválida, redirects y fallback HTML. Un editor diferente no puede descubrir ni leer el preview de otro uploader. El Worker público rechaza rutas administrativas.

E2E nuevo recorre el build de producción de React, categorías ES/EN, borrador, conflicto 409, PNG sintético privado normalizado **localmente**, preview, navegación hash/recarga, responsive, ambos temas/idiomas, sesión expirada, administrador deshabilitado y API caída. El flujo E2E existente conserva la cobertura completa de aprobación/publicación/retirada y 202 con barrera.

Evidencias locales ignoradas por Git:

```text
infra/cloudflare/dev/.wrangler/phase2c1/backend-tests.txt
infra/cloudflare/dev/.wrangler/gateway-e2e/report.json
infra/cloudflare/dev/.wrangler/gateway-e2e/desktop-light.png
infra/cloudflare/dev/.wrangler/gateway-e2e/desktop-dark.png
infra/cloudflare/dev/.wrangler/gateway-e2e/mobile-light.png
infra/cloudflare/dev/.wrangler/gateway-e2e/mobile-dark.png
```

Se inspeccionó visualmente la captura móvil oscura y se comprobaron en navegador dimensiones sin overflow horizontal, estilos/idioma y ausencia de violaciones CSP. No se realizó una nueva aprobación de diseño contra Stitch; no se cambiaron componentes o estilos. Pueden persistir `failure.png/html` de ensayos anteriores en la carpeta de prueba; el resultado final es el `report.json` exitoso.

Durante el desarrollo se corrigieron el puente de origen del harness y la eliminación inicial de ETag de API. Este último caso tiene regresión unitaria y E2E de conflicto real. No se rebajaron controles de producción para hacer pasar las pruebas.

## 7. Requisitos de Cloudflare Access y despliegue DEV futuro

La [documentación oficial de Access para Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) confirma que `ctx.access` no se propaga mediante Service Bindings y tiene limitaciones detrás del router de Static Assets. Se mantiene la verificación criptográfica explícita en gateway y API, sin depender de ese contexto.

La [configuración de assets](https://developers.cloudflare.com/workers/static-assets/binding/) debe invocar siempre al gateway antes de servir archivos. Un despliegue solo de `apps/admin/dist`, un `run_worker_first:false` o un Worker estático separado sin protección no cumplen esta arquitectura.

Antes de cualquier operación remota:

1. Revisar y aprobar este código y el diff completo con los cambios previos preservados.
2. Obtener mediante lectura autorizada el origen real, issuer, AUD, app y políticas Access, cobertura de recursos/URLs, MFA y duración de sesión. Estos valores no se inventan desde el hostname local del test.
3. Elegir una app Access para el origen del Admin. Configurar gateway y API para verificar la audiencia de ese assertion original; no asumir que coincide con la de la app antigua del endpoint API.
4. Preparar un candidato Wrangler DEV remoto nuevo y revisado. API, barrera y reconciliador sin ingress público; gateway protegido antes del primer request. Mantener acceso a preview cerrado o explícitamente protegido: [Version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/) no quedan acreditadas por una política de otro hostname.
5. Concretar los demás bloqueantes de 2C.0: D1 y seis migraciones con respaldo, R2 privado/publicación, Cron, alertas, rollback y bootstrap supervisado. Ninguno se ejecuta como efecto de desplegar el gateway.
6. Autorizar por separado recursos/bindings, SQL, bootstrap, cambios Access si corresponden y despliegues backend/Admin. Desplegar gateway con `assets.directory` limitado al build Admin, no a la raíz; usar el Service Binding revisado y origen único.
7. Ejecutar aceptación remota autorizada: login edge, anónimo/usuario no admitido, assets directos, JWT inválido y otra AUD, editor, deshabilitado, preview ajeno, CSRF, 409, sesión expirada y URLs alternativas. Verificar CSP efectiva y rollback compatible.

No hay un comando remoto aprobado para copiar y ejecutar todavía. No convertir el wrapper local eliminando sus guardas para usarlo como desplegador.

## 8. Riesgos residuales y criterios GO/NO-GO

| Criterio | Estado |
|---|---|
| Gateway validado localmente con ASSETS real de simulación, JWT y API separada | **GO local** |
| Diseño/Services, traducciones y temas conservados | **GO local**, E2E y builds correctos |
| Protección Access real, MFA y cobertura de previews | **Pendiente / NO-GO remoto** |
| Origen y audiencia real compartida gateway/API | **Pendiente** |
| Infraestructura completa, bootstrap y recuperación remotos | **Pendientes de 2C.0** |
| Multimedia remota | **NO-GO habilitación general**; PNG 2B.7C fue solo un caso; JPEG no autorizado para producción |
| Deploy en esta fase | **No autorizado** |

Cada archivo protegido exige verificar JWT y consultar sesión D1; esto aumenta peticiones y auditoría. No se optimiza cacheando permisos porque retrasaría revocaciones. Medir CPU, latencia, lecturas/escrituras D1 y presupuesto con un plan DEV autorizado antes de ampliar usuarios. No hay rate limiting global o plataforma de alertas nueva en esta fase.

Las claves JWKS se cachean conforme al verificador existente; retirar una clave en el emisor no implica invalidación instantánea en todos los isolates. Deshabilitar el principal en D1 aporta una barrera en cada request. La expiración no borra datos ya renderizados y no reemplaza un procedimiento de revocación operativa.

La CSP, MIME y no-store son defensas complementarias: no sustituyen Access, RBAC, revisión de dependencias ni aislamiento de recursos. No se usa `nodejs_compat` para introducir sharp en Workers.

La política de formatos/capacidades multimedia pendiente de 2C.0 permanece fuera del alcance de este gateway: la API local conserva JPEG/PNG/WebP. No activar su gate remoto o dar por aprobadas cargas reales por haber probado el preview local aquí.

Se preservaron los cambios Git anteriores. No se conectaron cuentas ni recursos remotos, no se ejecutó Images, no se modificaron Access/DNS/Hostinger, no hubo migraciones remotas, creación de administradores remotos, deploy, commit ni push. Se detiene para revisión.
