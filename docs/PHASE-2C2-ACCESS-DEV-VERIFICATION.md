# Fase 2C.2 — Verificación remota de Access e infraestructura DEV

24/10/2026 · America/Costa_Rica · Exclusivamente lectura.

**Resultado: protección Access actual confirmada; NO-GO para desplegar todavía el Admin/backend real.** El Worker existente exige login en su URL activa, las previews están deshabilitadas y el bucket privado no tiene acceso público. Sin embargo, **Access MFA está desactivado/no habilitado**, falta proteger expresamente el futuro gateway y la credencial Wrangler actual no permite consultar D1. También faltan el esquema remoto, los bindings y los controles operativos del candidato completo.

No se realizaron cambios de Access, MFA, recursos, suscripciones, código o configuración. El único archivo añadido por esta fase es este informe. Se preservan los cambios Git previos.

## 1. Evidencia y límites de la auditoría

Se leyeron los informes 2C.0/2C.1 y las partes relevantes de configuración, migraciones, RBAC, resiliencia y política multimedia. No se ejecutaron builds, tests ni migraciones: las 275 comprobaciones de 2C.1 son evidencia histórica local, no una nueva ejecución de esta fase.

Fuentes actuales:

- Sesión existente del Dashboard, sin iniciar otro login, modificar campos ni pulsar Guardar. Se inspeccionaron Worker/Access, aplicación/política, dominios, runtime, observabilidad, inventario D1 y Time Travel.
- Wrangler 4.152.0 con la sesión OAuth existente; salidas capturadas en memoria y filtradas. Cuenta del Dashboard cotejada con la única cuenta accesible de Wrangler: coincide.
- Tres GET anónimos desde Node, sin cookies ni autorización y sin seguir redirects.
- Documentación oficial consultada sobre JWT, MFA, sesiones, Version URLs, R2 y recuperación D1.

No se guardaron JWT reales, cookies, claves o datos de sesiones personales. Los IDs de cuenta, D1, aplicación, política y AUD que siguen son **metadatos de configuración**, no credenciales. Se omiten el correo personal admitido por la política y datos de otras aplicaciones de la cuenta.

## 2. Inventario confirmado y metadatos para configuración

| Campo | Valor verificado | Fuente |
|---|---|---|
| Cuenta Cloudflare | `7a8bcd7992a3de359d2aff87df2fb693` | Dashboard + coincidencia Wrangler |
| Worker DEV | `kuwago-admin-api-development` | Dashboard y API de versiones/despliegues |
| URL activa | `https://kuwago-admin-api-development.ch-jesus-99.workers.dev` | Dominios del Worker |
| Versión desplegada | `1345e9a4-c6fe-4cba-85e5-6759f3128a04` | Wrangler `versions view` |
| Fecha de versión | `2026-10-24T01:57:57.993796Z` | Metadata remota |
| Origen del despliegue | Plantilla del Dashboard; un despliegue listado | `deployments list` |
| Estado mostrado | Listo, 100% | Dashboard |
| Handler | `fetch` | Versión remota; sin `scheduled` |
| Bindings de la versión | Ninguno | Wrangler y Dashboard |
| Variables/secretos de runtime listados | Ninguno | Tabla de configuración vacía; no se reveló ningún secreto |
| Compatibility date remoto | `2026-10-24` | Dashboard y metadata |
| D1 | `kuwago-admin-db-development` | Inventario y detalle del Dashboard |
| D1 UUID | `c5cfbe44-4fd0-4c2a-83c1-b833935534ba` | Inventario + detalle D1 |
| Bucket R2 privado | `kuwago-media-development` | Wrangler |
| App Access real | `kuwago-admin-api-development - Cloudflare Workers` | Detalle de aplicación |
| App ID | `742bd449-ad58-4032-bc11-d44ab9dee3ba` | App vinculada desde el Worker |
| Política | `Kuwago Admin DEV - Acceso autorizado` | Worker y app |
| Policy ID | `052dcadb-258e-44b8-a219-1d1b20594468` | Detalle de política |
| AUD configurada de esa app | `dd73f3792def5ce94841273f79026f08e326c98d6fd98925ba0551196bb16adc` | Pestaña Access del Worker |
| Dominio de equipo / issuer para esa app | `https://blue-bread-0e64.cloudflareaccess.com` | JWKS mostrado y destino real del login anónimo |
| Endpoint JWKS configurado | `https://blue-bread-0e64.cloudflareaccess.com/cdn-cgi/access/certs` | Access del Worker; no se descargaron claves |

La ruta `/production` y la etiqueta «Producción» del Dashboard corresponden al entorno activo/default **del Worker cuyo nombre acaba en development**. No demuestran que se haya desplegado Kuwago producción ni que exista una variable `APP_ENV=development`: actualmente la tabla de variables está vacía. El futuro candidato debe seleccionar nombres/IDs exactos, sin asumir que `--env development` apunta automáticamente a este recurso.

La compatibility date local de los Workers es `2026-07-30`, distinta de la remota actual. Elegir y probar deliberadamente la fecha del próximo candidato; no adoptar otra fecha sin revisar sus efectos.

Los datos de la app actual no deben copiarse automáticamente al futuro gateway: la app está ligada **al Worker administrativo existente**, no a cualquier Worker nuevo de Kuwago.

## 3. Access, sesiones y rutas alternativas

### Protección observada

| Comprobación | Clasificación | Evidencia |
|---|---|---|
| Worker protegido por política vinculada | Confirmado | Worker Access: «Todo el tráfico» |
| Alcance de la app | Confirmado | Destino `kuwago-admin-api-development`, tipo URLs de producción y vista previa de un Worker |
| URL workers.dev activa | Confirmado | Switch de URL activa habilitado y aviso de política Access aplicada |
| URLs de versión/preview | Confirmado | Switch de previews deshabilitado; política configurada también para previews si se habilitan |
| Dominios personalizados/rutas de zona actuales | Confirmado | No hay entradas en la tabla del Worker |
| Política aplicada | Confirmado | Una política Allow, orden 1, dos reglas; no aparece Bypass ni Service Auth en esta app |
| Regla de identidad | Confirmado | Include: una dirección de correo concreta; no dominio completo/Everyone |
| Método exigido | Confirmado | Require: Login Method Google |
| Sesión de aplicación | Confirmado | `6 hours` |
| Sesión de política | Confirmado | Hereda la duración de la aplicación |
| Cloudflare One Client como autenticación | Confirmado | Desactivado en la app |
| Proveedores disponibles | Confirmado | Aceptar todos los IdP disponibles habilitado; la política observada restringe a Google |
| MFA Access | **Bloqueante, ausencia confirmada** | Política: MFA desactivado. Pestaña MFA de la app: MFA no activado para la cuenta |
| MFA de la cuenta Google | Pendiente | No se inspeccionó su configuración; Google como proveedor no acredita segundo factor |
| Sesión global SSO / cookie effective settings | Pendiente | No se inspeccionaron sesiones personales ni todos los ajustes globales |
| Claims `exp`, `iat`, `sub`, `amr` de JWT real | Pendiente de aceptación autenticada | No se capturó/decodificó un token real |

La AUD queda confirmada **como configuración de la aplicación real**. No se presenta como una verificación de los claims de un token capturado. El issuer se obtiene del dominio de equipo, consistente con el JWKS y el login observados, siguiendo la [validación JWT de Cloudflare](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

Los seis horas son duración configurada app/política; no significa que una persona deba completar nuevamente Google/MFA cada seis horas. El token global puede permitir renovar el de aplicación. Referencia: [gestión de sesiones](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/).

Según la [precedencia MFA oficial](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/mfa-requirements/), una desactivación explícita en política puede prevalecer sobre niveles superiores. No bastaría con activar MFA global sin revisar esta política y probar el requisito efectivo. No se activó ni cambió nada.

### Comprobaciones anónimas ejecutadas

Se usó `fetch(url, { redirect: 'manual' })`, sin cookies/Authorization y con timeout. Solo se retuvieron estado y origen/ruta de Location; no Set-Cookie ni parámetros de sesión.

| GET | Resultado |
|---|---|
| URL workers.dev activa `/` | **302** al login del equipo `blue-bread-0e64.cloudflareaccess.com` |
| Misma URL `/api/v1/session` | **302** al mismo login; no entrega sesión administrativa |
| `https://1345e9a4-kuwago-admin-api-development.ch-jesus-99.workers.dev/` | **404**, consistente con previews deshabilitadas |

No se siguieron redirects ni se probaron credenciales personales. El rechazo de una cuenta Google no autorizada y la admisión de la autorizada fueron comunicados en fases anteriores; no se repitieron aquí ni se presentan como pruebas actuales.

No se observó una ruta alternativa pública sin protección en los dominios/rutas del Worker auditado. Esto no acredita el futuro hostname del gateway ni una revisión exhaustiva de todas las aplicaciones/políticas de cuenta. La app muestra un resumen de vista previa «No se han asignado destinos», mientras su sección Destinos y la pestaña Worker Access sí identifican el Worker y todo su tráfico; la prueba 302 acredita protección efectiva de las rutas examinadas. No se modificó configuración para corregir ese resumen visual.

Para futuras [Version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/), conservar deshabilitación o verificar protección al habilitarlas: un 404 actual no demuestra el comportamiento de una preview futura.

## 4. D1, R2, bindings y operación remota

### D1

El Dashboard confirma nombre y UUID coincidentes en inventario/detalle y muestra **0 tablas** y 0 consultas en las últimas 24 h. No se ejecutó SQL ni se abrió una operación de migración. El esquema administrativo no aparece aplicado según esa metadata; no se leyó directamente un ledger `d1_migrations`.

Time Travel está disponible: el panel describe recuperación de hasta **30 días**, con ventana visible desde la creación de la base el 23/10/2026. No se solicitó restauración ni se capturó un bookmark como supuesto respaldo previo a una migración futura. Capturarlo de nuevo en la ventana real de intervención.

La lectura `wrangler d1 list --json` devolvió **error de autenticación/autorización Cloudflare 10000**. Esto no significa que D1 no exista: el Dashboard confirmó su ID. **Bloquea ejecutar un procedimiento CLI de migración con esa credencial tal como está**, hasta revisar capacidades y autorizar el acceso mínimo necesario o un procedimiento operador alternativo. No se generó token, cambió scope ni inició login.

El Dashboard D1 mostró, para el ciclo 12 octubre–12 noviembre: 0/25B filas leídas, 0/50M escritas y 12,29 kB/5 GB de almacenamiento en el inventario; uso facturable mostrado US$0,00. Son métricas puntuales del panel, no un hard cap monetario ni una garantía de costo del próximo despliegue. El detalle de datos muestra 0 kB; no se interpreta la diferencia de overhead/redondeo como pérdida de datos.

Los seis SQL locales 0001–0006 siguen coincidiendo con sus checksums. No se aplicaron ni local ni remotamente en esta fase. El hecho de tener metadatos exactos no autoriza la migración.

### R2

Lecturas autenticadas satisfactorias:

```text
wrangler r2 bucket list
wrangler r2 bucket dev-url get kuwago-media-development
wrangler r2 bucket domain list kuwago-media-development
```

Resultados confirmados:

- Bucket `kuwago-media-development` presente.
- Acceso público por `r2.dev`: **deshabilitado**.
- Dominios personalizados conectados: **ninguno**.
- El único nombre Kuwago visto en el listado consultado es ese bucket. No apareció un bucket de publicación. Esta lectura utiliza la jurisdicción predeterminada; no certifica ausencia en otras jurisdicciones.

No se listaron ni descargaron objetos/imágenes, no se crearon URLs firmadas, no se revisaron claves S3 y no se subió nada. Privacidad de [r2.dev y dominios personalizados](https://developers.cloudflare.com/r2/buckets/public-buckets/) son controles separados; ambos fueron consultados. Falta aprobar almacenamiento separado de publicación, retención/respaldo, permisos de operación y recuperación de objetos.

### Worker y programación

Configuración actual confirmada en el panel:

- Sin bindings; sin variables/secretos de runtime listados.
- Sin Cron Triggers, consumidores de cola ni reglas de email dirigidas a este Worker.
- Workers Logs habilitado, invocaciones y conservación en Dashboard habilitadas, muestreo 100%.
- Traces y agrupación de problemas desactivados; sin destinos de exportación disponibles y Logpush no habilitado.
- El límite CPU no mostró un valor numérico verificable en la observación utilizada. No se inventa un límite efectivo ni se da por aplicada la propuesta local.

No hay bindings indebidos en la versión actual, porque no hay ninguno. Eso no verifica los permisos de los futuros bindings ni despliega los componentes faltantes. La separación Admin/API pública/barrera/reconciliador es una implementación **local**, no una topología remota ya conectada.

La sesión Wrangler declara `user:read`, `offline_access`, `account:read`, `workers:write`, `workers_scripts:write`, `workers_routes:write`, `zone:read`. La capacidad real varía por operación: Workers y R2 respondieron; D1 no. No se deduce disponibilidad o denegación de un producto únicamente del listado de scopes. No usar esta sesión amplia como diseño definitivo de credencial CI.

## 5. Bootstrap seguro del primer Super Admin

**Pendiente y bloqueante para uso administrativo real. No se creó ninguna persona ni rol remoto.** La política Access hoy admite una sola dirección concreta; no basta para acreditar una segunda identidad independiente de revisión/recuperación.

Procedimiento a autorizar por separado:

1. Nombrar al destinatario y a un segundo humano concedente/revisor. Verificar que los accesos permitidos correspondan exactamente a esas personas, no a alias compartidos. Incorporar un segundo acceso, si procede, requiere un cambio Access aprobado aparte.
2. Obtener la identidad de cada persona mediante Access autorizado y validar criptográficamente firma, issuer, AUD y tiempos antes de extraer el par estable `issuer + sub`. No usar email como clave de autorización ni decodificar claims sin verificar. No conservar el JWT.
3. Confirmar que issuer/AUD corresponden a la app definitiva del gateway, que MFA está exigido y que la identidad coincide con la persona aprobada. La cuenta del Dashboard por sí sola no prueba un subject Access de la aplicación.
4. Preparar y probar un batch de bootstrap sobre D1 local con los seis SQL: principals explícitos, habilitación revisada, rol canónico y evento de auditoría. `administrator_roles` requiere `granted_by` distinto del destinatario; no quitar esa guarda ni inventar un concedente ficticio.
5. Revisar el batch exacto, UUID D1, identidades, rol y justificación con doble revisión. El FK/CHECK SQL no prueba consentimiento humano; registrar quién autorizó el cambio y quién lo ejecuta. Sin alta automática al primer login.
6. Autorizar y ejecutar en otra fase la operación DEV, conservando evidencia de resultado sin tokens. Verificar permisos de lectura, denegaciones y separación de aprobadores. La gestión de administradores por API sigue reservada; no asumir un panel de altas operativo.

**Revocación:** procedimiento operador auditado para deshabilitar el principal y retirar su rol; la API consulta D1 por request, incluso con JWT aún válido. Además, revocar sesiones o acceso en Access/Google cuando corresponda, con autorización propia. Revocar solo en Access no equivale a borrar sesiones ya renderizadas ni garantiza invalidación instantánea de todo JWT existente.

**Recuperación:** segundo humano autorizado y cuenta de operador con MFA, acceso mínimo de emergencia, verificación de identidad y batch auditado. No recuperar a una persona por coincidencia de email tras un cambio de issuer/sub, ni crear automáticamente otro super_admin.

## 6. Seguridad operativa y multimedia

| Elemento | Clasificación | Acción pendiente |
|---|---|---|
| Time Travel de esta D1 | Confirmado disponible | Bookmark/respaldo fresco y comprobación antes de B |
| Respaldo previo a migración | Pendiente / bloqueante para B | Inventario/exportación coherente, hashes, acceso protegido y recuperación revisada |
| Restauración coordinada D1–R2 | Probada localmente en fases anteriores | Herramienta/runbook remoto y ensayo en destino aislado por autorizar |
| Rollback | Pendiente operativo remoto | Artefacto/config anterior, pausa de escrituras y recuperación compatible; no DOWN destructivo |
| Reconciliación/Cron remoto | Bloqueante para publicación | No hay Cron actual; futuro reconciliador privado con handler y alertas |
| Alertas de gasto/fallo/retirada | Pendiente | No se verificaron reglas de presupuesto de cuenta ni entrega a un operador; Logs activos no equivalen a alertas |
| Límites de CPU/solicitudes y presupuesto DEV | Pendiente | Revisar valores efectivos por Worker/producto y acordar importes/responsables |
| R2 original privado | Confirmado | Mantener privacidad al añadir bindings; no dar acceso de bucket privado al público |
| Snapshot público | Implementado localmente | PUBLICATION separado + barrera primaria antes de exponerlo |
| Formatos multimedia DEV | **Bloqueante para habilitación general** | El servidor local acepta JPEG/PNG/WebP; no existe aún una restricción remota PNG-only acreditada |

El procesador remoto requiere `IMAGE_POLICY_VERIFIED=kuwago-png-v2` y binding IMAGES; si no valida, conserva rechazo/cuarentena. No activar ese gate por el solo éxito del PNG de 2B.7C. **JPEG no está autorizado para producción**; WebP tampoco tiene conformidad remota general aprobada. Para el primer DEV, mantener carga/procesamiento/aprobación multimedia deshabilitados o implementar/probar previamente una capacidad y allowlist restrictivas del lado servidor. El selector React no es un control de seguridad suficiente.

La única evidencia Images real sigue siendo la transformación sintética previa HTTP 200. No se ejecutó otra, ni se subieron imágenes. El permiso de 2B.7C no se reutiliza.

El outbox local conserva leases, reintentos limitados, auditoría y estados pendientes/escalados. La barrera evita servir snapshots retirados mientras R2 converge; un 202 no afirma publicación terminada. El objetivo de retirada de 120 s sigue siendo un objetivo diseñado, no SLA remoto probado.

[Time Travel D1](https://developers.cloudflare.com/d1/reference/time-travel/) no respalda los objetos R2. Antes de B, definir la ventana de escrituras congeladas, respaldo lógico/SQL, inventario y hashes de objetos, retención/cifrado, RPO/RTO y ensayo aislado. Restaurar D1 por sí sola puede dejar snapshots/objetos desalineados: mantener pausa, nueva época y revisión de aprobaciones para impedir republicación accidental. Los CLI locales actuales no deben convertirse en herramientas remotas eliminando guardas.

## 7. Clasificación final de hallazgos

### Confirmado

1. Cuenta, Worker y versión activa; sin bindings ni variables de runtime listadas.
2. workers.dev protegido; app/política vinculadas al Worker, ámbito producción y previews.
3. Previews deshabilitadas; dominio/rutas personalizados ausentes en el Worker auditado.
4. GET anónimos a raíz y ruta administrativa interceptados por Access; preview de la versión consultada no disponible.
5. AUD, app ID, policy ID, dominio de equipo/JWKS, Google obligatorio y sesión configurada de seis horas.
6. D1 existe con el UUID registrado; panel con cero tablas y Time Travel disponible.
7. R2 existe y no es público mediante r2.dev ni dominio personalizado.

### Pendiente

- Claims y caducidad de un JWT real, subject de las personas autorizadas, MFA Google, sesión global y aceptación autenticada final.
- Auditoría exhaustiva de políticas de cuenta/hostname más específicas y protección del futuro gateway.
- Credencial mínima que permita el procedimiento D1 aprobado; lectura directa del historial/esquema y respaldo fresco.
- PUBLICATION y topología remota completa; revisar jurisdicción y nombres antes de crear recursos.
- Presupuestos/alertas, CPU efectivo, retención de logs/objetos y ensayo remoto de recuperación.

### Bloqueante antes del despliegue útil

1. **MFA no exigido por Access en la configuración observada.** Debe aprobarse una política efectiva y probarse, sin cambios automáticos en esta fase.
2. **La protección actual no acredita al futuro gateway**, que será otro Worker. Resolver app, scope, origen y AUD antes de servir el Admin.
3. **D1 CLI denegado y esquema no aplicado.** No hay autorización implícita para ampliar permisos ni ejecutar SQL.
4. **Bootstrap sin identidades y concedente revisados**; hoy solo una dirección está admitida por la política examinada.
5. **Bindings, reconciliador/Cron, respaldo y rollback remoto pendientes.** El backend real aún no sustituye a la plantilla.
6. **Multimedia remota no lista para habilitación general.** Cerrar política de capacidades/formatos sin relajar cuarentena.

## 8. Información para autorizar A / B / C / D posteriormente

| Autorización independiente | Entradas concretas necesarias | Alcance propuesto y condición de salida |
|---|---|---|
| **A. Configuración** | Metadatos de §2, dominio definitivo DEV, app del gateway, AUD aprobada, MFA/sesiones, mapa de Workers y fecha de compatibilidad | Preparar candidato local; cualquier modificación Access/MFA o credencial requiere autorización explícita adicional. Cerrar P0 de identidad/protección antes de exposición |
| **B. Migraciones** | Cuenta y UUID D1 anteriores, seis SQL/checksums revisados, estado/historial fresco, acceso operador válido, respaldo y recuperación | Autorizar únicamente migraciones pendientes de esa D1 DEV, con preflight e integridad posterior. No incluir bootstrap ni restauración por defecto |
| **C. Bindings** | Mapa DB/PRIVATE_MEDIA/PUBLICATION, jurisdicción, Service Bindings de gateway/API/barrera, reconciliador y límites | Aprobar recursos faltantes y bindings exactos. Mantener API/barrera/reconciliador sin ingress público, R2 privado y multimedia cerrada. Cron se activa con handler y autorización propios |
| **D. Despliegue** | A–C cerrados, build/hashes, gateway probado, Access aplicado al destino correcto desde el primer request, presupuesto/alertas y rollback | Aprobar nombres/versiones concretos y aceptación DEV. No conectar Hostinger ni modificar DNS, no dar acceso remoto al harness de test ni publicar servicios reales |

El bootstrap y las pruebas con escrituras/restauración/Images tienen aprobaciones propias; no se incorporan implícitamente a A–D. El cambio futuro de ingress de la API existente también debe quedar nombrado: el gateway validado no convierte automáticamente en privado el workers.dev actual.

## 9. Registro de consultas y cierre

Comandos de lectura utilizados, mediante subprocess con salida en memoria y cwd temporal fuera del repositorio:

```text
wrangler whoami --json
wrangler deployments list --name kuwago-admin-api-development --json
wrangler versions view <ID obtenido> --name kuwago-admin-api-development --json
wrangler d1 list --json
wrangler r2 bucket list
wrangler r2 bucket dev-url get kuwago-media-development
wrangler r2 bucket domain list kuwago-media-development
```

También se consultaron sus ayudas y los tres GET anónimos descritos. No se usaron comandos de deploy, migración, SQL, restore, login, creación de tokens o activación. En el Dashboard solo se navegaron pestañas y detalles: no se tocaron switches/campos ni se guardó un formulario.

**Único archivo creado:** `docs/PHASE-2C2-ACCESS-DEV-VERIFICATION.md`. Sin cambios de código/configuración ni escrituras remotas, sin administradores, imágenes, Images remoto, DNS/Hostinger, suscripciones, commit o push. Se detiene para revisión.
