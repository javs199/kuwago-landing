# Verificación final de recuperación D1

25/10/2026 · America/Costa_Rica.

**Resultado de la ceremonia privada: PASS.** El material introducido en la primera sesión permitió cifrar el respaldo sintético; el introducido de nuevo en la segunda sesión permitió descifrarlo y restaurar exactamente los datos esperados, sin DPAPI.

El usuario informó que custodió su clave existente en el Gestor de Contraseñas de Google y pudo acceder desde su Samsung. Es una declaración del usuario; no se accedió a su gestor, teléfono, pantalla, portapapeles ni clave mediante herramientas de Codex.

Operación preparada: `7028bcc1-38d8-4faa-866f-7638d8e1a80a`.

## Evidencia final comprobada

| Control | Resultado |
|---|---|
| Cifrado con clave existente, sin generar otra clave de recuperación | PASS |
| Segunda entrada oculta, sesión independiente | PASS |
| Primer proceso PowerShell terminado antes de la restauración | PASS; secuencia de tiempos verificada |
| Procesos PowerShell | 83836 y 83104; ambos finalizaron con código 0 |
| Procesos Node de cifrado/restauración | 20612 y 80532, distintos |
| Restauración SQLite aislada | PASS, `restoreVerified=true` |
| Contenido exacto contra fixture fijo | PASS, `exactFixtureMatch=true`; una tabla y dos filas |
| DPAPI utilizado para recuperación | No, `dpapiUsed=false`; el paquete no contiene esa envoltura |
| Hash del contenedor entre etapas | Idéntico |
| Resultado del lanzador al terminar ambas sesiones | `PASS` |
| Archivos finales | Solo `synthetic.kwgbak`, `encrypt.json`, `restore.json`, `sessions.json`; sin SQL descifrado ni archivos de claves |

SHA-256 del **contenedor cifrado**, no de la clave:

```text
33731783dbfb906c2f902ca1c41c3f15b2ebf496f6be32513c2e1020ab434253
```

Registros UTC de creación del cifrado y restauración: `2026-10-25T19:40:56.699Z` y `2026-10-25T19:42:55.636Z` (13:40:56 y 13:42:55 de Costa Rica). Solo se leyeron resultados depurados, nunca el campo privado ni el portapapeles desde Codex. No se hicieron capturas de pantalla.

El acceso al gestor desde Samsung es evidencia declarada por el usuario. La ejecución de restauración comprobada se realizó en Windows, con sesiones independientes; no se presenta como una restauración ejecutada en Android o en un segundo equipo físico. La procedencia de ambas entradas desde el gestor fue confirmada privadamente en la interfaz, no mediante acceso automatizado a la bóveda.

Se prepararon dos ventanas privadas en procesos PowerShell distintos. La primera solo cifra; el lanzador espera su terminación completa antes de abrir una segunda ventana vacía. Cada ventana recibe una nueva entrada oculta de la clave existente y la entrega exclusivamente por pipe privado a un hijo Node. No se genera otra clave de recuperación. Las claves de datos/nonce/salt internas de AES-GCM se generan como parte normal del cifrado; no sustituyen el material custodiado.

El respaldo contiene únicamente `synthetic_recovery_probe`, con dos filas sintéticas fijas. El contenedor de prueba omite la envoltura DPAPI. Se reutilizan AES-GCM, el decodificador de formato y el verificador portable existentes. La restauración usa SQLite aislada en memoria, con comprobación de integridad, relaciones y fingerprint de esquema, tipos y todas las celdas contra una referencia fija de código, además del hash SQL y del ciphertext. No basta con comparar conteos.

Evidencia exclusivamente depurada, fuera del repositorio y bajo la ACL de custodia existente:

```text
C:\Users\JV\AppData\Local\Kuwago\D1Backups\development\
  recovery-proof-7028bcc1-38d8-4faa-866f-7638d8e1a80a\
    synthetic.kwgbak
    encrypt.json
    restore.json
    sessions.json
```

Ante fallo puede existir `restore-failure.json` en lugar de un resultado exitoso. No se sobrescriben contenedores ni evidencias y no hay reintento automático. El paquete es una prueba y no se presenta como backup real D1.

**Validación previa:** 24/24 pruebas locales aprobadas; lint, TypeScript y build correctos. Incluyen rechazo con otra clave, contenido esperado distinto, identificador incorrecto y doble cifrado sobre el mismo destino. Se probó el CLI de ambas etapas con claves sintéticas en procesos distintos; las nuevas ventanas tienen parser correcto. Ninguna prueba automatizada generó una clave real de recuperación.

Archivos nuevos: `scripts/safe-d1/recovery-fixture.mjs`, `scripts/d1-recovery-proof-stage.mjs`, `scripts/recovery-proof-private.ps1`, `scripts/recovery-proof-launch.ps1` y `test/recovery-proof.test.mjs`, dentro de `infra/cloudflare/dev`. El verificador portable incorporó una restricción opcional al fingerprint esperado, sin cambiar sus usos anteriores.

Los arrays controlados se sobrescriben, los campos/referencias se limpian y los procesos terminan. Esto no promete borrado físico absoluto de strings, paging o volcados. La procedencia del secreto desde la bóveda depende de la intervención privada del usuario; el descifrado no certifica por sí solo esa procedencia.

No se modificaron backups reales, migraciones, Cloudflare o infraestructura. Sin tokens, conexiones remotas, SQL remoto, commit ni push. Esta prueba no autoriza exportación D1 ni migraciones.
