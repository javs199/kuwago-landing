# Kuwago DEV — API de catálogo local 2B.4R

Gateway protegido 2C.1: [arquitectura y pruebas](../../../docs/PHASE-2C1-ADMIN-GATEWAY.md).
`npm run validate:gateway` valida únicamente el candidato local en seco.
`npm run test:e2e:gateway` requiere un módulo Playwright instalado indicado por
`KUWAGO_PLAYWRIGHT_MODULE`; utiliza assets nativos, dos Workers y D1/R2 efímeros.
La configuración normal conserva issuer/AUD/origen vacíos y rechaza por defecto.
No iniciar el harness de identidades como servidor público ni desplegarlo.

Integración Admin 2B.5: [informe local](../../../docs/PHASE-2B5-ADMIN-INTEGRATION.md).
El harness de test está fuera del bundle de producción y requiere opt-in explícito
para aprovisionar identidades/revisor sintéticos. Usa JWT real, API en workerd y
D1/R2 efímeras. No activa usuarios ni cambia la D1 local normal al ejecutar dev.

Actualización de resiliencia: [informe y procedimiento 2B.4R](../../../docs/PHASE-2B4R-RESILIENCE.md).
Incluye 0005, reconciliador scheduled con backoff/leases/escalamiento, alertas
durables y restore aislado con nueva epoch y cuarentena. Nunca restaura sobre el origen.
El público ahora requiere el service binding CATALOG_BARRIER al Worker dedicado
sin ingress, sin D1 ni acceso al Admin. Ante snapshot obsoleto falla con 503.
Los detalles 2B.4 más abajo describen la base anterior; 2B.4R sustituye su política
de servir temporalmente una copia vieja durante 202 pending.

Este paquete NO cambia el Worker Hello World desplegado ni Cloudflare Access.
La landing y el Admin existentes conservan sus builds y funcionamiento.

## Configuraciones separadas

- wrangler.local.json: activa exclusivamente en comandos de este paquete. Worker
  kuwago-admin-api-local-only-development, distinto del remoto; sin account_id ni
  database_id, estado local separado, localhost, bindings remote:false. Único env:
  development. No staging/production, custom domains, routes, previews o cron.
- wrangler.remote-development.example.json: candidato DOCUMENTAL para los recursos
  existentes, con main bloqueado e IDs pendientes inválidos explícitos. No se usa
  en scripts ni es desplegable. NO sustituir main por deny-all ni desplegarlo sobre
  el Worker remoto: cambiaría Hello World y podría desactivar su acceso workers.dev.
- wrangler.public.local.json: Worker distinto, loopback 8791, solo R2 PUBLICATION
  simulado; sin D1, PRIVATE_MEDIA, secretos Access o binding al Admin. Comparte la
  copia aprobada local con el Admin, nunca originales/imágenes privadas.
- resources.development.json: nombres comunicados por el usuario, IDs/AUD/issuer
  null. No implica lectura independiente, bindings remotos comprobados o autorización
  de nuevos cambios. El bucket real comunicado es kuwago-media-development, distinto
  del nombre inicialmente propuesto en 2A. Los documentos 2A son históricos intactos.

Los recursos usan el mismo nombre de DB/bucket en los bindings locales, pero son
simulaciones, NO conexiones remotas. remote:false no es barrera para un deploy futuro.
El wrapper inspecciona invariantes, rechaza argumentos extra/comandos desconocidos,
quita credenciales Cloudflare del entorno hijo, usa un config home separado y
desactiva métricas. Esto no es un sandbox de red ni evita que un operador invoque
Wrangler directamente; no hacerlo con configuraciones/flags remotos.

## Herramientas y comandos

Wrangler 4.152.0 fijado; Miniflare 5.20261019.2-beta es su dependencia oficial usada
también por los tests. Se descartó 4.116.0 al detectar avisos altos. Excepción local
documentada al preferir runtime estable de 2A: el runtime actual está en beta, así
que NO se autoriza aquí su despliegue. Override acotado undici 7.30.1 por avisos
actuales en su versión transitiva. Pruebas y npm audit finales verifican esta elección.
Retirar override cuando el proveedor integre el parche, tras ejecutar regresiones.

compatibility_date=2026-07-30 es la línea base explícita usada en las primeras
pruebas estables; se conserva al actualizar herramientas. No se deduce la fecha
del Worker remoto ni se cambia por la fecha del día sin volver a probar.
TypeScript y ESLint reutilizan las herramientas instaladas del Admin; los tests
compilan contratos en packages/contracts/dist sin regenerar assets públicos.

Desde la raíz (instalar solo en una nueva copia local, si hace falta):

```powershell
npm --prefix infra/cloudflare/dev ci
npm --prefix infra/cloudflare/dev run typecheck
npm --prefix infra/cloudflare/dev run lint
npm --prefix infra/cloudflare/dev run validate:config
npm --prefix infra/cloudflare/dev run migrate:local
npm --prefix infra/cloudflare/dev run migrations:list:local
npm --prefix infra/cloudflare/dev test
npm --prefix infra/cloudflare/dev run dev
```

dev escucha en 127.0.0.1:8790. La configuración versionada deja issuer/AUD/origen
vacíos: devuelve 503 no-store, sin identidad automática ni bypass. src/index.ts es
el entrypoint JWT/RBAC; deny-all.ts se conserva como guardia histórica probada de 2B.2.
Con metadatos válidos, cada ruta administrativa exige JWT y principal/rol en D1.
La API 2B.4 permite borradores, categorías/traducciones, aprobación independiente,
publicación/retiro/archivo y auditoría. MUTATIONS_ENABLED=true se usa SOLO en esta
config local autorizada; ausente/false deshabilita escrituras de negocio. El candidato
remoto conserva false y main/IDs bloqueados. No hay upload/preview de imágenes
ni gestión real de administradores. La API pública separada es de lectura anónima
y valida exclusivamente la copia PUBLICATION; no comparte middleware o D1.
No hay login simulado, seeds de personas o UI conectada. No es un backend desplegado.
validate:config llama deploy --dry-run: genera bundle local, valida config y sale;
el texto «Total Upload» de Wrangler describe el tamaño, no una subida ejecutada.
El candidato remoto NO se valida como desplegable: intencionalmente faltan main/IDs.

No usar --remote, login, deploy, versions upload, secrets, create ni comandos
automáticos de recursos. Las restricciones de esta fase siguen vigentes.

## Contrato privado de imágenes

src/media.ts define PrivateMediaRecord, RevisionMedia y PrivateImageStorage,
sin implementación de storage, upload o acceso de red. privateObjectKey utiliza
un ID generado por servidor en development/quarantine/<id>; no acepta paths/URLs.
No exponer estas claves ni el DTO completo en PublicMediaAsset.

Flujo futuro, con permisos servidor independientes:
1. JWT válido + principal habilitado + media:upload, Origin exacto y header de mutación.
2. Streaming real máximo 2 MiB, timeout 30 s; rechazar Content-Length engañoso.
3. JPEG/PNG/WebP; comprobar MIME declarado, firma y decodificación completa. Rechazar
   SVG/HTML/ZIP/animaciones no admitidas/corruptos; dimensiones <=4096 y <=8 MP.
4. Decoder servidor normaliza/re-encoda y elimina EXIF/GPS; valida también bytes del
   derivado. validateDecodedImage SOLO comprueba metadatos de salida del decoder
   confiable: sus flags NO prueban un archivo ni se aceptan del navegador.
5. quarantine -> validated -> approved (revisor distinto, procedencia/derechos
   verificados); rechazo -> rejected; approved -> retired; rejected/retired -> deleted.
   No borrar o alterar bytes verificados: nuevo archivo = nuevo ID/hash.
6. Solo preview privado autenticado con permiso explícito, no-store y nosniff.
   No r2.dev, dominio bucket, listados, signed URLs o presigns públicos. No se
   publican originales. Publicación de derivados requiere una fase/almacén separado.

Máximo ocho fotos por revisión, principal sortOrder=0, orden y alt ES/EN por revisión.
En 2B.3 se autoriza media:read-private y media:prepare en la matriz, pero los handlers
reales de preview/upload siguen deshabilitados. approve/cleanup no se conceden.
Access por sí solo no autoriza leer una imagen concreta.

Limpieza futura, NO implementada: inventario dry-run de cuarentenas >7 días y
retirados/huérfanos >30 días (retención por aprobar); comprobar referencias de TODAS
las revisiones y operaciones/outbox, retenciones legales/backups y uploads en curso.
Recomprobar bajo control de concurrencia justo antes de cada borrado autorizado,
con tombstone, registro y reintento idempotente. Sin borrados/lifecycle automáticos
en este paquete. Recuperación: originales/derivados con hashes y copia privada
independiente; la D1 no respalda bytes de R2. Retención/copia/restore real pendientes.

Informe y siguiente autorización: ../../../docs/PHASE-2B2-DEV-BINDING.md.

## Seguridad 2B.3

Informe vigente: ../../../docs/PHASE-2B3-AUTHORIZATION.md. JWT RS256 con jose 6.2.13,
emisor Cloudflare Access configurado y AUD exacta; exp/iat/nbf y sub estable. JWKS
solo del emisor fijado, sin seguir redirects, máximo 64 KiB, timeout 3 s, caché 5 min
y cooldown 30 s. No se usa Access dev.identity ni tokens reales en tests.

Middleware reutilizable: verify → principals(issuer,sub,enabled) → administrator_roles
→ admin_role_permissions → permiso de ruta → auditoría de autorización → controles
de mutación → respuesta. Cada request vuelve a consultar D1, sin caché de roles.
Esquema canónico nuevo: super_admin/admin/editor, un rol por principal y sin heredar
principal_roles históricos. Ausencia de principal/rol, discrepancias o errores de
seguridad fallan cerrados. Auditar permisos no significa ejecutar la operación.

Los tests firman claves efímeras en memoria e interceptan exclusivamente JWKS dentro
del harness; la verificación de firma nunca se desactiva. El bundle no contiene keys,
identidades test ni switches de bypass. El build local queda en .wrangler/build y
el dry-run en .wrangler/dry-run, ambos ignorados y ajenos al build Hostinger.

```powershell
npm --prefix infra/cloudflare/dev run build
npm --prefix infra/cloudflare/dev test
```

La migración 0003_access_rbac.sql se aplica SOLO con migrate:local. No edita 0001/0002,
no crea usuarios y no asigna privilegios por haber iniciado sesión. Bootstrap e IDs
remotos continúan pendientes de revisión/autorización.

## Catálogo 2B.4

Informe/API: ../../../docs/PHASE-2B4-CATALOG-API.md. Migración nueva 0004, sin cambiar
0001–0003: versión global, guardas SQL abortantes, payload público en outbox,
versión de categoría en aprobación y acción unpublish. Probada desde cero y con
comandos/outbox previos; la copia de migración temporal se elimina antes del commit.

Cada edición crea una revisión nueva. If-Match: "<version>" es obligatorio para
editar y cambiar estados. Aprobación comercial requiere Admin/Super Admin distinto
del autor, confirmación explícita, contenido completo y metadata de imágenes
verificada en servidor. El cliente no puede marcar procedencia, imágenes o aprobación.
No hay servicios/administradores reales precargados en el entorno persistente.

Publicación + auditoría + outbox son UN batch D1. La entrega D1→R2 es eventual:
200 visible o 202 pending; el GET público nunca cae silenciosamente a demos.
Desde 2B.4R, ante retiro pendiente la barrera impide servir la copia ANTERIOR:
responde 503 hasta converger. Ningún borrador/nota privada se materializa.
La API no entrega bytes de imágenes todavía.

```powershell
npm --prefix infra/cloudflare/dev run migrate:local
npm --prefix infra/cloudflare/dev run verify:migrations
npm --prefix infra/cloudflare/dev run build
npm --prefix infra/cloudflare/dev test
npm --prefix infra/cloudflare/dev run validate:public
npm --prefix infra/cloudflare/dev run dev:stack
# Reconciliador periódico local: consultar instrucciones 2B.4R.
```

verify:migrations tiene otro directorio fijo de estado local para comprobar la cadena
completa sin borrar datos. Los tests también migran D1 efímera desde cero; el histórico
de Wrangler conserva nombres de archivo, el manifiesto añade checksums para revisión.
Catálogo público inicialmente 503 sin copia; POST /api/v1/catalog/sync autorizado
inicializa una copia vacía real o entrega outbox pendiente. Sin fallback estático.
El prototipo React de Admin y el adaptador Hostinger siguen desconectados.
