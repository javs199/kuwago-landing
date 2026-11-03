# Migración 0001 con baseline fresco verificado — resultado

25/10/2026 · America/Costa_Rica · **PASS: aplicada únicamente `0001_admin_catalog.sql`, una sola vez.**

Autorización consumida: `3e3bc6b0-b6dd-41be-98be-7e5910494a92`.

Finalización: `2026-10-25T21:12:24.764Z`, **15:12:24 de Costa Rica**.

## Evidencia remota

| Control | Resultado |
|---|---|
| Cuenta y destino | `7a8bcd7992a3de359d2aff87df2fb693`; `kuwago-admin-db-development`; UUID `c5cfbe44-4fd0-4c2a-83c1-b833935534ba` |
| Respaldo e informe aprobados | Ubicación, ACL, identidad y hashes fijados verificados; restauración SQLite local correcta |
| Baseline previo | Dos snapshots completos, etapa 0, **0 tablas de aplicación y 0 filas**, fingerprint igual al respaldo |
| Fingerprint previo | `2c183f6290f0877cb22085c7c6c4b7da5cfdb7cd3c56eb775520f4e77df555e6` |
| Bookmark fresco | Tres lecturas iguales durante la captura y nueva igualdad justo antes del escritor; valores privados |
| Hash de 0001 | `33bd2451b568acf1c316fcc5355bca1e1cd87deacace72d3819233a00e670abd`, coincide con manifiesto cerrado |
| Lotes mutantes | **Uno**, respuesta HTTP 200; sin reintento |
| Postflight | `inspect(1)` remoto aprobado: esquema, historial, integridad referencial, seeds y tablas de contenido vacías |
| Hash del esquema de etapa 1 | `9faeb21e6b3c899dbe1e3fc2c70f5b25552e9f0169162a679f163ee5855aa26d` |
| Historial | Exactamente una fila: id `1`, nombre `0001_admin_catalog.sql`; fecha de aplicación presente y válida según el verificador |
| Solicitudes API | **35**, todas HTTP 200: un lote mutante y 34 lecturas de comprobación |
| Credencial | `credentialDisposed:true`; entrada privada, sin guardado de token |
| Estado final | `completed_0001_only`, `postflightVerified:true`, `historyVerified:true` |

El lote único incluyó las guardas del ejecutor, creación del ledger cuando aún no existía, las sentencias aprobadas de 0001 y su registro en `d1_migrations`. La guarda temporal se retiró dentro del lote; un resto habría impedido la coincidencia del hash de esquema posterior.

## Tablas verificadas

El esquema remoto coincidió con las **21 tablas definidas en 0001**, además de `d1_migrations`:

```text
principals, roles, permissions, role_permissions, principal_roles,
categories, category_translations, services, service_revisions,
service_translations, option_identities, service_options,
option_translations, option_prices, media_assets, revision_media,
revision_media_translations, commercial_approvals, audit_events,
publication_commands, publication_outbox
```

Los índices y definiciones también forman parte del hash de esquema comparado. Las tablas reservadas de Cloudflare no se cuentan como tablas de aplicación. La verificación del historial no acepta una segunda fila ni un nombre distinto. Las comprobaciones de tablas vacías y seeds confirman que **no se crearon administradores ni Super Admin, servicios comerciales o datos privados**. Las definiciones iniciales de roles/permisos son parte de 0001 y no constituyen cuentas privilegiadas.

## Preservación del respaldo y baseline separado

El respaldo original sigue en:

```text
C:\Users\JV\AppData\Local\Kuwago\D1Backups\development\
  7a492026-01dd-49fc-9ecb-40997d5b9e56\backup.kwgbak
```

SHA-256, sin cambios:

```text
bb6720bef5a5ce514e8ffb4867c31026ed88adb76cdcc4082f9a7664bb14eb37
```

El baseline fresco comenzó a las **15:12:16.820** y quedó verificado a las **15:12:19.624** de Costa Rica. Se guardó con creación exclusiva, fsync y hash comprobado por lectura posterior antes de permitir escribir. No se sustituyó ni recifró el respaldo.

Registro separado:

```text
migration-0001-3e3bc6b0-b6dd-41be-98be-7e5910494a92.baseline.private.json
```

Está bajo la misma raíz de custodia protegida y conserva el bookmark histórico del respaldo, el de la auditoría revisada y el fresco, **todos protegidos con DPAPI CurrentUser**, sin valores en claro. Incluye `doesNotReplaceBackup:true` y referencia al ciphertext original.

SHA-256 del registro privado:

```text
fa8801f7f39a95f92c7ba43bdf8bba005e06a0d1f826714e80b0e2d4fbbf2953
```

Se comprobó localmente que coincide con el hash incluido en el resultado. El recibo identifica `originalBookmarkPreserved:true` y la auditoría revisada `9e727e66-ad85-4d6f-b1a8-e976ab2397ce`.

El respaldo, los dos registros del intento de migración detenido anteriormente y sus informes/diagnóstico se compararon mediante SHA-256 antes y después: **los cinco archivos permanecen idénticos**. No se eliminaron marcadores consumidos.

## Guardas y pruebas

Se habilitaron exclusivamente la autorización nueva de 0001 y la política de baseline ya revisada. El transporte siguió limitado a un lote aprobado de etapa 0; no hay bucle de migraciones en esta entrada. La guarda SQL comprueba esquema e historial dentro del lote; también se comprobaron identidad, dos snapshots, fingerprint, tres bookmarks estables, evidencia privada persistida, preflight reciente y bookmark inmediatamente previo. No se detectó diferencia concurrente.

Antes del formulario pasaron **42/42 pruebas locales**, lint, TypeScript, build y parser PowerShell. Incluyen diferencias de esquema/bookmark, ausencia de evidencia durable, rollback local y rechazo de segundas etapas o lotes arbitrarios. No se ensayó una carrera o rollback destructivo en D1 remoto; el resultado observado fue una ejecución satisfactoria seguida de postflight.

El token existente D1 Read + D1 Write se introdujo solo en el formulario enmascarado y viajó por stdin privado. No se pidió la clave de recuperación, no se generó otra credencial y no se leyeron campos privados o portapapeles desde Codex. No se hicieron capturas de pantalla ni se guardaron secretos, SQL de respaldo o bookmarks en claro. El descarte local no revoca el token en Cloudflare ni garantiza borrado físico absoluto de memoria administrada.

## Cierre y límites

Se conservaron fuera del repositorio, bajo la custodia existente:

```text
migration-0001-3e3bc6b0-b6dd-41be-98be-7e5910494a92.attempt.json
migration-0001-3e3bc6b0-b6dd-41be-98be-7e5910494a92.result.json
migration-0001-3e3bc6b0-b6dd-41be-98be-7e5910494a92.baseline.private.json
```

Tras terminar se cerraron `firstMigrationApproved=false` y `firstMigrationVerifiedBaselineEnabled=false`. `remoteExecutionEnabled=false` permanece sin cambios. La autorización está consumida.

No se ejecutaron 0002–0006, bootstrap de Super Admin, nuevo export, restauración remota, cambios de Access/DNS/Hostinger, despliegue, commit o push. Después del resultado solo se realizaron comprobaciones locales de evidencia y cierre de guardas; no se hicieron llamadas remotas adicionales.

**Se detiene con PASS para 0001 exclusivamente. Cualquier siguiente etapa necesita autorización independiente.**
