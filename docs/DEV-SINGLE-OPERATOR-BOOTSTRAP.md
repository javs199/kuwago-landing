# Kuwago DEV — identidad y bootstrap de operador único

26/10/2026 · America/Costa_Rica. **Preparación local para revisión. NO-GO para escritura remota.**

## Alcance y evidencia remota de lectura

Se resolvió el bloqueo de navegación abriendo el destino explícito de la cuenta en el navegador integrado. Su sesión Dashboard ya estaba disponible; no se automatizó Google/MFA, no se extrajeron cookies ni JWT de autenticación y no se crearon credenciales. Solo se navegaron pantallas existentes. La autenticación posterior en el Worker fue realizada personalmente por Jesús.

| Elemento | Evidencia observada en esta revisión | Estado |
|---|---|---|
| Cuenta | `7a8bcd7992a3de359d2aff87df2fb693` | Confirmado |
| Worker | `kuwago-admin-api-development`, versión visible `1345e9a4`, despliegue manual de hace dos días | Confirmado |
| App Access | `742bd449-ad58-4032-bc11-d44ab9dee3ba`, `kuwago-admin-api-development - Cloudflare Workers` | Confirmado |
| Alcance | Worker Access: **Todo el tráfico**, URL activa y previews | Confirmado |
| Política | `052dcadb-258e-44b8-a219-1d1b20594468`, `Kuwago Admin DEV - Acceso autorizado`, una Allow, dos reglas | Confirmado |
| Reglas | Include email exacto `ch.jesus.99@gmail.com`; Require Login Method Google | Confirmado |
| Reutilización | Misma política en app del Worker y App Launcher; no equivale a una política nueva ni a rol D1 | Confirmado |
| Sesión | Aplicación seis horas, política hereda aplicación | Confirmado |
| MFA | Política respeta configuración; aplicación selecciona MFA personalizado, aplicación autenticadora, seis horas | Confirmado; corrige evidencia antigua |
| MFA global | La pantalla de aplicación indica que globalmente no se exige; la aplicación tiene override personalizado | Confirmado; no confundir ambos niveles |
| Issuer | `https://blue-bread-0e64.cloudflareaccess.com` | Confirmado como configuración |
| AUD del Worker actual | `dd73f3792def5ce94841273f79026f08e326c98d6fd98925ba0551196bb16adc` | Confirmado como configuración |
| JWKS | Issuer + `/cdn-cgi/access/certs` | Confirmado como configuración; sin token real validado en este proceso |
| URL activa | `https://kuwago-admin-api-development.ch-jesus-99.workers.dev/` | Confirmado |
| Previews | Deshabilitadas en Dominios, además incluidas en alcance Access | Confirmado |
| Dominios/rutas personalizados del Worker | Tabla sin entradas | Confirmado |
| Bindings/variables del Worker | Sin vinculaciones conectadas; tabla de variables sin entradas | Confirmado |
| Cron/colas del Worker | Ninguno configurado | Confirmado |
| Compatibility date | Remota `2026-10-24`, local `2026-07-30` | Diferencia pendiente para candidato futuro |
| Admin/gateway real | El Worker inspeccionado no tiene ASSETS, ADMIN_API, D1 ni R2 vinculados | La integración local no está desplegada en ese Worker |

No se inspeccionó el contenido de otros proyectos. El inventario inicial de usuarios era de cuenta; solo se abrió el detalle del usuario autorizado, sin exportar el inventario. No se guardan IP, ID de sesión, URLs transitorias de login ni contenido de otras identidades en este informe.

## Identidad comprobada y límite de la evidencia

Destinatario designado expresamente por el usuario: **Jesús Vargas**, `ch.jesus.99@gmail.com`. Único operador; **no hay otra persona concedente/revisora**.

El detalle Access de esta cuenta relaciona nombre/correo con ID de usuario `57fd05c6-e0f3-5838-8e16-4ab77d8dff41`. La vista Last Seen Identity relaciona ese mismo `user_uuid`, la cuenta correcta y proveedor `google`. El ID numérico de Google **no** se adopta como subject de Access.

Después de que Jesús confirmó su autenticación, la vista pasó de cero a **una sesión activa de la app exacta del Worker**, con inicio visible el 26/10 a las 00:41, vencimiento 06:42 y último uso del autenticador a las 00:42. Son tiempos mostrados por Dashboard, no una lectura local del claim `exp`.

Según la [documentación oficial de application tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/), `sub` es el ID de usuario por cuenta y `user_uuid` identifica al usuario en Get-Identity. Así queda identificado el par de configuración:

```text
issuer = https://blue-bread-0e64.cloudflareaccess.com
subject = 57fd05c6-e0f3-5838-8e16-4ab77d8dff41
```

**Límite:** se verificó la asociación por Dashboard autenticado y la sesión de esa app; **no se capturó ni verificó criptográficamente un JWT real en el proceso local**. Ese último control continúa pendiente antes del bootstrap. La sesión del navegador personal no se comparte automáticamente con otra pestaña/superficie del navegador integrado. No se pide repetir MFA ni enviar secretos por chat.

El nuevo verificador local reutiliza `createAccessVerifier` (RS256/JWKS, issuer, AUD, tiempos) y solo después de verificar la firma comprueba email exacto y subject esperado. No acepta una dirección de correo sola ni un objeto JSON fabricado como evidencia. La evidencia devuelta no contiene el token y caduca como capacidad de preparación en cinco minutos o antes si vence el token.

## Concedente distinto: SQL frente a propuesta humana

`0003_access_rbac.sql` exige `administrator_roles.principal_id <> granted_by`, con ambos referenciando `principals`. **No exige que ambos principals sean personas, que el concedente tenga rol o esté habilitado.** `principals.issuer`/`subject` son texto con unicidad, sin restricción de issuer a Access en SQL.

El requisito previo de un segundo humano fue una propuesta de procedimiento, no una obligación de Cloudflare ni una consecuencia literal del CHECK. Se conserva su historia en el documento anterior y se propone reemplazarla solo para el alta inicial de este operador único. La autorización para preparar esta propuesta **no autoriza su ejecución remota**.

Propuesta compatible con el esquema ya aplicado, **sin migración nueva ni cambios a 0001–0006**:

| Principal | Representación | Habilitado | Roles |
|---|---|---|---|
| Jesús | Issuer Access y subject verificados; ID derivado de hash del par | 1 | Un `super_admin` canónico |
| Ejecutor técnico inicial | Issuer no interactivo `urn:kuwago:technical:bootstrap:development`, subject = UUID de operación, ID `bootstrap:<UUID>` | 0 | Ninguno, ni canónico ni legacy |

El actor técnico no es otra persona, no es un usuario Access, no inicia sesión, no tiene claves, no aprueba comercialmente y nunca recibe `admins:manage`. Su registro permanece deshabilitado como referencia de auditoría y FK; no es un privilegio permanente. El backend exige un issuer Access verificado, principal habilitado y rol canónico: se probó que rechaza a este actor con 403.

`granted_by` apunta al **ejecutor técnico**; no se etiqueta como revisor independiente. `audit_events.actor_id` también identifica ese ejecutor, y `action` declara `single_operator` más el hash de la referencia de autorización humana. `request_id` contiene el UUID de operación. La referencia externa debe enlazar la autorización real de Jesús y el lote exacto; un hash solo **no prueba** consentimiento ni una aprobación independiente.

No se requiere un Super Admin previo: el futuro operador de D1 ejecutaría este procedimiento inicial excepcional con autorización externa, no mediante un endpoint de autoservicio que eluda RBAC. Esta propuesta no cambia los controles de revisión comercial independiente del catálogo; el operador único todavía no podrá aprobar su propia revisión cuando el contrato exija otro administrador.

## Lote concreto preparado localmente

`infra/cloudflare/dev/scripts/single-operator-bootstrap.mjs` es un preparador y adaptador de ensayo. **No contiene transporte Cloudflare, CLI remota ni captura de credenciales.** `remoteBootstrapEnabled=false`. Los gates anteriores continúan en falso.

Entradas obligatorias: receipt auténtico `createReader.inspect(6)`, snapshot completo y fingerprint comprobado independientemente, identidad criptográficamente verificada, UUID nuevo y SHA-256 de la futura autorización. Actualmente no se inventan UUID autorizado, token ni permiso remoto para completarlas.

Orden exacto del único batch parametrizado propuesto:

1. Guardar por SQL el esquema completo esperado y el historial exacto `0001–0006`.
2. Guardar **todas las tablas y filas** del snapshot, incluidas semillas, `d1_migrations`, `publication_control` y `sqlite_sequence`, antes de cualquier alta. Una condición falsa o NULL provoca fallo NOT NULL y rollback del batch; no se crea una tabla de guarda adicional.
3. `INSERT INTO principals(id,issuer,subject,enabled) VALUES (actorId,technicalIssuer,executionId,0)`.
4. `INSERT INTO principals(id,issuer,subject,enabled) VALUES (recipientId,verifiedIssuer,verifiedSubject,1)`.
5. `INSERT INTO administrator_roles(principal_id,role_id,granted_by) VALUES (recipientId,'super_admin',actorId)`.
6. `INSERT INTO audit_events(...)` con actor técnico, acción explícita de operador único, referencia de autorización, destinatario, UUID y outcome `allowed`.

No hay INSERT OR REPLACE, email lookup, UPDATE a cuentas existentes, publicación de servicios ni bootstrap general de usuarios. Solo se admite la primera instalación con principals, asignaciones y auditoría vacíos; diferencias requieren revisión, nunca una adopción silenciosa de la respuesta remota.

Postflight preparado: exactamente dos principals con identidad/habilitación esperadas, una asignación canónica y concedente distintos, un evento exacto, ningún rol legacy, esquema e historial sin cambios, comparación exacta de todas las tablas ajenas al alta e integridad referencial. `administratorFor` debe autorizar a Jesús y denegar al actor técnico. Los timestamps generados por SQL no se presentan como prueba de aprobación.

## Límites y preparación pendiente para operar remotamente

- La preparación/consumo actual es **en memoria para ensayo local**, no un permiso durable entre procesos. No se conecta el módulo a los transportes remotos de migración ni se reutilizan sus autorizaciones consumidas.
- Antes de una ejecución remota falta implementar/revisar la envoltura durable específica: destino fijo, UUID sin consumir, hashes de fuentes/lote/identidad/baseline/autorización, captura privada, marcador `started` anterior al envío, máximo un envío, registro de respuesta, cierre persistido y lectura de verificación. Si ocurre ambigüedad, solo reconciliación de lectura; no reenvío.
- El snapshot debe comprobarse antes y después de las lecturas y quedar coherente. Se conservará la guarda de bookmark del ejecutor, pero ningún par de consultas aisladas evita por sí solo todas las carreras. Las guardas de contenido dentro del batch detectan diferencias en el estado al aplicar; no detectan una escritura concurrente que cambie y vuelva exactamente al estado anterior (ABA).
- No hay transacción D1–R2 ni garantía sobre escrituras posteriores al commit. Este alta solo afecta D1; no procesa ni publica imágenes.
- Antes del alta se debe aprobar recuperación para el estado 6: el último export completo existente es etapa 4. Checkpoints 5/6 no se declararán respaldos completos; **NO-GO si el plan exige una nueva exportación y no está autorizada/verificada**. Aquí no se exportó nada.
- No se afirma que el gateway futuro esté cubierto por la app actual. Faltan origen canónico, elección del destino protegido, audiencia del gateway si cambia, configuración privada de API y despliegue autorizado. Las plantillas locales vacías siguen fallando cerradas.

## Validación dirigida

Ejecutado desde `infra/cloudflare/dev`:

```text
node --test test/single-operator-bootstrap.test.mjs
node ../../../apps/admin/node_modules/eslint/bin/eslint.js scripts/single-operator-bootstrap.mjs test/single-operator-bootstrap.test.mjs --config ../../../apps/admin/eslint.config.js --max-warnings 0
```

Resultado: **6/6 tests PASS**, lint dirigido PASS. Incluyen JWT exclusivamente sintético RS256 (email/subject/AUD/issuer/exp incorrectos), falta de JWT, lote completo en D1 local Miniflare, RBAC del destinatario y denegación del técnico, CHECK intacto, auditoría inmutable, concurrencia, segundo bootstrap, receipt falso, fingerprint incorrecto, snapshot incompleto, respuesta ambigua sin reintento y rollback de error SQL tardío. Los seis SQL originales se usan sin modificaciones; no se repitió la suite global ni builds/migraciones remotas.

## Matriz de decisión y próxima operación

| Control | Estado |
|---|---|
| Destinatario humano y condición de único operador | Confirmado por Jesús |
| Cuenta, issuer, ID Access, proveedor y nueva sesión/MFA | Confirmado por Dashboard en lectura |
| JWT vivo verificado criptográficamente en captura privada local | Pendiente |
| Actor técnico admitido por esquema; CHECK distinto preservado | PASS local, propuesta pendiente de revisión para ejecución |
| Lote y fallos relevantes | PASS local |
| Envoltura remota durable y cierre verificable | Pendiente; bloquea escribir |
| Recuperación vigente estado 6 y preflight fresco | Pendiente; bloquea escribir |
| Creación remota y despliegues | No autorizados; bloqueados |

**Próxima acción:** revisar esta propuesta y completar la captura/verificación privada criptográfica y el ejecutor durable, sin escribir todavía. Después, si recuperación y preflight pasan, una autorización separada podría permitir **un único batch de bootstrap en esta D1 DEV** que cree el principal de Jesús, su único rol y el actor técnico deshabilitado con auditoría. No incluye nuevos Access users, políticas, servicios, producción, gateway/deploy ni otras bases.

Para la verificación pendiente no se requieren nombres de otras personas ni secretos por chat. El mecanismo privado debe entregar el JWT exclusivamente al verificador local ya reutilizado; no vale copiar claims a mano. No se solicita esa captura ni una credencial de escritura en este cierre.

## Archivos de esta preparación

- Nuevo preparador: `infra/cloudflare/dev/scripts/single-operator-bootstrap.mjs`.
- Pruebas dirigidas: `infra/cloudflare/dev/test/single-operator-bootstrap.test.mjs`.
- Plan inerte actualizado: `infra/cloudflare/dev/next-stage/development-plan.json`.
- Pendientes del lector local actualizados: `infra/cloudflare/dev/scripts/next-stage-readiness.mjs`.
- Nota histórica: `docs/DEV-BOOTSTRAP-ADMIN-NEXT-STEPS.md`.
- Este informe: `docs/DEV-SINGLE-OPERATOR-BOOTSTRAP.md`.

No se tocaron migraciones originales, apariencia Admin/landing, Hostinger, producción ni recursos remotos. Sin SQL remoto, exportaciones, roles reales, cambios Access, deploy, commit o push.
