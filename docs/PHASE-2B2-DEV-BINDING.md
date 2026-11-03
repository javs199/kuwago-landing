# KUWAGO — Fase 2B.2: vinculación controlada de DEV

Fecha: 23/10/2026, America/Costa_Rica.
Estado: preparación y pruebas locales completadas; sin escritura remota.

## 1. Auditoría y evidencia

Se revisaron los documentos 2A, 2B.1 y 1C, los contratos TypeScript, configuración
histórica y estado Git. HEAD sigue en 26055d6. Las modificaciones de fases previas
siguen pendientes de commit; no se descartaron ni se incorporaron a un commit.
Comparación con inventario de 2B.1: 434 archivos conocidos intactos; su informe es
el único archivo adicional esperado. Al comenzar esta fase se registraron hashes
de 435 archivos. Cierre: ninguno de esos archivos cambió; solo 17 archivos nuevos.

Escaneo de secretos del árbol actual: 72 archivos de texto versionados y 156 textos
incluyendo fuentes sin seguimiento, antes de agregar este informe; sin coincidencias
de claves privadas, asignaciones de credenciales reconocibles o JWT literales.
El escaneo no imprime valores. No es prueba absoluta de ausencia ni revisión del
historial completo, dependencias/outputs ignorados o almacenes privados. No se
encontraron cambios de origen desconocido en la comparación disponible.
.gitignore existente ya excluye node_modules, .wrangler, .env y .dev.vars; comprobado
con git check-ignore. No fue necesario modificarlo.

El usuario comunica estos recursos y comprobaciones, registrados como evidencia
manual, NO como lectura independiente de cuenta:

| Recurso | Nombre comunicado | Estado de preparación local |
|---|---|---|
| Worker | kuwago-admin-api-development | Hello World remoto permanece intacto; candidato remoto bloqueado |
| D1 | kuwago-admin-db-development | ID pendiente; solo simulación local migrada |
| R2 privado | kuwago-media-development | Binding local PRIVATE_MEDIA; sin lectura/subida remota |
| Access | Kuwago Admin DEV - Acceso autorizado | ID/issuer/AUD/hosts efectivos pendientes |

Pruebas manuales informadas: anónimo interceptado, Google permitido admitido,
Google no autorizado rechazado, R2 sin URL pública/dominio y D1 inicialmente vacía.
No prueban por sí solas MFA, validación JWT dentro del Worker, roles, protección de
previews/versiones u otros hosts. No se deduce nada de esos controles adicionales.

Se intentó leer el panel Chrome ya abierto mediante la herramienta autorizada.
Computer Use detuvo la operación al no poder determinar con suficiente confianza
la URL actual de Chrome en Windows para aplicar su política. No se continuó por
otra vía, no se inició sesión/refresh, ni se copiaron cookies o credenciales.
Los identificadores quedan pendientes expresamente, como permite el alcance.

## 2. Archivos entregados

```text
infra/cloudflare/dev/
  README.md
  package.json
  package-lock.json
  tsconfig.json
  resources.development.json
  wrangler.local.json
  wrangler.remote-development.example.json
  scripts/local.mjs
  src/deny-all.ts
  src/media.ts
  test/config-storage.test.mjs
  test/database.test.mjs
packages/database/
  README.md
  migrations.sha256.json
  migrations/0001_admin_catalog.sql
  migrations/0002_integrity_guards.sql
docs/PHASE-2B2-DEV-BINDING.md
```

17 nuevos; ningún archivo preexistente modificado. Outputs, bases de test y
dependencias permanecen ignorados. Los documentos 2A/2B.1 describen la situación
histórica: este informe registra las diferencias sin reescribirlos.

## 3. Configuración Wrangler y aislamiento

Dos configuraciones separadas:
- wrangler.local.json: nombre local kuwago-admin-api-local-only-development,
  sin IDs remotos, único environment development, sin ingress, sin previews,
  puerto loopback 8790 y persistencia exclusiva .wrangler/state/development.
  DB y PRIVATE_MEDIA se simulan con remote:false.
- wrangler.remote-development.example.json: apunta por NOMBRE a los recursos
  comunicados, pero account_id/database_id están claramente pendientes y main
  bloqueado. Es documentación no desplegable, no config activa de operación remota.
  No tiene staging/production ni credenciales; ningún script la utiliza.

El script local permite exclusivamente dev --local, migrations apply/list --local
y validación deploy --dry-run. Fija --env development y --config wrangler.local.json,
rechaza argumentos adicionales y configura un home distinto del OAuth del usuario,
elimina variables de credenciales Cloudflare del proceso hijo y desactiva métricas.
El dry-run solo empaqueta y valida localmente: «Total Upload» indica tamaño del
bundle, no transferencia ejecutada. No hay script deploy, upload, create o remote.
No es una barrera de red ni impide que alguien ejecute otra CLI manualmente.

Wrangler estable 4.152.0 fijado con lockfile; su runtime oficial Miniflare
5.20261019.2-beta se utiliza en tests. Se sustituyó una selección inicial de runtime
estable anterior al encontrar avisos altos. Decisión local explícita: aceptar la
dependencia beta del proveedor para preparar/probar; NO autoriza producción.
Override transitivo undici 7.30.1, del mismo major, elimina avisos de la versión
incluida; validado con tests y auditoría final cero. Revisar y retirar el override
cuando el proveedor incorpore el parche. No se tocaron dependencias raíz/Admin.
compatibility_date=2026-07-30 permanece como línea base local probada; la fecha
remota es desconocida y no se altera automáticamente.

El único Worker local devuelve 503/no-store en todas las rutas/métodos, sin leer
bindings, autenticar ficticiamente o ejecutar operaciones. No debe desplegarse sobre
Hello World. Tener REQUIRE_ACCESS_JWT o MUTATIONS_ENABLED en un ejemplo no es
implementar esas verificaciones.

[Desarrollo D1 local](https://developers.cloudflare.com/d1/best-practices/local-development/),
[configuración Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/).

## 4. Modelo SQL y compatibilidad 1C

0001_admin_catalog.sql define administradores/roles/permisos, categorías ES/EN,
servicios, revisiones y traducciones, identidades de opciones, contenido/opciones/
precios por revisión, multimedia privada y alt por revisión, aprobaciones, auditoría,
comandos de publicación y outbox. No inserta personas ni contenido comercial.
Único seed: roles viewer/editor/publisher/securityAdmin y sus permisos candidatos.

0002_integrity_guards.sql protege revisiones selladas y todas sus colecciones,
identidad de opción/revisión, aprobación por revisor independiente habilitado,
revocación única, estados de medios y auditoría append-only.

Relaciones compuestas diferidas impiden revisiones ajenas y permiten crear servicio
y primera revisión en un batch. IDs de opción pertenecen al servicio; títulos,
slug, categoría, precios y orden/alt pertenecen a revisión. Revisión sellada no se
edita: se crea otra revisión y se conserva el puntero público anterior.

Precios: entero seguro en unidades menores, USD/CRC/EUR explícito, fixed/from o
quote sin importe; moneda NULL solo en quote. Ningún "$" se convierte en USD.
Precio ausente = borrador incompleto. Los DTO privados y object keys no se proyectan
como campos públicos ni se reemplazan por ejemplos comerciales.

Los triggers de publicación constituyen invariantes adicionales, NO una operación
de publicación completa: validaciones de readiness 1C, autorización fresca, hash
canónico, concurrencia/CAS abortante, auditoría y outbox transaccional siguen
pendientes de implementación. UPDATE con cero filas no aborta una transacción.
No hay publicación API ni proceso exportador D1→R2; esa entrega futura será eventual,
no una transacción distribuida. No se promete éxito público al escribir solo en D1.

Migraciones forward-only con historial Wrangler d1_migrations y manifiesto SHA-256.
Una nueva modificación exige nueva migración, no editar la aplicada. Los tests
recrean el esquema desde cero en D1 efímera workerd y verifican integridad con
PRAGMA foreign_key_check. [Claves foráneas D1](https://developers.cloudflare.com/d1/sql-api/foreign-keys/).
Mapeo detallado y restricciones: packages/database/README.md.

## 5. Seguridad: implementado frente a pendiente

Implementado aquí: denegación total del entrypoint local, ningún endpoint de negocio,
ningún acceso a storage desde HTTP, scripts/config local aislados y restricciones SQL.
No hay autenticación de producción o login simulado. La seguridad real siguiente
deberá incluir TODOS estos controles antes de habilitar acciones:

1. Validación criptográfica de Cf-Access-Jwt-Assertion mediante biblioteca revisada:
   firma RS256, issuer HTTPS exacto de la organización, AUD de esta aplicación DEV,
   exp/sub/iss/aud requeridos, nbf si presente, iat razonable, tolerancia acotada.
   JWKS solo del emisor previamente configurado, rotación/refresh acotados. Rechazar
   configuración vacía, claves desconocidas/fallas, jku/x5u del cliente o tokens
   decodificados sin verificar. No guardar JWT en URL, localStorage o logs.
   [Validación oficial](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
2. Principal interno issuer+sub y enabled, roles/permisos leídos del servidor en
   cada acción; no del email, React, claim arbitrario o body. Google admitido en
   Access no implica rol administrativo. Bootstrap revisado por dos personas;
   sin primer visitante admin, autoelevación ni datos reales en seeds.
3. Rechazo por defecto: sin rol, configuración, identidad o permiso, no operar.
   MFA mediante proveedor individual verificado; Google sign-in solo no prueba MFA.
4. Workers.dev/URLs de versiones/previews: inventariar TODOS los hosts y revisar
   política efectiva. No confiar en que la política de un hostname cubre otros.
   Los ejemplos apagan workers.dev y previews; desplegarlos alteraría la accesibilidad
   actual, por eso permanecen bloqueados y exigen otra aprobación.
5. Desviación frente a 2A: la API DEV existente tiene ingress protegido por Access,
   según el usuario. Es válida como prueba cerrada de Hello World, pero NO cumple
   aún el objetivo final de API interna solo por Service binding. Resolver el gateway
   Admin y la transición sin exposición antes de conectar endpoints reales; nada se
   desactiva o crea en esta fase. API pública futura sin D1/media-private/Admin bindings.
6. CORS administrativo cerrado, origen Admin exacto conocido (hoy pendiente), sin
   wildcard/credenciales cruzadas. CORS no autentica. Mutaciones: Origin exacto,
   header X-Kuwago-Request, JWT/permiso, métodos/JSON/bytes acotados; rechazar Origin
   null/ausente en flujo navegador. Upload binario es excepción controlada, no bypass.
   No escrituras GET; SameSite/Sec-Fetch son defensas adicionales, no sustitutos.
7. Originales/quarentena siempre privados; preview por autorización específica,
   no-store y nosniff. No r2.dev, dominio bucket o enlaces firmados/públicos. El único
   bucket existente no se conecta al catálogo. No URLs comerciales o públicas creadas.

## 6. Contrato R2 preparado

src/media.ts define PrivateMediaRecord, RevisionMedia, PrivateImageStorage,
permisos y ciclo quarantine→validated→approved→retired→deleted, con rama rejected.
No implementa upload/read/delete ni usa credenciales/SDK/red. Prefijo exclusivo DEV,
ID generado por servidor, object keys fuera de los contratos públicos.

Límites propuestos codificados como contrato local: 2 MiB, 4096 por dimensión,
8 MP, ocho fotos/revisión, JPEG/PNG/WebP y 30 s de upload. El futuro servidor debe
contar stream, comprobar MIME/firma, decodificar y normalizar bytes/EXIF/GPS; rechazar
contenido activo/animaciones no admitidas/corrupto. validateDecodedImage valida
metadatos del resultado confiable, NO analiza archivos ni acepta flags del navegador.
Falta elegir/medir el decoder y decidir roles específicos read-private/approve/cleanup;
esas acciones permanecen denegadas al no existir implementación/asignación.

Limpieza definida en README: reporte dry-run, retenciones por aprobar (7/30 días),
referencias de todas las revisiones, operaciones y uploads en curso, doble revisión
bajo control de concurrencia, tombstone/auditoría y borrado autorizado idempotente.
No se ejecutó limpieza ni se configuró lifecycle. Respaldos R2/copia externa y prueba
de restore reales quedan pendientes; respaldar D1 no respalda objetos R2.

## 7. Comprobaciones ejecutadas y límites

| Comprobación | Resultado real |
|---|---|
| TypeScript | Admin, contratos y preparación DEV correctos |
| Lint | Admin, contratos, catálogo y preparación DEV correctos |
| Wrangler local | 4.152.0 validó config y bundle mediante dry-run; sin subida |
| Migraciones persistentes locales | Dos aplicadas localmente; segunda ejecución/listado: ninguna pendiente |
| D1 efímera actual | Ambas migraciones desde cero, integridad FK, precios, revisión/roles, sellado, rollback y auditoría correctos |
| Nuevas pruebas Node/workerd | 21 aprobadas según reporte Node (incluye contenedor de pruebas D1) |
| Regresión Node pública/contratos | 49 aprobadas |
| Regresión Admin | 18 aprobadas |
| Check estático e aislamiento | Correctos; builds existentes separados y loopback |
| Checksum SQL / flags / configs | Correctos; IDs reales prohibidos en config local, solo DEV y rutas cerradas |
| Dependencias nuevas | npm audit: 0 vulnerabilidades tras actualización y override acotado |
| Hash de fuentes previas | 435 preexistentes sin cambios |

Total reportado: 88 pruebas correctas, cero fallos. Los tests de dinero/revisión usan
fixtures sintéticos solo en D1 efímera; no se importaron a D1 remoto o catálogo público.
Se compiló el paquete de contratos para tests; no se regeneró el runtime público ni
se ejecutaron builds de landing/Admin. El aislamiento inspecciona artefactos existentes.
No se repite aquí como resultado actual la auditoría npm de la raíz de fases previas;
sus avisos anteriores están documentados y sus dependencias permanecen intactas.

El candidato remoto está intencionalmente incompleto, NO validado como desplegable.
No se probaron JWT/roles contra la cuenta real, R2 remoto, DNS, MFA, CORS productivo,
publicación, migración remota o recuperación real: no son parte de este cierre.

Comandos locales desde la raíz:

```powershell
npm --prefix infra/cloudflare/dev run validate:config
npm --prefix infra/cloudflare/dev run migrate:local
npm --prefix infra/cloudflare/dev run migrations:list:local
npm --prefix infra/cloudflare/dev run typecheck
npm --prefix infra/cloudflare/dev run lint
npm --prefix infra/cloudflare/dev test
```

## 8. Pendientes de vinculación real

- Cuenta Cloudflare y account ID exactos, con permiso efectivo de lectura/provisión.
- UUID D1 real de kuwago-admin-db-development y cuenta de pertenencia.
- Confirmación por panel del bucket kuwago-media-development, privacidad y ausencia
  de bindings accidentales del Worker Hello World a otros entornos.
- ID de app Access, issuer de equipo, AUD y hostnames protegidos, políticas acumuladas,
  previews/versiones y fecha de compatibilidad del Worker; sin tokens/cookies.
- Mínimo de permisos, presupuesto, alertas, MFA, miembros y bootstrap aprobados.
- Decisión sobre gateway y API interna final; no añadir catálogo público al bucket privado.

No son secretos: account ID, D1 ID, app ID, issuer y AUD. Pueden completarse mediante
lectura autorizada del panel o entrega manual de esos metadatos; nunca mandar tokens,
contraseñas, cookies, JWT o códigos de acceso. R2 no necesita inventar un UUID de bucket.

## 9. Puertas exactas para la siguiente fase

1. Revisar estos 17 archivos, SQL/checksums, límites y restricciones; aprobar el modelo
   y resolver miembros/MFA, permisos de medios y estrategia de ingress.
2. Completar solamente los metadatos de DEV anteriores desde lectura autorizada
   disponible. Si la herramienta sigue bloqueada, hacerlo manualmente; no rodear
   el bloqueo de Computer Use, refrescar credenciales o crear tokens innecesarios.
3. Autorizar un bloque local separado, por ejemplo: «Autorizo Fase 2B.3 local:
   implementar validación Access JWT y permisos en servidor con pruebas negativas,
   sin deploy, sin migraciones remotas ni cambios Access/DNS». Antes de nuevos
   endpoints deben estar listas las pruebas de firma, issuer/AUD/exp, principal/rol,
   Origin, cuerpos/límites y acceso a medios. No usar el Admin React como autoridad.
4. Presentar código y diff de configuración DEV real para revisión, incluyendo
   efecto explícito sobre workers.dev/previews/Hello World y plan de rollback.
5. Pedir autorización remota SEPARADA para aplicar exactamente los SQL identificados
   por checksum a cuenta/DB verificadas; comprobar vacío o backup/bookmark y FK antes
   y después. Ninguna creación/config local autoriza automáticamente esta migración.
6. Pedir autorización remota SEPARADA para sustituir Hello World con el Worker
   revisado, sus bindings/permisos y estrategia de exposición; desplegar no está
   implícito en migrar. Access, DNS y roles reales requieren su aprobación si cambian.
7. Mantener mutaciones deshabilitadas hasta probar acceso anónimo, identidad no
   autorizada, JWT falso/expirado/AUD ajena, rol revocado, CSRF y ausencia de acceso
   público a imágenes. Habilitar escrituras es otra puerta; Hostinger sigue aislado.

Esta fase se detiene aquí: ningún deploy, Access, migración remota, DNS, Hostinger,
token nuevo, contenido comercial, commit o push ejecutado.
