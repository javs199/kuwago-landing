# Backup-only remoto — token declarado D1 Read + D1 Write

25/10/2026 · America/Costa_Rica · **PASS: exportación, cifrado e integridad/restauración local verificados.**

Autorización consumida: `2051650b-dfbc-4917-afb9-f2f81796df4f`.

Operación: `7a492026-01dd-49fc-9ecb-40997d5b9e56`.

Finalización: `2026-10-25T20:39:37.900Z`, 14:39:37 de Costa Rica.

## Resultado depurado

| Comprobación | Resultado |
|---|---|
| Cuenta y destino fijos | `7a8bcd7992a3de359d2aff87df2fb693`; `kuwago-admin-db-development`; UUID `c5cfbe44-4fd0-4c2a-83c1-b833935534ba` |
| ACL y custodia Windows | PASS, NTFS y DACL protegida verificadas localmente y dentro del flujo |
| Identidad y esquema antes de exportar | PASS, baseline etapa 0 |
| Bookmark Time Travel previo | PASS; GET HTTP 200 y formato válido |
| Inicio de export | **Un único POST `/export`, HTTP 200** |
| Sondeos / reinicios | Cero / cero; la primera respuesta permitió descargar el export completo |
| Coherencia posterior | Snapshot/fingerprint y bookmark iguales a los previos |
| Solicitudes API | Trece, todas HTTP 200: seis previas, un export y seis posteriores |
| Descarga | Una descarga HTTPS mediante URL firmada, sin reenviar Authorization/cookies y sin guardar el enlace |
| Cifrado | AES-256-GCM; envolturas DPAPI CurrentUser y recuperación scrypt-AES-GCM |
| Vías de descifrado | Ambas comprobadas en memoria durante el flujo |
| Lectura del archivo persistido | SHA-256 coincidente con la evidencia; descifrado y restauración correctos |
| Restauración SQLite aislada | PASS: fingerprint de esquema/contenido, quick_check y FK |
| Nueva recuperación desde otro proceso Node | PASS, `verified_local_recovery`, **0 tablas de aplicación y 0 filas**, consistentes con la D1 sin migraciones |
| Limpieza / credenciales | `cleanupComplete=true`, `credentialDisposed=true` |
| Estado de autorización al finalizar | Consumida; `backupExecutionApproved=false`, `backupRemoteEnabled=false` |

No se generó otra clave de recuperación. El usuario introdujo el token nuevo y su clave existente mediante campos ocultos del formulario privado. No se solicitaron en chat ni argumentos, ni se guardaron secretos sin cifrar, SQL descargado, bookmarks en claro, URL firmada o cuerpos crudos en registros. No se hicieron capturas ni se leyeron campos privados/portapapeles desde herramientas de Codex.

## Archivo protegido

```text
C:\Users\JV\AppData\Local\Kuwago\D1Backups\development\
  7a492026-01dd-49fc-9ecb-40997d5b9e56\
    backup.kwgbak
    evidence.json
```

Tamaño del contenedor cifrado: **1.623 bytes**.

SHA-256 del contenedor, no de la clave:

```text
bb6720bef5a5ce514e8ffb4867c31026ed88adb76cdcc4082f9a7664bb14eb37
```

La carpeta final solo contiene esos dos archivos. `evidence.json` registra `restoreVerified:true`, algoritmo, protección de claves, tamaño y hash, sin SQL ni bookmark expuestos. El bookmark y los metadatos privados necesarios para recuperación están dentro del contenido cifrado.

La revisión local posterior confirmó ausencia de `.pending-7a492026-01dd-49fc-9ecb-40997d5b9e56` y retirada de `backup-only.lock`. Los marcadores permanentes de autorización no se eliminan.

Registro del intento y resultado, fuera del repositorio:

```text
backup-once-2051650b-dfbc-4917-afb9-f2f81796df4f.attempt.json
backup-once-2051650b-dfbc-4917-afb9-f2f81796df4f.result.json
```

Ambos están bajo la misma raíz protegida de custodia. Solo contienen identidad del recurso, estados, HTTP/códigos depurados, fechas y referencias no secretas al artefacto.

## Evidencia anterior y verificaciones locales

Se compararon SHA-256 antes y después para los cuatro registros de los dos intentos fallidos y sus dos informes. **Los seis archivos permanecen idénticos.** No se borraron, sobrescribieron o reutilizaron los marcadores consumidos ni los paquetes de recuperación anteriores.

Antes de abrir el formulario: **36/36 pruebas locales aprobadas**, lint, TypeScript, build y parser PowerShell correctos. Los tests no emitieron el permiso de ejecución real. El formulario se ajustó al permiso declarado D1 Read + D1 Write y conservó las advertencias de capacidad de escritura fuera de la herramienta y la prohibición de SQL remoto mutante dentro de este flujo. La cuenta/UUID y baseline siguen fijados; no se aceptó SQL o destino arbitrarios.

Tras finalizar se ejecutó solamente una comprobación **local** adicional con el CLI existente `d1-backup-recover.mjs` sobre el archivo guardado, sin consultas remotas. Confirmó restauración y los conteos de la base vacía. Después se comprobó el hash del ciphertext y los archivos finales; no se imprimió SQL ni material de claves.

## Interpretación y límites

La credencial proporcionada para este intento sí fue aceptada para exportar esta D1. Sus permisos D1 Read + D1 Write son declarados por el usuario; `tokenPermissionIndependentlyVerified=false`. Este éxito confirma capacidad efectiva de esa credencial, pero no demuestra el permiso mínimo universal ni la causa exclusiva de los anteriores 401/10000.

La recuperación independiente con la clave existente pasó dentro del flujo. La comprobación posterior desde otro proceso utilizó DPAPI en este Windows; no se afirma una restauración ejecutada en otro equipo o una restauración D1 remota. La D1 estaba vacía de tablas de aplicación: este resultado no sustituye una prueba posterior de exportaciones reales con contenido administrativo cuando exista.

La limpieza descarta referencias y sobrescribe buffers controlados; no promete borrado físico de strings administradas, paging o volcados. El descarte local no revoca el token en Cloudflare. No se revocó ni alteró ninguna credencial remotamente; su revocación queda a cargo del usuario tras esta intervención.

No se ejecutaron SQL remoto de escritura, migraciones, bootstrap de administradores, restauraciones remotas, despliegues, cambios de Access/DNS/Hostinger, commit o push. El export no inició un flujo de migraciones y no hubo otro intento.

**Se detiene con PASS para este respaldo y la autorización consumida. Cualquier paso remoto posterior requiere autorización propia.**
