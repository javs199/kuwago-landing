# KUWAGO — Fase 2B.3: autenticación y autorización del backend

Fecha: 23/10/2026, America/Costa_Rica. Implementación y pruebas exclusivamente locales.
No login remoto, tokens reales, cambios Access, deploy, migraciones remotas, DNS,
Hostinger, conexión del Admin, publicación comercial, commit o push.

## 1. Arquitectura implementada

```text
Request → configuración DEV válida → JWT RS256 / JWKS del emisor fijo
        → identidad verificada (issuer, sub)
        → D1: principal enabled + rol canónico + permisos
        → permiso explícito de ruta + auditoría de autorización
        → controles Origin/header/JSON si mutación
        → contexto propio mínimo o handler reservado deshabilitado
```

El entrypoint src/index.ts sustituye a deny-all.ts SOLO en wrangler.local.json.
El Worker remoto Hello World y el candidato remoto bloqueado no se modifican.
La configuración versionada mantiene issuer/AUD/origen vacíos: ejecutar dev devuelve
503 sin autenticar a nadie. No hay identities simuladas en Access config ni bypass.
APP_ENV distinto de development también se rechaza: producción exige una fase propia.

La autenticación es real: se verifica una firma, no se confía en un email o rol enviado
por React. Los tests generan claves/token exclusivos en memoria y consultan D1 local.
No hay almacenamiento JWT en navegador/disco ni export de claves privadas.

## 2. Elección: JWT criptográfico frente a ctx.access

Cloudflare soporta ctx.access para invocaciones autenticadas directamente en el edge.
No se propaga por Service Binding/RPC y hay limitaciones con el router de Static
Assets. Para la futura API interna se eligió verificar el JWT original reenviado
por el gateway. No hay fallback a ctx.access ni a su simulación local.
[Contexto Access y limitaciones](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).

Se usa jose 6.2.13, siguiendo el mecanismo JWT documentado por Cloudflare. El gateway
futuro deberá proteger sus assets y reenviar el assertion original a la API, que
volverá a verificarlo. Access permite entrada; RBAC interno autoriza acciones.
[Validación oficial de JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

Controles implementados:
- Header Cf-Access-Jwt-Assertion obligatorio, formato compacto y máximo 16 KiB.
- RS256 exclusivamente; kid acotado, rechazo de jku/jwk/x5u/crit del cliente.
- Emisor HTTPS exacto del equipo *.cloudflareaccess.com, AUD explícita del servidor.
  Nunca descubrir emisor/claves desde claims sin verificar o un header del cliente.
- iss/aud/sub/exp/iat obligatorios, nbf si existe, tiempos enteros coherentes,
  issued-at futuro rechazado y tolerancia de reloj máxima de cinco segundos.
- Identidad estable issuer+sub; no se usan email, roles, grupos o permisos del JWT
  como concesiones administrativas.
- JWKS solo /cdn-cgi/access/certs del emisor fijado. Timeout tres segundos, máximo
  64 KiB, sin redirects: Workers usa modo manual y se exige HTTP 200.
- Caché de claves por instancia/isolate de cinco minutos; actualización acotada
  al caducar o ante kid desconocido, cooldown 30 s para no hacer fetch por cada token.
  Un kid nuevo durante cooldown se deniega hasta el refresh permitido.
- Firma inválida, token ausente/expirado, emisor/AUD erróneos, claves no disponibles
  o respuesta JWKS inválida se rechazan con 401 genérico. No se refleja diagnóstico.

La caché puede aceptar una clave retirada hasta su caducidad configurada: no es
revocación instantánea de JWT. Principal/rol sí se consulta por request; bloquear
la identidad en D1 es una defensa adicional. Validación de política MFA y audiencia
real sigue pendiente en cuenta, no se deduce de que Google permita iniciar sesión.

## 3. RBAC y migración D1

| Permiso | editor | admin | super_admin |
|---|---|---|---|
| admin:read | Sí | Sí | Sí |
| drafts:write | Sí | Sí | Sí |
| translations:write | Sí | Sí | Sí |
| media:prepare | Sí | Sí | Sí |
| media:read-private | Sí | Sí | Sí |
| services:publish / services:unpublish / services:archive | No | Sí | Sí |
| audit:read | No | Sí | Sí |
| admins:manage | No | No | Sí |

Permisos representan autorización preparada, NO funciones de negocio habilitadas.
No hay media:cleanup ni media:approve concedidos por inferencia. Aprobación comercial
futura requiere admin/super_admin independiente del autor y principal habilitado.

0003_access_rbac.sql agrega admin_role_definitions, admin_role_permissions y
administrator_roles. Conserva principals y los dos SQL anteriores sin editarlos.
Un principal tiene como máximo un rol canónico. Las tablas de roles 2B.2 permanecen
para historial; NO se convierten ni heredan. Un publisher legacy no puede aprobar
después de 0003: se actualiza el trigger comercial a los roles canónicos.

No se insertan personas ni asignaciones. principals(issuer,subject) ya es único;
primer acceso no crea administradores. enabled es falso por defecto. Bootstrap
de personas/roles requiere operación revisada aparte, sin self-grant o primer
visitante administrador. El email puede cambiar sin alterar una asignación estable;
un cambio de issuer/sub exige reconciliación autorizada, no coincidencia por email.

Consulta preparada con parámetros, principal habilitado, rol conocido y permisos
leídos de D1 en cada request. No hay caché de principal/roles. La matriz TypeScript
es un techo de seguridad: permisos ausentes en D1 no se inventan y un permiso DB
inesperado superior al rol provoca 503. Roles del body/headers/claims se ignoran.
Sin principal, deshabilitado, sin rol o sin permiso: 403 genérico.
DB inexistente, esquema antiguo sin 0003 o auditoría fallida: 503, sin acceso.

Migración aplicada solo en D1 local persistente y probada desde cero en D1 efímera.
Historial local sin pendientes; hashes originales 0001/0002 conservados y manifiesto
extendido con 0003. Ninguna base remota se abrió o migró.

## 4. Middleware y endpoints

Módulos reutilizables:
- auth/access.ts: configuración y verificador de identidad criptográfica.
- auth/rbac.ts: consulta D1, matriz y requirePermission.
- auth/middleware.ts: authorizeRequest, eventos y controles de origen.
- auth/errors.ts y auth/types.ts: errores públicos acotados y interfaces mínimas D1.
- index.ts: rutas exactas con permiso, método y handlers deshabilitados.

Único endpoint de lectura implementado: GET /api/v1/session. Devuelve SOLO el ID
interno, rol y permisos del administrador autenticado. Sin token, email, issuer,
subject, listas de usuarios o contenido privado. Respuestas no-store/nosniff/CSP
restrictiva y request ID generado por servidor, sin confiar en el ID del cliente.

Rutas reservadas: listado/borradores/traducciones, publicar/despublicar/archivar,
multimedia, auditoría y administradores. Se prueba el middleware con sus permisos.
Después de autorizar y comprobar origen, responden 501 operation_not_enabled:
no se crea/edita/publica servicio, no se devuelve imagen R2, no se cambia usuario.
Un super_admin autorizado recibe 200 en su contexto propio, pero no éxito ficticio
en gestión de usuarios. Rutas/métodos desconocidos requieren identidad y se deniegan.

Para mutaciones reservadas: ADMIN_ORIGIN HTTPS exacto, Origin idéntico,
X-Kuwago-Request:1 y Content-Type JSON; Sec-Fetch-Site, si existe, debe ser same-origin.
No CORS abierto, cookies o permisos confiados al frontend. El upload binario REAL
seguirá deshabilitado hasta diseñar su excepción con límites/decoder y autorización;
no se acepta aún un archivo ni se consume el body de negocio. No GET con cambios.

La única escritura por request autenticado reconocido es auditoría técnica D1:
acción security.authorization, permiso y resultado allowed/denied. Eso NO afirma
que una operación de negocio se ejecutó. Falta de permiso se registra antes del 403.
Desconocidos/JWT inválidos no generan filas con actor inventado: log estructurado.
CSRF, rutas rechazadas y errores registran también eventos acotados.
Campos de log permitidos: evento, request ID, operación, estado, principal ID/rol
cuando corresponda. Sin token, cookie, email, body, query, URL o error interno.
Retención, protección de logs e ingestión de alertas reales quedan pendientes.

## 5. Pruebas ejecutadas

Pruebas unitarias y de integración Node + D1 local workerd:
- Sin token, token mal formado, demasiado largo, firma incorrecta y algoritmo HS256.
- Expiración, nbf futuro, iat futuro, claims ausentes, emisor y aplicación incorrectos.
- Cabeceras de claves controladas por cliente; JWKS corrupto/vacío/excesivo/inaccesible
  o redirigido. Caché, rotación y cooldown de kid desconocido.
- Principal inexistente/deshabilitado/sin rol; legacy sin herencia; matriz SQL/TS.
- Editor intentando publicar, Admin intentando administrar usuarios, Super Admin
  autorizado; claims/headers/body del frontend no elevan privilegios.
- Revocación de rol y deshabilitación efectiva en la siguiente request; grants DB
  superiores al techo estático fallan cerrados; fallos de lectura/auditoría deniegan.
- Endpoints directos, rutas/métodos desconocidos, CSRF, imágenes inaccesibles y
  ausencia de escrituras de catálogo/outbox/usuarios.
- Logs/auditoría sin material sensible; build sin identidades o claves de test.
- Bundle REAL del Worker dentro de workerd: JWT firmado por clave efímera,
  JWKS interceptado únicamente en harness y consulta D1 con resultado super_admin.

No hay token real ni endpoint de autenticación ficticio. La inyección de fetch
existe como dependencia de módulo para pruebas: no acepta identidades verificadas,
no desactiva firmas y no se configura desde HTTP/env. El entrypoint usa fetch normal.
El outbound del harness solo admite la URL de certificados ficticia; nada se envía
a una cuenta Cloudflare. El test de workerd detectó y corrigió la incompatibilidad
de redirect:error: ahora manual + rechazo no-200, sin debilitar el control.

Resultados finales:
| Verificación | Resultado |
|---|---|
| Tests del paquete DEV | 51 correctos según Node, incluidos contenedores de subtests |
| Regresión pública/contratos/PWA/loader/assets | 49 correctos |
| Tests React Admin | 18 correctos |
| TypeScript | DEV, contratos y Admin correctos |
| Lint | DEV, contratos, catálogo y Admin correctos |
| Build | Worker y módulo de seguridad locales correctos, sin tests/identidades incrustados |
| Wrangler | Dry-run/config y bundle correctos; ningún upload |
| D1 | 0003 local aplicada, listado sin pendientes; esquema completo probado efímero |
| Check estático y aislamiento | Correctos; build público existente sin backend/Admin |
| Dependencias del paquete DEV | npm audit: cero vulnerabilidades |

Total reportado: 118 pruebas correctas, cero fallos. Build de contratos usado por
tests, sin regenerar assets públicos. No se hicieron builds de landing/Admin porque
no cambiaron; su aislamiento se comprobó con artefactos existentes y regresiones.
No se hicieron capturas de UI: el frontend no se modificó ni conectó.
Wrangler/Miniflare beta transitivo y override undici ya fijados en 2B.2 se conservan;
jose y esbuild se fijan explícitamente. No se actualizó el stack público.

Comandos desde la raíz:
```powershell
npm --prefix infra/cloudflare/dev run migrate:local
npm --prefix infra/cloudflare/dev run migrations:list:local
npm --prefix infra/cloudflare/dev run build
npm --prefix infra/cloudflare/dev run lint
npm --prefix infra/cloudflare/dev test
npm --prefix infra/cloudflare/dev run validate:config
```

## 6. Archivos creados y modificados

Nuevos:
- infra/cloudflare/dev/src/auth/{access,errors,middleware,rbac,types}.ts
- infra/cloudflare/dev/src/index.ts y src/security.ts
- infra/cloudflare/dev/scripts/build.mjs
- infra/cloudflare/dev/test/{access.test,authorization.test,auth-fixtures}.mjs
- packages/database/migrations/0003_access_rbac.sql
- docs/PHASE-2B3-AUTHORIZATION.md

Modificados dentro del alcance:
- infra/cloudflare/dev/package.json y package-lock.json: jose, build/esbuild y pretest.
- infra/cloudflare/dev/wrangler.local.json: entrypoint local y metadatos vacíos.
- infra/cloudflare/dev/test/config-storage.test.mjs: checksum tres migraciones y bundle.
- infra/cloudflare/dev/README.md y packages/database/README.md: estado actualizado.
- packages/database/migrations.sha256.json: añade hash 0003, conserva los anteriores.

No se modifican contratos 1C, UI Admin, landing, modelos comerciales, config remota
candidata, originales Stitch o documentación histórica de fases. Sin claves privadas
en fuentes. Comprobación final de hashes y escaneo limitado del árbol actual en cierre.

## 7. Riesgos y pendientes antes de integración remota

1. IDs de cuenta/D1, issuer/AUD, origen Admin y cobertura efectiva Access/previews
   siguen sin lectura independiente; configuración incompleta deniega, no adivina.
2. Autorización no prueba MFA: validar política real, usuarios individuales y sesión.
   No usar aliases compartidos como identidades administrativas distintas.
3. API DEV remota aún Hello World con ingress Access informado por usuario. Antes
   de backend real resolver gateway/Admin y eventual Service Binding interno; no
   copiar configuración local ni apagar rutas remotas sin revisión.
4. Falta rate limiting, presupuesto/alertas, retención y protección operativa de logs.
   Evitar amplificación de fetch mediante caché/cooldown no es una cuota global.
5. Auditoría permitida por request consume D1; no hay D1 write para visitantes
   anónimos, pero el volumen de logs debe medirse antes de tráfico real.
6. Una revocación concurrente entre lookup y operación exige nueva comprobación
   transaccional en la futura escritura crítica. Esta fase NO habilita esas escrituras.
7. Validaciones/publicación transaccional, hash canónico, outbox, imágenes, decoder,
   backups/restore y permisos objeto-a-objeto permanecen pendientes de su fase.
8. No hay gestión de administradores: bootstrap y cambios privilegiados deben tener
   doble revisión, impedir autoelevación y preservar acceso de recuperación.
9. La auditoría SQL es append-only en aplicación, no inmutable frente al operador D1.
   Logs de denegación no equivalen a una plataforma de monitoreo ya configurada.

## 8. Preparación y autorización de integración remota

1. Revisar código, matriz canónica, SQL/checksums, pruebas y riesgos; aprobar que los
   roles legacy NO se conviertan automáticamente. Nombrar responsables/miembros.
2. Leer metadatos de DEV desde sesión autorizada disponible o completarlos
   manualmente, sin tokens/cookies/JWT. Esta fase no los obtiene ni inventa.
3. Revisar gateway y cobertura completa de Access/URLs alternativas. Preparar un
   diff remoto específico y rollback de Hello World, sin desplegarlo todavía.
4. Solicitar autorización EXPLÍCITA de migraciones DEV con cuenta/DB y archivos
   0001–0003/checksums confirmados, backup/bookmark si corresponde y validación
   antes/después. No deducirla de la aprobación del código local.
5. Bootstrap de identidades issuer+sub habilitadas y roles mediante operación
   separada revisada. Sin alta automática ni datos reales en tests/seeds.
6. Solicitar autorización EXPLÍCITA de deploy DEV con código/config revisados,
   bindings exclusivos DEV y garantía de protección desde el primer request.
   Access/DNS/Hostinger no cambian implícitamente en esa autorización.
7. Tras aprobación y despliegue futuro: probar anónimo, identidad no permitida,
   JWT falso/expirado/AUD ajena, rol revocado y rutas alternativas. Mantener CRUD,
   publicación e imágenes deshabilitados hasta su implementación/revisión propia.

Esta entrega se detiene antes de cualquier modificación en Cloudflare remoto.

## 9. Cierre de integridad local

Inventario SHA-256 de inicio: 452 archivos existentes. Resultado final: siete
modificados dentro del alcance declarado, 445 intactos y 13 nuevos. Los SQL
0001/0002, las fuentes del Admin/landing y el candidato remoto están intactos.
Escaneo del árbol actual: 170 textos, cero coincidencias de claves privadas,
asignaciones de credenciales reconocibles o JWT literales; sin imprimir contenidos.
No cubre todo el historial ni archivos ignorados: no se presenta como garantía
absoluta de ausencia de secretos. Sin espacios sobrantes en archivos de entrega.
Build, estado D1 local y dependencias están ignorados por Git. No se conservó
ningún archivo de diagnóstico temporal con cambios en la verificación.
