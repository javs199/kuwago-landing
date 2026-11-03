# Fase 2C.0 — Preparación integral para Cloudflare DEV

24/10/2026 · America/Costa_Rica · Auditoría, sin escrituras remotas.

## 1. Resumen ejecutivo

**NO-GO para desplegar hoy el Portal Admin completo. GO para preparar localmente el candidato DEV y cerrar sus configuraciones.** La implementación local supera las comprobaciones ejecutadas: **248 pruebas/comprobaciones funcionales** —152 backend, 31 Admin, 49 contratos/público y 16 recorridos E2E—, sin fallos. TypeScript, lint, builds y aislamiento también pasan.

El principal trabajo restante es de integración y operación: falta el gateway protegido del frontend, las configuraciones remotas completas, verificación actual de Access/D1/R2, bootstrap supervisado, respaldos y recuperación remotos, alertas y una política multimedia restrictiva efectivamente aplicada por el servidor.

La consulta autenticada de metadatos confirma el Worker `kuwago-admin-api-development`, con una versión de plantilla y **sin bindings** en esa versión. No se ha demostrado que el resto de los recursos remotos esté actualmente configurado como requiere el código. El Dashboard exige iniciar sesión; no se inició una nueva. Los resultados manuales previos comunicados por el usuario se conservan como antecedentes, no como comprobaciones actuales.

El PNG remoto aprobado en 2B.7C acredita **un caso sintético**, no seguridad o carga general. No se invocó Images durante esta auditoría.

## 2. Matriz GO / NO-GO

GO significa aprobado para el alcance indicado; no equivale a autorización de desplegar.

| Área | Dictamen | Evidencia / condición pendiente |
|---|---|---|
| Contratos, compilación y regresión local | GO local | Tipos, validadores, proyección pública y suites correctos |
| JWT RS256 y RBAC | GO local / NO-GO remoto | Firma, tiempos, issuer/AUD y roles probados; faltan issuer/AUD reales revisados |
| CRUD, revisiones y publicación | GO local | Transacciones, inmutabilidad, conflictos y aprobador independiente probados |
| Outbox, barrera y recuperación | GO local / NO-GO operativo remoto | Reintentos/restore probados localmente; faltan bindings, Cron, alertas y ensayo remoto autorizados |
| Admin React | GO visual/funcional local / NO-GO exposición | Build independiente; gateway y protección de assets/API no implementados para remoto |
| Configuración Wrangler remota | NO-GO | Placeholders, entrypoints bloqueados y topología incompleta |
| D1 DEV | NO-GO migración inmediata | Falta lectura de ID/estado y respaldo; existen seis migraciones, no cinco |
| R2 privado/publicación | NO-GO vinculación inmediata | Privacidad actual y segundo bucket no verificados |
| Images Binding | GO para el caso 2B.7C | Una transformación PNG HTTP 200 previa; no autoriza nuevas pruebas ni carga general |
| Multimedia administrativa | NO-GO habilitación | Allowlist actual incluye JPEG/PNG/WebP y carece de restricción DEV PNG-only |
| Primer Super Admin | NO-GO alta inmediata | Sin procedimiento ejecutable revisado ni identidades estables verificadas |
| Landing Hostinger/PWA | GO aislamiento local | Regresiones/build público correctos; no se conecta ni despliega nada |
| Dependencias Admin/backend/contratos | GO según auditoría actual | `npm audit` sin avisos en esos tres paquetes |
| Herramientas de build de landing | Pendiente independiente | Tres avisos moderados transitivos/directos en cadena Tailwind 3; no corregidos aquí |

## 3. Auditoría de repositorio y arquitectura

Raíz: `C:\Users\JV\Desktop\Kuwago Landing\grupo-kuwago-landing-source`. HEAD: `26055d6`.

Git conserva **9 archivos versionados modificados**, con 195 inserciones/71 eliminaciones, y numerosos archivos sin seguimiento en `apps/`, `infra/`, `packages/`, adaptadores, scripts y documentos. `git diff --stat` no cuenta el contenido sin seguimiento: no representa el tamaño total del backend. Se revisaron el estado/diff, los entrypoints, configuraciones, modelos y scripts relevantes sin descartar cambios. No se certifica por ello una revisión humana exhaustiva de cada línea del proyecto.

La arquitectura efectiva actual es:

```text
Landing HTML/CSS/JS → adaptador estático (Hostinger, independiente)
Admin React → /api/v1 relativo → proxy Vite/harness SOLO local
API administrativa → JWT/RBAC → D1 + PRIVATE_MEDIA + PUBLICATION
Reconciliador scheduled → D1 + PRIVATE_MEDIA + PUBLICATION
API pública → PUBLICATION + Service Binding CATALOG_BARRIER
Barrera interna → D1 primary → epoch/generación/hash/modo
```

La API pública no recibe D1 ni el bucket privado. La barrera es otro Worker: consulta mínima, sin rutas administrativas ni R2; `publicationHead()` utiliza `withSession('first-primary')` cuando está disponible. No eliminar esta dependencia para simplificar el despliegue: permite rechazar snapshots retirados o divergentes.

El Admin usa ES/EN, temas y componentes existentes. El build normal selecciona la API; la demo queda limitada a desarrollo/test. El login de prueba requiere `import.meta.env.DEV` y un flag explícito, y el endpoint `/__local-test` no aparece en el JS de producción inspeccionado. Sí permanecen textos de traducción del login de prueba; su presencia aislada no prueba una autenticación habilitada. No incluir el harness ni el normalizador sharp en un artefacto remoto.

Falta sustituir el proxy Vite por un **gateway Worker** real: servir assets protegidos y reenviar `/api/v1/*` mediante Service Binding, preservando el assertion Access original para verificarlo en la API. Mantener origen único evita abrir CORS administrativo. El proxy local no se publica con `vite build`.

Las plantillas `infra/cloudflare/wrangler.*.example.json` de 2A siguen deliberadamente bloqueadas; la candidata `dev/wrangler.remote-development.example.json` también. No basta con rellenar sus IDs: faltan `PUBLICATION`, barrera, reconciliador, gateway/assets y política multimedia. Hay nombres históricos distintos de buckets entre plantillas y configuración local; seleccionar un mapa DEV único, revisado, sin renombrar recursos existentes por inferencia.

### Migraciones y contratos

| SQL | Alcance |
|---|---|
| 0001_admin_catalog.sql | Principals, catálogo bilingüe, revisiones, opciones/precios, multimedia y auditoría |
| 0002_integrity_guards.sql | Guardas de integridad y revisiones |
| 0003_access_rbac.sql | Roles canónicos y permisos, separados de roles legacy |
| 0004_catalog_operations.sql | Operaciones de catálogo/publicación y concurrencia |
| 0005_publication_resilience.sql | Control de publicación, outbox recuperable, alertas y recuperación |
| 0006_media_lifecycle.sql | Procesamiento/ciclo multimedia, versiones, límites y guardas |

Los seis checksums coinciden con `packages/database/migrations.sha256.json`. Tests locales verifican creación desde cero, actualización con datos/revisiones previas, integridad referencial y rollback ante fallos. **La base persistente habitual `.wrangler/state/development` tiene 0006 pendiente**, según `migrations:list:local`. No se aplicó para homogeneizarla durante esta auditoría. El destino separado de `verify:migrations` no tiene pendientes; esto no acredita la base habitual ni la remota.

Los contratos compartidos producen ESM y tipos; separan datos administrativos y públicos, moneda explícita, traducciones, revisiones y estados. El marketplace sigue estático y no usa la futura API como fallback silencioso. Sus importes de referencia no se convierten en precios comerciales confirmados.

## 4. Recursos: evidencia actual y pendientes

Se emplearon exclusivamente lecturas de Wrangler: `whoami --json`, `deployments list --name kuwago-admin-api-development --json` y `versions view <versión obtenida> --name kuwago-admin-api-development --json`. Salidas sanitizadas; sin tokens, emails ni IDs publicados en este informe.

| Recurso | Evidencia | Estado |
|---|---|---|
| Cuenta Wrangler | OAuth existente válido; una cuenta accesible | Comprobado hoy; cotejar ID privadamente con los recursos antes de escribir |
| Worker admin DEV | Un despliegue, creado 2026-10-24T01:57:57.993796Z, origen `dash_template` | Comprobado; versión con `fetch`, sin bindings |
| Código remoto | Metadatos de plantilla | No se descargó el código; no se certifica su contenido exacto como Hello World |
| Access «Kuwago Admin DEV - Acceso autorizado» | Usuario informó pruebas de cuenta autorizada/no autorizada/anónimo | Antecedente; política efectiva actual no leída |
| D1 `kuwago-admin-db-development` | Creación/base vacía comunicadas previamente | ID, tablas, historial, tamaño, backup y estado actual pendientes de lectura |
| R2 `kuwago-media-development` | Privacidad comunicada previamente | Confirmar `r2.dev` deshabilitado y ausencia de dominios públicos actuales |
| Bucket PUBLICATION | Existe solo en configuración/fixtures locales inspeccionados | No hay confirmación de recurso remoto. Aprobar creación separada si falta |
| Barrera / reconciliador / catálogo / gateway | Implementación local o gateway pendiente | Sin confirmación de recursos remotos; no asumir que ya existen |
| Images | Evidencia 2B.7C: un PNG, HTTP 200, 1 transformación y 2 info | Acceso probado entonces; cuota/factura y conformidad ampliada pendientes |
| Cron | `* * * * *` en reconciliador local | Trigger remoto no consultado; versión admin actual no tiene handler scheduled |
| Rutas, dominios, previews y protección workers.dev | Plantillas proponen ingreso cerrado | Estado remoto efectivo pendiente; un flag local no lo demuestra |
| Límites, alertas y logs | Implementación local y planes | Configuración/entrega remota no comprobadas |

Scopes declarados de Wrangler: `user:read`, `offline_access`, `account:read`, `workers:write`, `workers_scripts:write`, `workers_routes:write`, `zone:read`. No declara lecturas específicas de Access/D1/R2/Billing/Images. Se pudo leer metadata Workers; no se dedujo permiso para los otros productos ni se extrajeron credenciales para intentar llamadas no disponibles. No se generaron tokens ni se inició login.

El Dashboard redirigió a `/login`. Se detuvo esa vía sin pulsar el acceso de Google. Esto deja una **limitación concreta de evidencia**, no significa que Access, D1 o R2 estén ausentes.

### Access, identidad y primer administrador

Antes de exposición, registrar privadamente: app ID, dominio de equipo/issuer, AUD, dominios/rutas protegidas, políticas Allow/Require/Exclude/Bypass acumuladas, miembros individuales, MFA y duraciones efectivas de sesión y MFA. Login Google por sí solo no acredita MFA. Propuesta para revisión: sesión de aplicación de una hora y MFA en cada login, usando métodos fuertes disponibles; no se presenta como configuración aplicada. Referencias: [MFA](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/mfa-requirements/) y [sesiones](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/).

Proteger página, assets, API y URLs alternativas. [Version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/) necesitan deshabilitación o cobertura Access explícita; no suponer que una política de workers.dev cubre todas. La API interna, barrera y reconciliador deben quedar sin ingress público; cualquier cambio respecto del Worker existente requiere aprobación concreta.

El backend valida firma RS256, issuer exacto, AUD, exp/iat/nbf y `issuer+sub`, con JWKS restringido y rotación acotada. Consulta principal habilitado y rol en D1 y revalida permisos dentro de transacciones. No confía en email, roles enviados por React ni JWT en localStorage.

Resolver la audiencia antes de escribir configuración: si el gateway recibe JWT de una nueva app Access, la API interna debe validar esa audiencia aprobada. La AUD de la app antigua del endpoint API no tiene por qué coincidir. No aceptar cualquier AUD para solucionar un 401. [Access no propaga `ctx.access` por Service Bindings](https://developers.cloudflare.com/workers/configuration/cloudflare-access/#ctxaccess-limitations); el backend seguirá verificando el assertion original. Para assets, aplicar la protección Access y el control del gateway con [`run_worker_first`](https://developers.cloudflare.com/workers/static-assets/binding/), sin depender de `ctx.access` detrás del router de assets.

Bootstrap pendiente, con autorización propia:

1. Verificar dos identidades humanas individuales mediante tokens Access válidos, extraer `issuer+sub` sin guardar tokens. No usar un alias de correo como autorización.
2. Preparar un batch revisado que inserte principals y asigne el primer `super_admin`; `administrator_roles` exige `granted_by` distinto del destinatario. No autoasignar ni inventar al segundo actor.
3. Acordar quién será concedente y segundo administrador/revisor; registrar revisión independiente y auditoría. Las claves foráneas no demuestran por sí mismas consentimiento del concedente.
4. Probar el batch y la revocación localmente; autorizar el SQL exacto, cuenta/D1 y personas antes de ejecutar remotamente. Sin cambios de guardas ni seed automático al primer login.
5. Comprobar acceso, denegación de editor y capacidad de recuperación. El endpoint de gestión de administradores sigue reservado: no existe todavía un panel de altas/roles operativo.

## 5. Bloqueantes por prioridad

| Prioridad | Hallazgo | Criterio de cierre |
|---|---|---|
| P0-01 | Access y cobertura efectiva sin verificar | Evidencia actual de app/políticas/AUD/issuer/MFA/sesiones; pruebas negativas planificadas para cada hostname |
| P0-02 | Gateway Admin remoto no implementado | Assets y API bajo protección, assertion reenviado y verificado, origen único; pruebas locales del gateway y preview |
| P0-03 | Configuraciones remotas incompletas | Candidato DEV único con entrypoints reales, IDs verificados, mapa de bindings y sin staging/producción seleccionables accidentalmente |
| P0-04 | D1/R2 y recuperación remotos sin preflight | Estado leído, seis SQL/checksums, respaldo verificable, destino de recuperación y runbook revisados |
| P0-05 | Bootstrap sin personas/procedimiento concreto | Identidades estables, doble revisión, batch auditado y autorización separada |
| P0-06 | Multimedia acepta más que lo validado remotamente | Deshabilitar procesamiento/carga o aplicar allowlist PNG por servidor y pruebas; no activar por el solo HTTP 200 anterior |
| P1-01 | Cron, alertas y límites aún no operativos | Reconciliador privado desplegable, disparo real comprobable, alertas entregadas al responsable y presupuesto aprobado |
| P1-02 | Estado Git sin artefacto reproducible de liberación | Inventario de fuentes/lockfiles/hash de bundles, candidato revisado y rollback fijado. No exige commit en esta fase |
| P1-03 | Copy del Admin todavía dice API/D1 local | Distinguir DEV remoto y fallos Access sin mensajes de éxito incorrectos; no cambiar el diseño |
| P2-01 | Avisos de dependencias de build público | Evaluar reparación compatible separada, sin migración mayor automática |
| P2-02 | Documentación histórica con estados/nombres antiguos | Acompañar el candidato con mapa actual; no tratar READMEs antiguos como inventario efectivo |

## 6. Resiliencia, respaldo y operación

La publicación usa commit D1 con auditoría y outbox; R2 no comparte transacción. La entrega tiene leases persistentes de 30 s, compare-and-swap, snapshots por época/generación/hash, reintentos acotados a ocho y backoff hasta 900 s. Los eventos no se eliminan silenciosamente: pueden quedar `pending`, `delivered`, `superseded`, `escalated` o `quarantined`.

Un 202 indica materialización pendiente. En retirada, la barrera de lectura rechaza copia obsoleta con 503; no se declara retirada completada por el mero commit D1. Se comprueba nuevamente la cabeza antes de entregar catálogo/media. Objetivo propuesto de convergencia: 120 s con dependencias sanas; no SLA ni garantía remota medida. Hay alertas persistentes y logs para antigüedad, fallos e intentos agotados, pero **no integración remota de notificación acreditada**.

Restore local conserva historia, cambia época, pausa el destino, revoca aprobaciones y retira publicaciones a borrador para impedir republicación accidental. Incluye verificación de referencias, hashes y archivo multimedia. Límites observados del código: backup lógico restaurable de 20 MB; archivo multimedia de hasta 50 MB/1.000 entradas y control de 70 MB serializados al restaurar. El snapshot público limita aproximadamente 1 MB. Medir crecimiento antes de ampliar tráfico.

El CLI de recuperación actual usa Miniflare y destinos locales; **no es una herramienta remota lista para ejecutar**. Falta procedimiento de operador remoto equivalente, probado en un destino DEV aislado y autorizado. No convertirlo quitando sus guardas locales.

Antes de migrar remotamente: inventariar D1 y R2 en la misma ventana, congelar escrituras, capturar bookmark D1, exportar/resguardar SQL y objetos privados/publicación con hashes, proteger las copias y comprobar lectura/restauración. [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) ofrece hasta 30 días en Workers Paid y 7 en Free; no respalda R2 y no debe presentarse como clonación automática. Su disponibilidad concreta sigue pendiente de cuenta. No asumir versionado automático de objetos R2.

Acordar propietario, RPO/RTO, retención, borrado, cifrado y canal de alertas. Recomendar alertas de gasto al 50/80/100% del presupuesto aprobado y de retirada >120 s, outbox escalada, Cron ausente y fallos 5xx. Son propuestas; no alertas activadas ni hard caps. Limitar CPU, solicitudes, imágenes, frecuencia, almacenamiento y gasto por producto. Hay límites multimedia locales, pero no rate limiting global completo de todas las rutas.

Rollback seguro: cerrar exposición/mutaciones, preservar evidencia, detener reconciliación si peligrosa y reponer un artefacto compatible. Un rollback de código no revierte D1/R2 ni audiencias Access. Ante corrupción, recuperación coordinada a destino aislado, pausa, nueva época, verificación y reactivación vacía revisada; sin DOWN destructivo ni republicación del snapshot antiguo. Volver a la plantilla anterior solo sería modo mantenimiento, no recuperación de datos.

## 7. Política multimedia temporal propuesta para DEV

- Primer despliegue: **carga/procesamiento/aprobación multimedia deshabilitados**, sin datos reales. Configuración de Images, si se prepara, no autoriza invocarlo.
- Después de autorización separada: solo PNG sintético bajo cuotas pequeñas, con preflight estricto, firma/MIME, CRC/chunks/stream, máximo 2 MiB, 4096 por eje y 8 millones de píxeles. Fallo operativo o de validación conserva cuarentena.
- El código actual permite entrada JPEG y WebP además de PNG; cambiar el selector del frontend no basta. Hace falta una restricción del lado servidor y una capacidad separada de habilitación: hoy `MUTATIONS_ENABLED` agrupa mutaciones y no existe un interruptor específico suficiente para toda multimedia.
- No activar `IMAGE_POLICY_VERIFIED=kuwago-png-v2` como sustituto de esa restricción y de la revisión. No usar sharp/`nodejs_compat` como procesador remoto de respaldo.
- Aprobación de uso independiente, control de propiedad, revisión inmutable y barrera se conservan. Validación técnica no acredita derechos de imagen.
- **JPEG no autorizado para producción**; tampoco hay conformidad remota general de WebP. Faltan corpus adversarial real, metadatos/orientaciones, límites, fallos del proveedor, latencia/memoria/CPU y carga. Esas pruebas requieren nueva autorización de consumo; el permiso de una transformación 2B.7C está agotado.

## 8. Evidencias y comprobaciones ejecutadas ahora

| Comprobación | Resultado |
|---|---|
| Backend `node --test test/*.test.mjs` | **152/152**, cero fallos/omitidas; contador Node incluye contenedores como fases anteriores |
| Admin Vitest | **31/31**, cinco archivos |
| Público/contratos | **49/49**: assets 3, loader 4, PWA 24, catálogo 6, contratos 12 |
| E2E Admin/API/D1/R2 simulados | **16/16**, sin errores de consola; alta/edición, reviewer, publicación/retirada, 202, 409, roles/JWT y multimedia local |
| TypeScript | Backend, Admin y contratos correctos |
| Lint | Backend, Admin, contratos y catálogo público correctos |
| Builds | Worker/esbuild, Admin/Vite, contratos y landing/Tailwind correctos |
| Wrangler local | Cuatro dry-runs: admin, público, barrera y reconciliador; sin uploads |
| Migraciones | Seis checksums correctos, cadena nueva/actualización en tests; destino de verificación sin pendientes y base habitual con 0006 pendiente |
| Aislamiento | `verify:isolation` correcto: landing y Admin en salidas distintas, sin datos/contratos administrativos en runtime público |
| Secretos | 207 archivos de texto tracked/untracked no ignorados inspeccionados por patrones; cero hallazgos, cero archivos privados `.env`/`.dev.vars` versionados detectados |
| Dependencias | `npm audit`: Admin/contratos/backend cero; raíz tres avisos moderados, sin altos/críticos |
| Lecturas Cloudflare | Sesión y metadatos de versión/despliegue Workers correctos; productos/políticas restantes pendientes |

Escaneo de secretos limitado al árbol actual y patrones de claves privadas, tokens literales, JWT y credenciales conocidas; no es un escaneo de toda la historia ni prueba de ausencia absoluta. No se leyeron ni imprimieron secretos de la cuenta. Los IDs/AUD/issuer son metadatos, no contraseñas; los futuros tokens de despliegue deben permanecer fuera de Git y de variables `VITE_*`.

El aviso de raíz afecta `tailwindcss`, `postcss-nested` y `postcss-selector-parser`; el advisory subyacente informado es [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), complejidad de parseo/agotamiento de CPU. La reparación propuesta por npm incluye salto mayor de Tailwind. No se ejecutó `audit fix`, instalación ni actualización; el CSS estático público no utiliza ese parser en el navegador. Evaluación aparte del candidato Admin.

Los E2E guardan capturas actuales `desktop-light.png`, `desktop-dark.png`, `mobile-light.png` y `mobile-dark.png` en `infra/cloudflare/dev/.wrangler/admin-e2e/`; no se compararon manualmente con Stitch durante esta auditoría. Archivos antiguos, como `failure.png`, pueden permanecer en esa carpeta y no forman parte del resultado exitoso actual.

Los builds regeneraron salidas locales ignoradas; el estado de los nueve archivos versionados modificados permaneció igual. El único archivo fuente/documental añadido por esta fase es este informe. No se corrigieron hallazgos durante la auditoría.

## 9. Procedimiento de despliegue con autorizaciones independientes

No hay una configuración ejecutable remota aprobada todavía. Los pasos siguientes son un runbook de aprobación, no comandos a ejecutar ahora. Cada paso requiere evidencia del anterior y detenerse ante discrepancias.

### A. Credenciales, identidad y configuración

1. Preparar y probar **localmente** gateway, política multimedia y candidatos Wrangler DEV. Mantener los wrappers locales intactos y sin selección accidental de staging/producción.
2. Con acceso autorizado de lectura, cotejar cuenta, recursos, D1 ID, políticas, rutas, issuer/AUD, sesiones, MFA, cuota y límites. Completar el inventario real.
3. Definir credencial de operador/CI de mínimo privilegio solo sobre DEV. La sesión OAuth amplia actual no es la credencial CI. No se necesita un token S3 para un Worker con binding R2 ni un JWT permanente en React.
4. Revisar diff de configuración y artefactos, incluyendo headers, CSP, assets.directory y cache privado/no-store. No servir la raíz del repositorio.
5. Autorizar por separado cualquier creación/rotación de credenciales o cambio de Access requerido. Una autorización de deploy no habilita cambios implícitos de identidad o seguridad.

**Salida:** candidato local reproducible, matriz de permisos y evidencia actual de protección desde el primer request. A no crea administradores.

### B. Respaldo y migraciones D1 DEV

1. Verificar la D1 exacta, historial `d1_migrations`, tablas y ausencia/presencia de datos; no asumir que está vacía por el antecedente.
2. Pausar escrituras de la versión vigente y preparar/exportar respaldo/bookmark e inventario R2 coherente. Verificar el destino y acceso a copias.
3. Solicitar autorización de **D1 DEV identificada y seis migraciones/checksums exactos**, no de «todas las bases». Aplicar solo las pendientes, sin editar las ya aplicadas.
4. Comprobar historial, foreign keys, integridad, conteos y preservación de revisiones; si falla, mantener mantenimiento y seguir el plan autorizado de recuperación.

**Salida:** esquema 0001–0006 comprobado y respaldo recuperable. Bootstrap de personas es una autorización adicional, no un efecto de migrar.

### C. Buckets, bindings Images/R2 y Cron

1. Confirmar privacidad del bucket existente y aprobar creación del bucket de publicación DEV si falta; sin compartir objetos con staging/producción.
2. Revisar mapa: API y reconciliador tienen DB/PRIVATE_MEDIA/PUBLICATION; barrera solo DB; catálogo solo PUBLICATION/CATALOG_BARRIER; gateway solo ASSETS/ADMIN_API. Los bindings R2 no proporcionan por sí mismos ACL de solo lectura: cuentan el código, aislamiento y ausencia de rutas de escritura.
3. Preparar IMAGES únicamente donde corresponda, con multimedia deshabilitada inicialmente. No ejecutar una transformación de comprobación bajo esta autorización.
4. Aprobar trigger del **reconciliador**, no del Worker administrativo sin scheduled. Configuración de bindings/Cron se materializa con el despliegue autorizado D; no adjuntar un trigger a código sin handler.
5. Preparar alertas, límites y responsable. La política de [R2 público](https://developers.cloudflare.com/r2/buckets/public-buckets/) exige revisar tanto dominios personalizados como `r2.dev`; deshabilitar uno no protege el otro.

**Salida:** recursos DEV y diff de bindings/triggers aprobados. Activar productos de pago requiere aprobación propia si apareciera un requisito nuevo.

### D. Despliegue controlado del backend

1. Confirmar A–C, backup, hashes de bundles y rollback de configuración/código. Autorizar **nombres, cuenta, artefactos y capacidades exactos** de los Workers involucrados.
2. Desplegar barrera sin ingress, API privada con mutaciones inicialmente cerradas, reconciliador privado y catálogo DEV restringido. Incorporar los bindings revisados; comprobar que ninguna URL alternativa exponga datos.
3. Activar Cron solo con código y alertas preparados. Su primer ciclo puede escribir la materialización vacía: esa escritura debe estar expresamente incluida. No confiar en que crear el trigger demuestre ejecución; [su propagación puede tardar hasta 15 minutos](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
4. Verificar versión, bindings, scheduled y límites mediante lectura. Abrir capacidades de escritura solo según autorización y después de probar denegaciones.

**Salida:** backend DEV privado, sin Hostinger conectado y sin servicios comerciales publicados.

### E. Admin React protegido

1. Probar primero el gateway completo localmente y resolver audiencia/origen. Preparar build normal sin harness, flags de test, sourcemaps sensibles o token embebido.
2. Acreditar protección Access de frontend/assets/API antes del primer request remoto. Para DEV puede usarse workers.dev protegido, sin trasladar nameservers; no inventar una URL existente. Si se exige dominio propio, su configuración/DNS es autorización separada.
3. Autorizar deploy del gateway/Admin y su Service Binding. Revisar que API privada no obtenga ingress accidentalmente y que previews estén cerrados o cubiertos.
4. Ejecutar bootstrap separado únicamente tras aprobar personas, SQL, auditoría y recuperación. La pantalla de login de prueba nunca se despliega como autenticación.

**Salida:** acceso a Admin DEV bajo Access y RBAC, con cambios de contexto visuales veraces y sin alterar landing/correo/PWA.

### F. Aceptación y rollback

1. Aprobar un plan de fixtures y escrituras DEV: usuario permitido, no permitido, sin JWT, firma/AUD/issuer erróneos, deshabilitado, editor/admin/super_admin, CSRF, conflicto y endpoint directo.
2. Recorrer drafts/revisiones/aprobación independiente, publicación sincronizada, 202 realista, retirada, barrera y Cron. Para multimedia deshabilitada, comprobar rechazo; cualquier prueba Images requiere **presupuesto y número nuevos** explícitos.
3. Verificar cuota y alertas efectivamente recibidas. Hacer ensayo de fallo/recuperación en un destino DEV aislado con autorización que nombre los recursos; no restaurar la D1 activa por comodidad.
4. Ensayar rollback compatible, pausa y restitución de acceso; comprobar que no reaparece contenido retirado ni se pierden revisiones/auditoría. Registrar RPO/RTO medidos y pendientes.
5. Declarar GO solo para las capacidades aceptadas. Mantener marketplace Hostinger en su fuente estática hasta otra fase autorizada.

## 10. Decisión y autorizaciones pendientes

Siguiente trabajo recomendado: **fase local de cierre del gateway, configuración DEV única y política de capacidades/multimedia**, más lectura supervisada de Access/D1/R2. Después presentar el candidato concreto para A; no saltar directamente a B o D por haber pasado tests.

Se requieren aprobaciones independientes para credenciales/cambios Access, respaldo/exportación y migraciones DEV, recursos/bindings/Cron, despliegue backend, deploy Admin, bootstrap y aceptación con escrituras/restauración. Nuevas operaciones Images tienen autorización propia. Ninguna de ellas se deduce de este informe ni del ensayo 2B.7C.

Sin despliegues, migraciones remotas, nuevos administradores, transformaciones remotas, activaciones de pago, cambios de Access/DNS/Hostinger, commit ni push. Se detiene para revisión.
