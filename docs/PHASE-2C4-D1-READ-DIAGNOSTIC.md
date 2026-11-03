# Fase 2C.4 — Diagnóstico D1 con credencial de lectura

24/10/2026 · America/Costa_Rica.

**Estado: diagnóstico remoto de lectura aprobado.** El usuario ejecutó personalmente el formulario. GET de metadatos y SELECT del esquema devolvieron HTTP 200, sin error 10000. Se hicieron exactamente dos solicitudes a la D1 autorizada, sin reintentos ni escrituras SQL.

Ejecución: 24/10/2026, 22:34:05–22:34:06 en Costa Rica (`2026-10-25T04:34:05.115Z` a `2026-10-25T04:34:06.039Z`). Evidencia depurada: `infra/cloudflare/dev/.wrangler/phase2c4/result.json`; estado del formulario: `completed`.

## Objetivo y recurso permitido

Se revisó primero `docs/PHASE-2C3-D1-BOOTSTRAP-READINESS.md`. Se conserva su diagnóstico diferencial: el error 10000 del OAuth anterior es compatible principalmente con autorización D1 insuficiente, pero no demuestra por sí solo un defecto de Wrangler ni una causa exclusiva.

- Cuenta: `7a8bcd7992a3de359d2aff87df2fb693`.
- Base: `kuwago-admin-db-development`.
- UUID: `c5cfbe44-4fd0-4c2a-83c1-b833935534ba`.
- Credencial declarada por el usuario: D1 Read exclusivamente, alcance de cuenta, caducidad de siete días. Esas propiedades no se han certificado mediante inspección de políticas del token.

No se listan ni consultan otras bases. La herramienta rechaza cualquier cuenta o UUID distinto de estos valores.

## Procedimiento preparado

1. `infra/cloudflare/dev/scripts/d1-read-credential.ps1` presenta un campo enmascarado mediante Windows Forms. El usuario introduce la credencial fuera del chat, Codex y los argumentos de comandos; no se incorpora al historial de PowerShell.
2. Se entrega únicamente al proceso Node hijo mediante `CLOUDFLARE_API_TOKEN`, con cuenta y UUID suministrados localmente. El token no se guarda en archivos.
3. `infra/cloudflare/dev/scripts/d1-read-diagnostic.mjs` realiza un GET de metadatos de la base exacta. Solo si tiene éxito y coincide nombre/UUID, realiza POST `/query` con esta única sentencia fija:

```sql
SELECT name, type, sql FROM sqlite_schema
WHERE type IN ('table','index','trigger','view')
AND name NOT LIKE 'sqlite_%'
ORDER BY type, name
```

POST es el transporte del endpoint SQL; la sentencia es exclusivamente SELECT. No se consulta contenido de tablas de negocio. Las definiciones SQL recibidas se descartan; solo se conservan nombres técnicos y contadores depurados.

4. No hay reintentos ni seguimiento de redirecciones. Hay timeout y límite de tamaño de respuesta. Cualquier fallo detiene el recorrido; un 10000 conserva solamente código y descripción genérica de rechazo de autenticación/autorización.
5. Un marcador local de intento impide repetir accidentalmente la ejecución y preserva la evidencia previa. No se usa Wrangler, OAuth alternativo, analítica GraphQL ni `d1 migrations list`.
6. Se elimina la variable del proceso hijo antes de I/O y en `finally`; se elimina Authorization de los encabezados retenidos al terminar. El formulario borra el campo, retira la copia de entorno del lanzador y descarta sus referencias. No se promete borrado físico de todas las copias de cadenas en memoria administrada.

Los archivos locales de estado y resultado depurado quedan bajo `infra/cloudflare/dev/.wrangler/phase2c4/`, excluido por Git. No contienen credenciales; no se crean archivos temporales con secretos. El formulario terminó y su proceso ya no está activo. El resultado confirma `credentialCleared: true`; no se inspeccionó el campo del token ni la memoria del proceso. No existe archivo temporal con secretos que eliminar. Esto no revoca la credencial en Cloudflare ni elimina copias que el usuario pueda conservar fuera del flujo.

## Evidencia actual

| Comprobación | Resultado |
|---|---|
| GET de metadatos real | HTTP 200; nombre y UUID coinciden exactamente con la D1 autorizada; tamaño informado: 12.288 bytes |
| SELECT de esquema real | HTTP 200; una definición: tabla interna `_cf_KV` |
| Capacidad efectiva D1 de lectura | Confirmada para metadatos y SELECT de esquema sobre esta D1 |
| Ausencia de permiso de escritura / TTL del token | Declaración del usuario; no probada mediante operaciones mutantes ni introspección |
| Estado actual de la base | 0 tablas de aplicación; sin `d1_migrations`, `principals` ni `services`. No se consultó contenido de tablas |
| Diagnóstico del 10000 | No se reproduce con la credencial D1 Read actual vía REST; la causa exclusiva del fallo OAuth anterior no queda demostrada |
| Pruebas automatizadas nuevas | 4 aprobadas, exclusivamente simuladas |
| Lint del backend | Aprobado |
| Sintaxis del formulario PowerShell | 0 errores de parseo |
| Exclusión Git de evidencias locales | Confirmada con `git check-ignore` |

Pruebas reproducibles desde `infra/cloudflare/dev`:

```powershell
node --test test/d1-read-diagnostic.test.mjs
npm run lint
```

Las regresiones verifican orden GET → SELECT, objetivo fijo, rechazo de configuración incorrecta, parada inmediata ante 10000, credencial ausente, respuesta de otra base, fallos de red, redirecciones, ausencia de reintentos, depuración y eliminación del token del entorno. No realizan conexiones remotas.

## Interpretación del resultado y siguiente paso

- Si GET y SELECT funcionan: queda comprobada lectura REST para esta credencial y esta D1. Comparado con el OAuth anterior, refuerza la hipótesis de autorización insuficiente de aquella sesión, pero no constituye una comparación del mismo credential entre REST y Wrangler.
- Si aparece 10000: registrar HTTP, código y descripción depurada; detenerse sin SQL adicional, sin reintento ni ampliación de permisos. Revisar manualmente vigencia, cuenta, alcance y restricciones del token, sin divulgar su valor.
- Si solo GET funciona: queda probada lectura de metadatos, no lectura SQL. Registrar la respuesta del segundo paso sin inferir permisos adicionales.
- No probar escritura para demostrar que el token es Read-only. No interpretar lectura exitosa como autorización para migrar o crear administradores.

### Conclusión del diagnóstico

La cuenta y el UUID suministrados son correctos y accesibles mediante la credencial actual. Los dos HTTP 200 confirman que D1 responde y permite las lecturas requeridas. No se reprodujo el error 10000. Frente al fallo del OAuth anterior sin D1 declarado, esto refuerza la hipótesis de autorización insuficiente de aquella sesión; no demuestra que Wrangler carezca de problemas, pues se usaron credenciales y clientes distintos. No se amplió OAuth ni se probó de nuevo el CLI.

No se certifican mediante estas lecturas la exclusividad de D1 Read, la ausencia de Edit, el alcance completo de la política ni la caducidad de siete días: son propiedades declaradas por el usuario. No se intentó escribir para probar la restricción.

**Siguiente paso recomendado:** revisar este informe y autorizar por separado la preparación de respaldo y migraciones DEV del procedimiento 2C.3. La credencial Read no debe ampliarse ni reutilizarse como si habilitara escrituras. Migraciones y bootstrap requieren permisos y autorizaciones independientes; no se ejecutaron. Se conserva el marcador de intento para impedir repeticiones accidentales.

No se ha hecho commit, push, deploy ni modificación de configuración de Cloudflare, Hostinger, Access o DNS. Las únicas operaciones remotas de esta fase fueron el GET y el SELECT autorizados. La fase se detiene para revisión.

## Fuentes oficiales consultadas

La referencia oficial documenta el GET de metadatos y el endpoint de consulta, con permisos D1 Read/Write aceptados. Que un endpoint acepte ambos no certifica los permisos exclusivos de una credencial concreta:

- [Get D1 Database](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/).
- [Query D1 Database](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/).

## Archivos de esta fase

- `infra/cloudflare/dev/scripts/d1-read-diagnostic.mjs`.
- `infra/cloudflare/dev/scripts/d1-read-credential.ps1`.
- `infra/cloudflare/dev/test/d1-read-diagnostic.test.mjs`.
- `docs/PHASE-2C4-D1-READ-DIAGNOSTIC.md`.

Los cambios previos del repositorio se preservan. No se modifica la landing, las migraciones ni la infraestructura.
