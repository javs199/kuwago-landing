# KUWAGO — Fase 2B.4: API de catálogo en DEV local

Auditoría final posterior: [PHASE-2B4-FINAL-AUDIT.md](PHASE-2B4-FINAL-AUDIT.md).
Reproduce los 141 resultados de esta entrega y amplía la verificación a 146,
clasificando pendientes y bloqueantes antes de cualquier despliegue.

Fecha: 23/10/2026, America/Costa_Rica.
Estado: implementación y pruebas locales, sin conexión o escritura en Cloudflare
remoto. Admin React, marketplace Hostinger, DNS, Access y Worker Hello World intactos.
No commit/push, datos comerciales, imágenes reales o altas privilegiadas remotas.

## 1. Arquitectura y reutilización

Se reutilizan JWT RS256/jose, el middleware RBAC, principals/roles y los contratos
1C (AdminService, ServiceRevision, Category, ServicePrice y PublicCatalogSchema).
No hay otro modelo de servicios ni un fallback a las referencias Stitch.

```text
Admin local :8790 → JWT + D1 RBAC → validación + versión → batch D1
  ├─ contenido/revisión/estado
  ├─ auditoría de negocio
  └─ outbox con DTO público validado → entrega condicional a PUBLICATION local

API pública local :8791 → solo PUBLICATION local → validación PublicCatalog → GET
```

El Worker público NO tiene D1, PRIVATE_MEDIA, secretos Access o binding al Admin.
Su bundle se comprueba para excluir SQL/código administrativo. R2 PUBLICATION es
otro almacén simulado, kuwago-publication-local-development, no un bucket creado
en la cuenta. Solo contiene JSON publicable, nunca originales o notas.
La lectura exclusiva se aplica en endpoints/código; un binding R2 no es una ACL
nativa de solo lectura. La separación del material privado sigue siendo necesaria.

El Admin conserva nombre local diferente del remoto y bindings remote:false,
sin account/database IDs. El candidato remoto bloqueado no cambia. Los comandos
Wrangler están acotados a localhost y development; no hay script de despliegue.
MUTATIONS_ENABLED=true habilita las nuevas operaciones SOLO en config local;
ausente/false las deshabilita. El flag no omite JWT, roles, origen o versiones.
Issuer/AUD/origen reales siguen vacíos en config: por defecto no autentica a nadie.

## 2. Endpoints administrativos

Prefijo /api/v1. Todos exigen JWT y principal habilitado. Editor/Admin/Super Admin
pueden leer/preparar; publicar/aprobar/retirar/archivar y auditoría requieren Admin
o Super Admin. La gestión de administradores sigue deshabilitada (otra fase).

| Método y ruta | Permiso | Comportamiento |
|---|---|---|
| GET /session | admin:read | Contexto propio mínimo existente |
| GET /services | admin:read | Lista paginada, q literal, títulos ES/EN, categoría, estado, precios por opción, moneda, versión y punteros |
| GET /services/:id | admin:read | AdminService con revisión de trabajo/publicada y versión/ETag |
| POST /services | drafts:write | Crea ID estable y primera revisión de borrador; 201 |
| PATCH /services/:id | drafts:write | Nuevo snapshot de revisión de trabajo; nunca edita la publicada |
| PATCH /services/:id/translations | translations:write | Revisión nueva modificando solo ES/EN, preserva resto |
| GET /services/:id/revisions | admin:read | Historial paginado de metadata; cursor por ID estable |
| GET /services/:id/revisions/:revisionId | admin:read | DTO de esa revisión, solo si pertenece al servicio |
| POST /services/:id/validate | services:publish | Readiness de contenido; informa sellado, NO aprueba ni publica |
| POST /services/:id/approve | services:publish | Aprobación comercial independiente, hash/sellado y versión |
| POST /services/:id/publish | services:publish | Publica revisión actual sellada/aprobada; 200 o 202 según entrega |
| POST /services/:id/unpublish | services:unpublish | Retira puntero público y vuelve a draft; conserva historial |
| POST /services/:id/archive | services:archive | Archivo terminal sin borrado de historial |
| GET /categories | admin:read | Categorías con traducciones, ID y versión |
| GET /categories/:id | admin:read | Categoría individual y ETag |
| POST /categories | drafts:write | ID generado por servidor, slug único y ES/EN completos |
| PATCH /categories/:id | drafts:write | Edición/versionado, incluido active; sin cambiar categoría actualmente publicada |
| GET /audit | audit:read | Auditoría paginada sin tokens, bodies o claves |
| POST /catalog/sync | services:publish | Entrega/reintenta outbox o inicializa copia vacía real |

Paginación: limit por defecto 20, máximo 100; cursor por ID, respuesta nextCursor.
No se interpreta q como SQL ni como patrón LIKE: se escapan comodines y se usan binds.
Los endpoints de revisión y auditoría conservan cursor estable por ID; no prometen
orden cronológico por fecha. Filtros adicionales/orden temporal quedan para el adaptador.

GET /services/:id responde {data:AdminService,version}; ETag tiene forma "3".
Solo incluye las revisiones de trabajo/publicada; el resto se consulta por historial.
No entrega object keys R2, hashes operativos o filas SQL sin mapear.
No hay DELETE: retirar/archivar preserva historial y aprobación/auditoría.

## 3. Entrada y versiones

Create/PATCH de servicio requieren un snapshot completo de borrador (PATCH no es
JSON Patch ni una mezcla arbitraria de campos). IDs de servicio/revisión, actor,
provenance, estado y aprobación pertenecen al servidor.

Ejemplo de borrador incompleto válido, sin contenido comercial:
```json
{
  "slug": "",
  "categoryId": null,
  "translations": {
    "es": { "title": "", "description": "" },
    "en": { "title": "", "description": "" }
  },
  "options": [],
  "media": [],
  "internalNotes": ""
}
```

Options reutiliza ServiceOption 1C. Precio ausente es borrador; fixed/from exige
amountMinor entero seguro, moneda USD/CRC/EUR y unidad. Quote no lleva importe y
puede tener moneda null. No se infiere moneda desde "$". IDs de opción se conservan
entre revisiones y no pueden pertenecer a otro servicio.
Media de entrada SOLO {id,sortOrder,alt:{es,en}}; no URLs, aprobación, actor o
procedencia del cliente. Debe referenciar metadata existente en D1. Ocho fotos máximo,
orden único, principal sortOrder=0 al aprobar. No hay endpoint para inventar metadata
aprobada: el pipeline R2 sigue pendiente; las pruebas insertan fixtures técnicos aislados.

Editar/cambiar estado requiere If-Match con versión entre comillas, p.ej. "3".
Sin versión: 428; inválida: 422; obsoleta/conflicto: 409. No overwrite silencioso.
Categorías usan su propia row_version. Las escrituras de catálogo también comparan
una versión global para que la proyección validada no se base en lecturas obsoletas.
Puede haber 409 entre mutaciones distintas: se debe releer y reconciliar, no repetir
ciegamente la edición. Es serialización optimista deliberada para DEV.

JSON: máximo 64 KiB contados en stream, buffer fijo, UTF-8 válido y timeout diez
segundos. Allowlist de campos, tipos/límites 1C, SQL preparado. Origen HTTPS exacto,
X-Kuwago-Request:1, JSON y reglas Sec-Fetch del middleware 2B.3; sin CORS abierto.
No se habilita todavía la excepción de upload binario ni se aceptan archivos.

## 4. Aprobación, revisión y estados

validate body: {revisionId}; valida contenido sin registrar aprobación. Responde
contentValid, sealed y readyForIndependentApproval (false si ya está sellada).
No afirma que una revisión sellada esté lista para publicar sin las otras comprobaciones.

approve body: {revisionId,confirmCommercialApproval:true}. Requiere Admin/Super Admin
distinto de created_by de la revisión de trabajo actual. Comprueba:
- categoría activa y ES/EN completos;
- slug, opciones, modalidad, duración, dinero explícito y campos obligatorios 1C;
- imágenes state=approved, provenance=verified, usage_approval=approved, hash y
  clave de derivado del servidor; textos alternativos y principal;
- confirmación comercial explícita y versión vigente.

Calcula SHA-256 canónico del contenido comercial, sin notas privadas ni flags
mutables de aprobación; sella la revisión y registra revisor/fecha/hash y versión
de categoría. Se marca provenance=verified SOLO en esa acción protegida/confirmada,
nunca al crear ni por JSON de Editor. En esta fase se ejecutó con datos sintéticos
de test, no se confirmó una oferta comercial real de Kuwago.

La categoría no se puede editar mientras la use una revisión publicada. Si cambia
antes de publicar, invalida la aprobación anterior (approval_stale). Crear revisión
nueva y obtener aprobación nueva; no reescribir una revisión sellada.

publish body: {revisionId}. Comprueba sellado/hash, aprobación de ESA revisión/categoría,
revisor actualmente habilitado con rol admisible, readiness y dependencias vigentes.
SQL asegura slug publicado único. Editor no publica ni aprueba.

Transiciones: draft→published; published→published con otra revisión aprobada;
published→draft al retirar; draft/published→archived. Repetir un estado inválido o
editar/archive de archived devuelve 409. No hay restauración automática.
Editar un servicio published crea otro borrador de trabajo, dejando intacto el
puntero público anterior hasta aprobar/publicar la revisión nueva.

## 5. Modelo transaccional y migración justificada

Nueva 0004_catalog_operations.sql; 0001–0003 y sus hashes permanecen intactos:
1. catalog_state, versión global inicializada desde MAX(outbox.generation).
2. mutation_guards, fila efímera con CHECKs nombrados de permiso/precondiciones.
3. publication_commands.action admite unpublish; conserva tabla/filas originales.
4. publication_outbox.catalog_json, únicamente snapshot público validado.
5. commercial_approvals.category_version para invalidación por cambios de categoría.

Se amplía el CHECK de action porque el anterior solo admitía publish/archive. La
migración preserva el hijo outbox en scratch transaccional sin FK, elimina primero
el hijo, reconstruye el padre y restaura hijo/índice/FK; elimina scratch antes de
commit. No deja modelos duplicados. Se probó con datos previos y foreign_key_check.
La versión global parte de la generación previa para evitar retrocesos/colisiones.
Snapshots legacy sin catalog_json no se convierten silenciosamente en una oferta:
requieren revisión/regeneración explícita si existieran en un entorno futuro.

Cada mutación de negocio hace UN db.batch:
- guardas SQL: principal habilitado, rol/permiso permitido, versión global y de
  servicio/categoría, estado y dependencias específicas;
- escrituras de entidad/revisión o puntero/estado;
- comando/outbox cuando hay cambio público;
- incremento de versión global y auditoría de negocio;
- limpieza de la fila de guarda.

CHECK inválido provoca error SQL real y rollback completo. UPDATE con cero filas
por sí solo NO aborta. En publicación, también se revalidan aprobación, categoría,
estado y hash de imágenes bajo la misma transacción. Fallo de auditoría revierte
puntero, versión, comando y outbox. La prueba fuerza ese fallo y comprueba todas
las tablas y la copia pública sin cambios.
[Transacciones batch de D1](https://developers.cloudflare.com/d1/worker-api/d1-database/).

La auditoría security.authorization del middleware es aparte: "allowed" significa
autorización de la solicitud, no éxito de una publicación. El éxito de negocio es
service.publish/unpublish/archive dentro del batch, con request ID generado servidor.

## 6. API pública y entrega eventual

Worker y configuración independientes, solo GET/HEAD:
- GET /v1/catalog: PublicCatalog v1, source=api.
- GET /v1/categories: solo categorías usadas por servicios publicados.
- GET /v1/services: servicios publicados paginados (limit/cursor).
- GET /v1/services/:id: detalle por ID estable; también slug, priorizando coincidencia ID.

La proyección selecciona solo revisiones publicadas y verificadas. No carga borradores
de trabajo para construir la copia, ni usa una consulta por servicio: lecturas batch
y agrupación lineal. Revalida readiness y construye campos públicos explícitos usando
contratos 1C. Publicación limitada por contrato v1 a 1000 servicios/categorías y
1 MiB de catálogo, con rechazo explícito antes de confirmar el batch, sin truncar.

Sin notas internas, revisión de trabajo, aprobación/revisor, actor, object keys,
SQL o URLs privadas. Imágenes se representan como /v1/media/<sha256> aprobado.
La entrega de esos bytes NO está implementada ni se presenta como lista: son rutas
reservadas para el futuro pipeline R2 y no hay fotos reales en este entorno.

Después del commit se entrega el snapshot por ETag condicional y generación creciente.
Máximo tres intentos, sin sobrescribir una generación más nueva; un fallo de ack D1
tampoco permite retroceder. Éxito operativo devuelve delivery=visible (200); fallo
delivery=pending (202), sin afirmar visibilidad completada. POST /catalog/sync
autorizado reintenta y puede reparar un objeto corrupto desde outbox validado.

**Límite importante:** D1 y R2 no comparten transacción. Si falla una retirada,
la copia aprobada ANTERIOR puede seguir visible hasta sincronizar. Ningún nuevo
borrador/nota privada se incluye, pero no se promete retirada inmediata en una falla.
Antes de producción hay que aceptar un SLA de retiro o diseñar revocación fuerte.
No habilitar tráfico real con una promesa de consistencia instantánea.

Sin snapshot/inválido: 503, jamás referencia estática o demo como fallback. Sync
autorizado inicializa catálogo vacío desde una D1 sana o entrega outbox pendiente.
No hay caché agresiva: respuestas no-store, sin CORS conectado a Hostinger.

## 7. Pruebas y verificaciones locales

- JWT ausente/inválido, roles, principal deshabilitado, CSRF y elevación desde cliente
  conservan las pruebas 2B.3; no hay bypass de autenticación ni JWT real de Cloudflare.
- CRUD de borrador, referencias, categorías, ES/EN y revisión de traducciones.
- Aprobación independiente, sellado, publicación, retiro y archivo con metadata
  sintética de imágenes; ninguna foto, proveedor o precio comercial real se cargó.
- Edición de publicado crea revisión nueva; PATCH directo a revisión se deniega;
  snapshots públicos excluyen el borrador y todos los campos privados.
- Dinero inválido, traducciones incompletas, imágenes pendientes, estado inválido,
  inyección SQL, versiones obsoletas, dos escritores y dos publicaciones concurrentes.
- Revocación de principal revalidada dentro del batch, fallo de auditoría con rollback,
  outbox pendiente, retry, corrupción y prohibición de retroceder generación por fallo de ack.
- Upgrade 0004 con comandos/outbox previos, sin pérdida de filas o FK rotas.
- Bundles Admin/público REALES ejecutados separados en workerd, JWT firmado de test,
  D1 local y solo bucket de publicación local compartido; no se desactiva seguridad.

Resultados del cierre:
- 74 comprobaciones DEV aprobadas en el reporte Node final (incluye contenedores).
- 49 regresiones públicas/contratos/PWA/loader/assets y 18 React Admin: correctas.
- TypeScript, lint y builds de Worker/módulo de seguridad/API pública; dry-runs de
  ambas configuraciones, migraciones D1 locales y aislamiento: correctos.
- Sin nuevas dependencias; npm audit del paquete DEV: cero vulnerabilidades.
- No builds públicos nuevos ni cambios de UI. Se compiló contracts/dist para tests;
  el runtime y build Hostinger permanecen intactos, aislamiento inspeccionado.

Comandos desde la raíz:
```powershell
npm --prefix infra/cloudflare/dev run migrate:local
npm --prefix infra/cloudflare/dev run verify:migrations
npm --prefix infra/cloudflare/dev run build
npm --prefix infra/cloudflare/dev run lint
npm --prefix infra/cloudflare/dev test
npm --prefix infra/cloudflare/dev run validate:config
npm --prefix infra/cloudflare/dev run validate:public
```

verify:migrations usa otra ruta fija de estado local, sin borrar la de desarrollo.
Los tests también ejecutan todas las migraciones desde cero y upgrade con historial.
La nueva 0004 se iteró durante esta fase antes de revisión; los SQL aprobados previos
no se editaron. Tras aprobar el checksum final, evolucionar con otra migración.

## 8. Archivos creados/modificados

Nuevos:
- infra/cloudflare/dev/src/catalog/{types,errors,input,repository,transaction,services,
  categories,projection,publication,snapshot,delivery,routes}.ts
- infra/cloudflare/dev/src/public.ts
- infra/cloudflare/dev/wrangler.public.local.json
- infra/cloudflare/dev/test/catalog-api.test.mjs
- packages/database/migrations/0004_catalog_operations.sql
- docs/PHASE-2B4-CATALOG-API.md

Modificados:
- infra/cloudflare/dev/{package.json,tsconfig.json,wrangler.local.json,README.md}
- infra/cloudflare/dev/scripts/{local,build}.mjs
- infra/cloudflare/dev/src/{index,security}.ts y src/auth/types.ts
- infra/cloudflare/dev/test/{auth-fixtures,authorization.test,config-storage.test}.mjs
- packages/database/{README.md,migrations.sha256.json}

No cambios en contratos 1C, Admin React, landing/marketplace/PWA, dependencias raíz,
originales Stitch, candidato remoto, Access, Hostinger o DNS. Estado Git previo
preservado, sin commit/push. El cierre registra comparación hash y escaneo de secretos.

## 9. Pendientes de R2, React y preparación remota

R2: falta implementar upload/decodificación/normalización, comprobar existencia y
hash real de bytes, derechos, revisión de imágenes, preview privado y entrega del
derivado permitido por manifiesto. No exponer originales del bucket privado ni
convertir metadata recibida del navegador en aprobada. Cleanup/backup/restore,
revocaciones urgentes y resguardo legal se revisan aparte.

Admin React: crear adaptador HTTP tipado sobre los DTO/ETag documentados, controlar
409 preservando el formulario, renderizar errores/carga, readiness y estados de
entrega 202, y conectar historial/aprobación independiente. Usar un origen/proxy
HTTPS compatible con controles CSRF; no guardar JWT en localStorage ni simular login.
El frontend no elegirá roles, procedencia o aprobación. Todavía no se conecta.

Operación: medir CPU/consultas/snapshots y contención de versión global; antes de
volumen alto considerar exportador/outbox dedicado manteniendo consistencia. Rate
limiting, alertas, retención, MFA/roles reales y recuperación siguen pendientes.
No hay idempotencia HTTP reutilizando respuesta: request IDs/versión y unicidad de
comandos previenen dobles escrituras, los reintentos deben reconciliar 409.

No hacer despliegue ni migración remota a partir de este documento. Siguiente puerta:
revisar API/modelo/ventana de retiro y aprobar integración LOCAL con React/R2. Para
remoto, verificar cuenta/IDs/AUD/origen y cobertura Access, acordar bootstrap,
backups y rollback; autorizar por separado SQL concretos y despliegues con configs
DEV reales, antes de habilitar escrituras o conectar Hostinger.

La fase se detiene para revisión sin ninguna operación remota de escritura.

## 10. Acta final de integridad

141 comprobaciones reportadas correctas: 74 DEV + 49 públicas/contratos + 18 Admin.
Inventario inicial SHA-256 de 465 archivos: 451 intactos, 14 modificados dentro del
alcance listado y 17 nuevos. SQL 0001–0003, contratos, candidato remoto y todas
las fuentes de UI/landing/PWA intactos. No se descartó el trabajo Git anterior.
Escaneo del árbol actual: 187 textos no ignorados, sin coincidencias de claves
privadas, asignaciones de credenciales reconocibles o JWT literales. No cubre el
historial completo/archivos ignorados ni es garantía absoluta de ausencia de secretos.
Sin espacios sobrantes en los archivos de entrega. Artefactos y bases locales
permanecen ignorados; no se guardaron JWT o claves privadas de test en archivos.
