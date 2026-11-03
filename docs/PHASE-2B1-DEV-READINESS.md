# KUWAGO — Fase 2B.1: verificación y preparación segura de DEV

Fecha de verificación: 23/10/2026, America/Costa_Rica.
Estado: preparación documental; NO se han creado ni modificado recursos remotos.
Referencia temporal de la comprobación local: 24/10/2026 01:02 UTC, 23/10/2026 19:02 en Costa Rica.

## 1. Resultado verificable y límite de la evidencia

| Elemento | Resultado de esta sesión | Evidencia y límite |
|---|---|---|
| Wrangler | No encontrado en PATH, bins del proyecto/Admin ni paquete global npm estándar inspeccionado | No se ejecutó npx, instalación, whoami, login ni refresh; no es un inventario de todo el disco |
| Autenticación anterior | Existe archivo global de OAuth de Wrangler; access token vencido | Se extrajeron solo presencia, expiración y nombres de scopes; ningún secreto se imprimió o copió al proyecto |
| Vencimiento | 23/10/2026 04:26:34 UTC (22/10/2026 22:26:34 Costa Rica) | Comparado con el reloj del sistema; la presencia de refresh token NO demuestra sesión vigente |
| Scopes históricos | user:read, offline_access, account:read, workers:write, workers_scripts:write, workers_routes:write, zone:read | Metadatos históricos; no prueban permisos efectivos actuales ni acceso a D1/R2/Access/facturación |
| Variables del proceso | No hay nombres CLOUDFLARE_*, CF_* o WRANGLER_* | Solo se inspeccionaron nombres; no se buscaron secretos en perfiles ajenos o historial |
| Panel disponible | No hay pestaña de Cloudflare en las superficies habilitadas para esta tarea | Inventario del navegador; no demuestra que el usuario carezca de sesión en otros dispositivos/perfiles |
| Cuenta activa / membresía | NO COMPROBADA | No hubo llamada autenticada a la API: se omitió al detectar el vencimiento |
| Workers Paid | Informado anteriormente por el usuario; NO VERIFICADO en cuenta | Requiere plan/suscripción y cuenta seleccionada en panel |
| D1 | Disponibilidad y límites efectivos NO COMPROBADOS | El soporte público documentado no acredita habilitación, permiso o saldo de esta cuenta |
| R2 | Habilitación, facturación y buckets NO COMPROBADOS | No pulsar activar, contratar, crear bucket ni aceptar términos durante lectura |
| Zero Trust / Access | Organización, plan, IdP, usuarios, aplicaciones y políticas NO COMPROBADOS | No confundir Workers Paid con suscripción Zero Trust |
| Límites / alertas | Estado efectivo, presupuesto, destinatarios y alertas NO COMPROBADOS | Los valores de security-policy.example.json son propuestas, no controles aplicados |

No se renovó OAuth ni se intentó iniciar sesión automáticamente. La credencial antigua
incluye scopes de escritura: para una inspección posterior usar una sesión del usuario
con acciones estrictamente de lectura o credencial de lectura mínima previamente
autorizada. No reutilizar ese OAuth como token CI. Su revisión/revocación futura es
una modificación de seguridad y requiere autorización; no se ejecutó.

## 2. Revisión de los nueve archivos de Fase 2A

Rutas relativas a la raíz del repositorio; los nueve se inspeccionaron sin modificarlos.

| Archivo | Preparación existente | Pendiente antes de DEV ejecutable |
|---|---|---|
| docs/PHASE-2A-CLOUDFLARE.md | Arquitectura, compatibilidad 1C, seguridad, D1/R2, costos públicos y DNS | Comprobar cuenta/capacidades; aprobar identidad, presupuesto y ventana de publicación eventual |
| docs/PHASE-2B-RUNBOOK.md | Puertas de implementación local, provisión, migración y deploy; staging posterior | Este documento concreta un primer DEV, no autoriza adelantar staging/producción |
| infra/cloudflare/README.md | Ejemplos deliberadamente no desplegables y límites de sus flags | Seleccionar versión de Wrangler y validar schema real al aprobar implementación |
| infra/cloudflare/environments.example.json | Nombres distintos; accountId, D1 ID, issuer y AUD vacíos; remoteApproved=false | Seleccionar cuenta y anotar inventario real solo tras comprobación/provisión autorizada |
| infra/cloudflare/security-policy.example.json | Roles, Origin, upload, límites, retención, presupuesto sin aplicar | Elegir personas, IdP/MFA, aprobadores, presupuesto, retención y responsables |
| infra/cloudflare/wrangler.catalog.example.json | Solo PUBLICATION; sin D1, media privada o binding Admin | Implementar entrypoint, contrato/mapper, host real de prueba y Access no productivo |
| infra/cloudflare/wrangler.admin-api.example.json | D1 y R2 DEV separados; sin ingress público | Implementar validación JWT/roles, límites, migraciones revisadas; IDs reales cuando se autoricen |
| infra/cloudflare/wrangler.admin-web.example.json | Proxy interno ADMIN_API y run_worker_first=true | Implementar guardia antes de assets; configurar build Admin aislado y audiencia comprobada |
| infra/cloudflare/.dev.vars.example | Metadatos vacíos; sin credenciales | No convertir en almacén de tokens de despliegue; fijar configuración local no sensible cuando exista código |

Dependencias de implementación pendientes: Wrangler estable fijado en lockfile,
tipos/runtime de Workers, biblioteca de validación JWT (candidata jose, no instalada),
pruebas workerd, esquema/migraciones y decoder de imágenes compatible y medido.
No se instalaron dependencias, crearon apps backend, ejecutaron migraciones ni builds.
Los contratos 1C se reutilizarán: las aprobaciones comerciales y permisos deben
derivarse del servidor, nunca de flags enviados por React. Las referencias Stitch
con moneda desconocida no se importarán como catálogo comercial aprobado.

Los main/assets/migrations_dir siguen bloqueados con marcadores inválidos. remote:false
solo afecta al desarrollo; no impide un deploy futuro. MUTATIONS_ENABLED y
REQUIRE_ACCESS_JWT no son seguridad ejecutable sin código que los aplique.

## 3. Checklist de lectura: sin crear ni activar recursos

Los nombres de pantallas pueden variar con el panel. Si aparece onboarding, selección
de plan, aceptación de términos o un botón de activación, detener la inspección.
«No» en autorización significa lectura ya solicitada, SOLO con sesión vigente;
no autoriza nuevo login, refresh ni emisión de tokens. Evidencia: fecha, cuenta y
valores no sensibles; no capturar headers, cookies, claves ni datos de facturación privados.

| Acción | Plataforma / pantalla | Resultado esperado | Evidencia de verificación | Riesgo | Requiere autorización |
|---|---|---|---|---|---|
| L1. Revisar nueve archivos e inventario Git | Repositorio local | Fuentes intactas, separación de entornos | Completado: inventario + hashes; 118 invariantes correctas | Bajo | No |
| L2. Buscar Wrangler y sesión previa sin refresh | Terminal local | Presencia/expiración, nunca secreto | Completado: OAuth vencido, CLI no encontrada en ubicaciones inspeccionadas | Exposición de secretos si se imprime TOML; evitada | No |
| L3. Confirmar cuenta y membresía | Selector de cuenta; Manage Account / Members | Nombre/ID de cuenta acordada y permisos efectivos | Pendiente: registro sanitizado de cuenta y rol | Operar cuenta equivocada | No, con sesión vigente |
| L4. Comprobar Workers Paid y consumo | Billing / Subscriptions; Workers & Pages / Usage | Plan, ciclo, consumos compartidos y restricciones comprobados | Pendiente: nombre de plan, fecha y métricas, sin datos de pago | Confundir plan comunicado con plan efectivo | No, con sesión vigente |
| L5. Comprobar D1 | Storage & Databases / D1; límites/uso | Inventario DEV/staging/prod y permiso de lectura; disponibilidad | Pendiente: lista/IDs si hay recursos; un 403 es falta de permiso, no inexistencia | Recursos preexistentes sin inventariar | No, con sesión vigente |
| L6. Comprobar R2 sin activarlo | R2 / Overview y Billing | Estado habilitado/no habilitado, uso y buckets | Pendiente: estado; si pide activación, registrar y detener | Activar facturación inadvertidamente | No, con sesión vigente |
| L7. Comprobar Zero Trust e identidad | Zero Trust / Overview, Settings / Authentication, plan y usuarios | Organización, proveedor, MFA disponible, asientos y sesiones | Pendiente: resumen sanitizado; sin aceptar onboarding | Suponer Access activo por tener Workers Paid | No, con sesión vigente |
| L8. Leer Access y rutas alternativas | Access / Applications y Policies; Worker / Settings / Domains & Routes | Apps, AUD, Allow/Bypass/Service Auth, workers.dev, versiones y previews inventariados | Pendiente: matriz de cobertura, sin editar ni generar pruebas con tokens reales | Bypass heredado o alcance global que afecte otras apps | No, con sesión vigente |
| L9. Leer alertas y límites | Billing / Budgets, Notifications; Workers/D1/R2 Usage | Presupuesto/alertas, destinatarios, umbrales y CPU/límites efectivos | Pendiente: valores y habilitación; alerta no equivale a tope | Consumo fuera de presupuesto | No, con sesión vigente |
| L10. Revisar permisos y registro de cambios | Manage Account / Members, API Tokens (solo metadatos), Audit Logs | Scopes/responsables sin revelar tokens; identificar dependencias previas | Pendiente: roles y cambios relevantes de DEV | Permisos de cuenta pueden abarcar producción | No, con sesión vigente |
| L11. Inventario DNS público y export privado posterior | Consulta DNS; hPanel DNS Zone (lectura) | Estado autoritativo, web/correo/validaciones y DS completos | DNS parcial comprobado; export completo pendiente | Cambiar registros sin conocerlos todos | No, con sesión vigente para hPanel |

## 4. Checklist de cambios futuros: NO ejecutado ni autorizado por esta entrega

Cada fila es una puerta independiente. El usuario debe iniciar sesión personalmente
si no hay sesión vigente; no solicita enviar contraseñas, códigos ni tokens por chat.

| Acción | Plataforma / pantalla | Resultado esperado | Evidencia de verificación | Riesgo | Requiere autorización |
|---|---|---|---|---|---|
| C0. Acceso manual del usuario si hace falta | Panel Cloudflare, cuenta elegida | Sesión propia con MFA para L3–L10 | Cuenta/rol legibles; no iniciar ningún onboarding | Autenticación en cuenta errónea | Sí, acción manual del usuario; no ejecutada |
| C1. Fijar herramientas e implementar guardias locales | Repositorio y workerd local | Backend mínimo probado, sin red ni datos productivos | Lockfile, tests negativos y schema Wrangler validado | Dependencias nuevas y errores de seguridad | Sí, siguiente bloque local |
| C2. Configurar identidad/MFA y bootstrap DEV | IdP y Zero Trust; futuro backend | Personas individuales, roles mínimos y responsables | Prueba de MFA y listado aprobado de sujetos/roles | Bloqueo del propietario o exceso de permisos | Sí |
| C3. Habilitar productos y presupuesto que falten | Billing / R2 / Zero Trust / Notifications | Planes/cargos aceptados y alertas con destinatarios | Captura sanitizada, límites aprobados y envío de prueba admitido | Cargos o cambios de seguridad | Sí, importe/plan explícito |
| C4. Emitir credencial DEV mínima si hace falta | API Tokens y almacén seguro | Provision/deploy separados, scope y vencimiento acotados | Metadatos/scopes y prueba de límites; nunca token | Token con alcance a otras apps/ambientes | Sí |
| C5. Crear D1 vacía DEV | D1 | kuwago-admin-db-development, sin SQL/datos | ID real distinto, cuenta correcta, cero importaciones | Consumo y base equivocada | Sí |
| C6. Crear buckets privados DEV | R2 | media-private, publication y backups DEV, sin acceso directo | r2.dev/custom domains apagados, nombres y cuenta comprobados | Exposición de archivos/cargos | Sí |
| C7. Crear política/app Access DEV | Zero Trust / Access | Solo sujetos DEV y MFA; AUD propia por app | Cobertura completa; sin Everyone, Bypass o Service Auth no justificados | Exponer apps por reglas acumuladas | Sí |
| C8. Aplicar migración DEV revisada | D1, config explícita de development | Esquema exacto tras pruebas locales y autorización separada | Cuenta/DB/plan SQL y resultados FK/rollback | DDL o datos en otra base | Sí, separado de creación |
| C9. Desplegar Admin API sin ingress | Workers, config DEV | kuwago-admin-api-development solo por Service binding | Sin routes/custom domains/workers.dev/previews, JWT/rol validado | Crear endpoint o scope indebido | Sí, deploy separado |
| C10. Desplegar Admin web protegido | Workers + Access DEV | React detrás de JWT antes de todos los assets; binding solo DEV | Incógnito sin assets; identidad válida y permisos servidor | Exposición transitoria entre deploy y política | Sí; sin protección atómica comprobable, no exponer |
| C11. Desplegar catálogo DEV protegido | Workers + Access DEV | Solo PUBLICATION DEV; vacío explícito o error, sin demos fallback | JWT DEV propio; sin D1/private-media/admin bindings | Filtrar borradores o contenido comercial ficticio | Sí |
| C12. Habilitar escrituras DEV tras pruebas | Backend y configuración DEV | Solo roles aprobados, límites, auditoría y outbox | Pruebas de autorización/CSRF/publicación/restauración | Escritura o publicación accidental | Sí, puerta posterior |
| C13. Adoptar dominios propios / mover DNS en otra fase | Cloudflare DNS y registrador | Hostinger y correo conservados, HTTPS validado | Export, comparación externa y rollback NS/DS | Interrupción de web/correo/DNSSEC | Sí, fuera del arranque DEV |

No crear credenciales si la operación puede realizarse con identidad personal de
provisión autorizada. Verificar scopes reales: un token separado por nombre NO aísla
recursos si Cloudflare concede permisos de cuenta. Preferir cuenta DEV dedicada si
no se puede impedir acceso productivo; su plan y costo son una decisión pendiente.

## 5. Identidad y seguridad recomendadas

- IdP corporativo con identidad individual, MFA resistente a phishing (passkey o
  llave de seguridad, según proveedor); recuperación controlada del propietario.
  Si aún no hay IdP, resolverlo antes de exponer Admin: email OTP no demuestra por
  sí solo MFA. Los aliases del buzón compartido no separan identidades personales.
- Política DEV propuesta: Allow solo grupo DEV o sujetos exactos aprobados, Require
  IdP/MFA verificado cuando soporte el claim, sesión inicial propuesta de 1 hora.
  Comprobar semántica de Include/Require/Exclude y todas las políticas aplicables;
  no un Allow global, bypass de assets o confianza basada solo en dominio del correo.
  [Reglas Access](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/).
- Cloudflare Access controla la entrada; el Worker valida firma, issuer fijo,
  AUD exacta, exp, sub y demás claims. La API interna revalida JWT original y roles
  D1; no hereda autenticación de React ni confía en headers de correo arbitrarios.
- Roles viewer/editor/publisher/securityAdmin según 2A, con denegación por defecto.
  Sin autoelevación, primera visita administradora o aprobación comercial del cliente.
- Guardar tokens operativos en almacén seguro; secretos runtime solo si necesarios.
  Issuer/AUD/account ID son metadatos, no secretos. Nada privado en VITE_*, Git,
  wrangler vars, URLs, capturas, logs o localStorage. No generar claves S3 para usar bindings R2.
- Admin API únicamente por Service binding. Admin web: same-origin /api/v1,
  JWT/rol y Origin exacto + header en mutaciones, límites de bytes/métodos;
  upload binario es la excepción documentada, no un bypass de controles.
- JWT antes de todos los assets: assets.run_worker_first=true más código fail-closed;
  la flag sola no autentica. [Assets y Worker](https://developers.cloudflare.com/workers/static-assets/binding/).
- Límites CPU/cuerpos/uploads, consultas acotadas, alertas y auditoría sanitizada.
  Presupuesto pendiente: alertas sugeridas 50/80/100%, no garantía de corte del gasto.
  [Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/).

## 6. DEV sin transferencia de nameservers

Sí: el primer camino recomendado es localhost con workerd, D1/R2 simulados, loopback,
estado local exclusivo de development, sin remote:true, --remote, túneles ni llaves
productivas. No exige mover DNS, activar Access ni crear bases o buckets remotos.
Los JWT firmados exclusivos de test prueban validaciones, no un login seguro real.
[Desarrollo local oficial](https://developers.cloudflare.com/workers/local-development/).

Un DEV remoto también puede prepararse sin cambiar nameservers: D1 y R2 privados,
Admin API sin ingress y Service bindings no requieren dominios del cliente. Para
probar Admin web/catálogo desde Internet hay que aprobar un camino protegido:

1. Mantenerlos sin ingress hasta aprobar DNS/custom domains: conserva exactamente
   workers_dev:false y preview_urls:false de 2A; no habrá URL para uso remoto humano.
2. Alternativa opcional: aprobar expresamente workers.dev SOLO para Admin web y
   catálogo DEV, protegido por Access y guardia JWT fail-closed desde el primer deploy.
   Confirmar cobertura y AUD antes; si el panel exige publicar para preparar la
   app Access, desplegar exclusivamente una respuesta 403 sin assets/datos hasta
   demostrar protección. Nunca habilitar temporalmente el React desprotegido.

La segunda opción es una decisión NUEVA para DEV, no un cambio aplicado a plantillas.
Cloudflare documenta Access para workers.dev, URLs de versiones y previews;
su disponibilidad/cobertura real en esta cuenta sigue sin verificarse.
[workers.dev y Access](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).
Admin API conserva siempre workers.dev apagado. Dejar preview_urls:false explícito
y verificar rutas de versiones anteriores. Revisar también cualquier producto de
previews separado, Pages, túnel o build público alternativo; no habilitar ninguno.
[URLs de versiones](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/).

Futura transición DNS completa opcional, en otra ventana autorizada:
- Exportar zona autoritativa de Hostinger: A/AAAA apex y www, CNAME, MX, SPF, selectores
  DKIM, DMARC, TXT de validación, CAA, SRV, subdominios, TTL y estado DNSSEC/DS.
- Copiar/comparar en zona Cloudflare antes de delegar; web Hostinger DNS-only al
  inicio y correo sin proxy, sin endurecer DMARC ni cambiar remitentes.
- Plan explícito NS/DS para evitar SERVFAIL; guardar rollback y considerar cachés.
- Verificar HTTPS, correo entrante/saliente y alineación SPF/DKIM/DMARC; landing,
  PWA y rutas actuales permanecen en Hostinger. No agregar rutas Worker al apex/www.
- No confundir registrar/hosting con DNS autoritativo. La alternativa parcial CNAME
  exige plan de zona Business/Enterprise; Workers Paid no lo incluye por inferencia.
  [Disponibilidad parcial](https://developers.cloudflare.com/dns/zone-setups/partial-setup/).

DNS público comprobado esta sesión: NS aurora.dns-parking.com y nebula.dns-parking.com;
MX mx1.hostinger.com (5) y mx2.hostinger.com (10); SPF
v=spf1 include:_spf.mail.hostinger.com ~all; DMARC v=DMARC1; p=none.
Esto no es export completo, ni verifica DKIM/CAA/DS o el estado de una zona Cloudflare.

## 7. Orden exacto del primer DEV, después de autorizaciones

1. Completar L3–L10 con sesión del usuario; confirmar cuenta, permisos, presupuesto
   y si DEV compartirá cuenta. Aceptar alcance DEV exclusivamente.
2. C1: implementar/probar localmente guardias, contratos, aislamiento y esquema;
   sin autorización de migración no aplicarla ni siquiera localmente.
3. C2–C4: resolver IdP/MFA, responsables, alertas/cargos y mínimos de permisos.
   Si requieren altas/cambios de plan, aprobación explícita antes de aceptarlos.
4. C5: crear solamente D1 vacía kuwago-admin-db-development; registrar ID/cuenta.
5. C6: crear, en este orden, kuwago-media-private-development,
   kuwago-publication-development y kuwago-backups-development, todos privados;
   sin uploads, datos demo comerciales ni lifecycle destructivo.
6. C7: preparar aplicaciones Access DEV Admin y catálogo si habrá acceso humano
   remoto. AUD separadas por app; ninguna compartida con staging/production.
   Aplicar la secuencia cerrada del apartado 6 si se elige workers.dev.
7. C8: revisar y autorizar migración DEV por separado; comprobar cuenta/ID antes.
8. C9: desplegar kuwago-admin-api-development sin ingreso público, mutaciones off.
9. C10: desplegar kuwago-admin-web-development protegido y con binding a esa API.
10. C11: desplegar kuwago-catalog-development protegido y solo PUBLICATION DEV.
11. Ejecutar pruebas del apartado 8; documentar evidencia y restauración.
12. C12: solicitar habilitación de escrituras DEV solo tras revisión de resultados.
    No conectar marketplace Hostinger, crear staging/prod, DNS, commits o push.

Primer recurso de datos recomendado, UNA VEZ comprobada la cuenta y autorizada
la provisión: D1 vacía kuwago-admin-db-development. Permite fijar identidad del
entorno sin publicar un endpoint. No garantiza costo cero. Antes de crearla hay
que completar los controles de identidad, facturación y permisos anteriores.
El primer trabajo técnico recomendado ahora es el backend mínimo y sus pruebas
locales, no un deploy de las plantillas incompletas.

## 8. Pruebas de aislamiento y aceptación, todavía pendientes de ejecución remota

| Prueba | Evidencia esperada / criterio de aceptación |
|---|---|
| Identidad de recursos | Cuenta/DB/buckets/nombres/AUD DEV identificados y distintos de staging/prod; ningún binding o secreto cruzado |
| Autoridad de credencial | Inspección de scopes y pruebas negativas no destructivas; si el token abarca prod, registrar bloqueo o separar cuenta, no ensayar writes sobre prod |
| Código público mínimo | Catálogo sin D1/private-media/Admin bindings; backups sin binding en Workers de aplicación |
| Simulación local | Loopback, estado DEV separado, sin remote bindings; lecturas/escrituras de test no cambian inventario ni métricas remotas |
| Sin identidad | Incógnito y cliente sin cookies: Access challenge o denegación; ningún HTML/JS/imagen privados, incluyendo rutas profundas y codificadas |
| JWT inválido | Ausente/falso/expirado/issuer o AUD incorrectos, incluido fixture de otro ambiente, denegados; no aceptar fixtures locales en remoto |
| Roles | Identidad sin membresía/inhabilitada denegada; viewer no escribe; editor no publica; roles revocados efectivos y cambios de rol protegidos |
| Ingress alternativo | Admin API sin ruta pública; workers.dev/URLs de versión/previews no autorizados no sirven contenido; verificar dashboard y requests sin sesión |
| Acceso a medios | r2.dev y dominios bucket apagados; originales/cuarentena no públicos; conocer key no permite leer; publicación solo derivados aprobados |
| CORS/CSRF | Origin distinto/null/ausente, formularios y métodos indebidos rechazados; no depender de CORS como autenticación |
| Límites y privacidad | 413 para cuerpos excesivos, 405 métodos no admitidos, límite de uso con 429 cuando proceda; logs sin JWT/cookies/secretos |
| D1 y publicación | FK/guardas, rollback real, CAS, idempotencia/outbox y revisiones; no éxito público anticipado ni fallback silencioso de demo |
| Recuperación | Restauración en recurso efímero DEV previamente autorizado; hashes, revisiones y generación nueva coherentes con R2 |
| Producción intacta | Artefactos landing/PWA y configuración Hostinger/DNS sin cambios; ningún fetch productivo hacia API DEV |

No prometer que un 401/403 concreto será la respuesta de Access en todos los clientes:
puede redirigir al proveedor. El criterio es no entregar contenido ni permitir acciones.
No lanzar ataques de carga, escrituras contra producción ni restauraciones remotas
para validar esta planificación. Todas esas ejecuciones requieren su alcance aprobado.

## 9. Riesgos, bloqueos y cierre

Bloqueo para verificar cuenta ahora: OAuth vencido, sin CLI disponible ni panel abierto
en las superficies habilitadas. Se requiere que el usuario habilite acceso manual;
no se solicita copiar credenciales. No bloquea la planificación ni el desarrollo local.

Bloqueos para provisión: cuenta/plan/permiso efectivo desconocidos, presupuesto y
alertas sin verificar, IdP/MFA/miembros sin definir, opción de ingress DEV por decidir,
guardias/backend/migraciones todavía inexistentes y schema Wrangler sin validar.

Riesgos: OAuth histórico amplio, tokens de cuenta con alcance a producción, aliases
compartidos como identidades, endpoints/previews públicos, originales R2 expuestos,
aprobaciones controladas por React, costos sin alertas y migración DNS incompleta.
Alertas no son hard caps; publicación D1→R2 es eventual, no transacción distribuida.

Verificaciones de ESTA fase: nueve archivos inspeccionados; 118 invariantes locales
de plantillas/inventario correctas y 26 nombres propuestos únicos. No se ejecutó
Wrangler ni validación de su schema. Las 67 pruebas de 2A son evidencia histórica,
no se presentan como repetidas aquí. No se requiere nuevo build por documentación.
Inventario previo de esta sesión: 434 archivos existentes para comparación SHA-256.

Comparación SHA-256 final: 434 archivos preexistentes intactos, cero cambios y un
archivo nuevo. Comprobación documental correcta: 25 filas de checklist y nueve
apartados requeridos presentes, sin espacios sobrantes al final de línea.

Único archivo nuevo: docs/PHASE-2B1-DEV-READINESS.md. No se alteran los nueve
archivos 2A ni la landing. Sin instalaciones, login/refresh, llamadas API autenticadas,
recursos, Access, deploy, migraciones, DNS/Hostinger, commit o push.

Esta fase termina en preparación y revisión; ninguna tabla constituye autorización
para ejecutar las acciones remotas futuras.
