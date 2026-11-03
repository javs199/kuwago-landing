# Preparación local posterior al cierre de migraciones

26/10/2026 · America/Costa_Rica. **Esquema DEV completo 0001–0006. Bootstrap y despliegues bloqueados.**

## Trabajo ya existente que se conserva

- Verificación Access RS256/JWKS, issuer/AUD y tiempos: `infra/cloudflare/dev/src/auth/access.ts`.
- Identidad estable `issuer + subject`, consulta de principal habilitado y roles canónicos por D1: `src/auth/rbac.ts` y middleware. No se utiliza email como autorización ni se aprovisiona al iniciar sesión.
- Gateway protegido y mismo origen: `src/gateway.ts`, `ASSETS` y Service Binding `ADMIN_API`; JWT antes de servir archivos, sesión RBAC, CSRF, rutas permitidas y headers de seguridad.
- API local, Services CRUD, revisiones, publicación, reconciliación y multimedia implementados en fases anteriores. React usa `/api/v1` y `credentials:same-origin`; el login/harness de test solo se permite localmente.
- Plantillas Wrangler locales y ejemplo remoto fail-closed ya existentes. No se reemplazan ni se ejecuta otro ciclo de builds/E2E validados.

Lo confirmado hoy es la migración D1 y su cierre. No se desplegó el backend real ni el Admin remoto; el último estado remoto del Worker documentado era Hello World, sin reconsultarlo en esta preparación. La configuración actual del futuro gateway, bindings, Access y audiencias no queda acreditada solo por terminar SQL.

## Preparación concreta realizada

Se añadió `infra/cloudflare/dev/next-stage/development-plan.json`, documento inerte, no configuración Wrangler ejecutable. Fija la única cuenta/D1 DEV, hashes de resultado/cierre/checkpoint 6 y el fingerprint confirmado. Mantiene todos los gates remotos en falso y deja identidades/origen/AUD en null hasta verificar sus valores, sin inventar personas ni subjects.

Se añadió `scripts/next-stage-readiness.mjs`: comprueba **solo archivos locales** de cierre, historial 0001–0006, esquema y coincidencia de hashes, y localiza los componentes reutilizados. No importa un transporte remoto ni ejecuta SQL, login, build o deploy. Su salida informa `bootstrapReady:false` y `deployReady:false` con pendientes concretos. No es una nueva consulta a Cloudflare ni una nueva suite de pruebas.

Comando de inspección local:

```text
node infra/cloudflare/dev/scripts/next-stage-readiness.mjs
```

## Bootstrap: decisiones que impiden ejecutar todavía

**Actualización 26/10/2026:** la propuesta anterior de segundo humano que sigue debajo queda conservada como historia, no como una exigencia de Cloudflare ni del SQL. Jesús confirmó ser el único operador. La propuesta vigente para revisión, evidencias remotas de Access y lote local están en `docs/DEV-SINGLE-OPERATOR-BOOTSTRAP.md`. No se habilita ninguna escritura por esta actualización. El `CHECK` de principals distintos permanece intacto.

1. Identificar y aprobar al destinatario y a un **segundo humano real** como concedente. `administrator_roles` exige `principal_id <> granted_by`. No crear un operador ficticio ni desactivar esa restricción.
2. Obtener sus identidades estables mediante un flujo privado que reutilice `createAccessVerifier`, con RS256/JWKS, issuer, AUD y tiempos comprobados. No pedir JWT en chat, aceptar claims decodificados sin firma, confiar solo en email ni almacenar tokens. Todavía falta preparar/revisar ese mecanismo operador para personas reales; no se declara listo.
3. Revalidar la aplicación Access y su alcance. La AUD histórica de la app del Worker no debe copiarse como si ya fuera la del gateway nuevo. Confirmar origen canónico HTTPS, destinatarios/concedente admitidos, MFA y sesión. No activar políticas en esta fase.
4. Antes de un alta remota futura, preflight específico de etapa 6 y recuperación: hoy el último export completo verificado es etapa 4. Los checkpoints 5/6 no sustituyen un export. Definir/aprobar el respaldo o recuperación previa al bootstrap sin hacer ahora exportaciones preventivas.
5. Preparar después un ejecutor operador exclusivamente parametrizado, con destino fijo, identidad verificada y aprobación humana vinculadas, operación única y precondiciones contra duplicados. Su lote atómico debe crear/activar explícitamente los principals aprobados, asignar al destinatario `super_admin` con concedente distinto y escribir `audit_events` con actor real, entity_id, request_id y outcome. No añadir campos JSON inexistentes al esquema de auditoría ni usar `INSERT OR REPLACE`.
6. Probar en aislamiento el batch exacto, su auditoría, carreras y rollback una vez definidas esas identidades/evidencias y el alcance. No se implementa un escritor incompleto con personas inventadas para aparentar que esos puntos ya están resueltos.
7. Preparar revocación del rol/principal, recuperación con operador real y revocación Access bajo autorización separada. Los roles seed `super_admin` no son cuentas ni conceden acceso a nadie por sí mismos.

## Integración Admin/API DEV: orden preparado

1. Confirmar origen y aplicación Access del gateway, AUD/issuer y política efectiva. Mantener API, previews y endpoints alternativos sin ingress público; no asumir que la protección de la URL actual del Worker cubre otro gateway.
2. Preparar un candidato Wrangler revisado reutilizando fuentes actuales: gateway solo `ASSETS + ADMIN_API`; API privada con D1 DEV, media privada y publicación según recursos realmente existentes; barrera/reconciliador aislados. No crear recursos, activar Images o programar Cron automáticamente.
3. Reutilizar el build React independiente y cliente relativo. Excluir harness de test, no usar `VITE_LOCAL_TEST_LOGIN=true` remotamente, no introducir JWT permanentes en navegador. Verificar que `APP_ENV`, Access y origen incompletos fallen de forma cerrada.
4. Desplegar solo con autorización posterior de nombres, bindings, versión y rollback. Primero backend privado/controles; gateway protegido desde el primer acceso; Admin autorizado únicamente tras bootstrap. No exponer assets de Admin durante un estado intermedio sin protección.
5. Aceptación remota posterior: anónimo denegado, JWT incorrecto/expirado, cuenta sin rol, destinatario habilitado, CSRF, rutas/preview alternativas, sesión ES/EN/tema/responsive, Services y media privada. Las operaciones de escritura de aceptación deben autorizarse aparte y utilizar datos sintéticos.

## Próxima acción remota concreta

**Autorizar solo verificación/captura privada de identidad Access del destinatario y concedente real y revisión de la app/origen/AUD para DEV.** Alcance: consultas y comprobación criptográfica de identidad, sin D1 mutante, alta de administrador, cambios Access, deploy o DNS. Antes debe revisarse el pequeño mecanismo operador de captura/verificación; no se enviarán tokens al chat.

Tras esa evidencia se puede completar el batch de bootstrap y su ensayo local; después se solicitan separadamente respaldo/preflight, alta remota y despliegues. No hay autorización de esas acciones en esta preparación. Los gates y ejecutores de migración consumidos permanecen bloqueados.

No se modificaron React, landing, Hostinger, producción, otros proyectos ni los originales SQL. No se crearon cuentas reales ni se ejecutaron pruebas globales, exportaciones, builds, migraciones adicionales, despliegues, commit o push al preparar esta siguiente etapa.
