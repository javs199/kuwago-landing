# Fase 2C.5U — Custodia cifrada y operación backup-only

25/10/2026 · America/Costa_Rica · Implementación y comprobaciones locales.

**Resultado: controles locales de carpeta, cifrado, backup-only y limpieza implementados y probados.** Se creó y verificó la carpeta dedicada; un paquete sintético se cifró, se leyó desde disco, se descifró por dos vías y se restauró en SQLite aislada. No se presenta ese paquete como exportación real de Cloudflare.

**GO técnico local para revisión; NO-GO para ejecutar exportación remota en esta versión.** La nueva entrada tiene su propio `backupRemoteEnabled=false`. El permiso mínimo del endpoint de exportación permanece pendiente según 2C.5T; no se solicitó credencial para investigarlo. No se crearon tokens Cloudflare, no se consultó/exportó D1 remoto, no se aplicaron migraciones versionadas, no se modificaron D1/R2 reales, Access, Workers, DNS o Hostinger. Sin commit ni push.

## 1. Carpeta preparada y ACL verificadas

Ubicación:

```text
C:\Users\JV\AppData\Local\Kuwago\D1Backups\development
```

Antes de crear se verificó que no existía. El ancestro existente más próximo era `C:\Users\JV\AppData\Local`, con herencia activa y entradas para varios grupos/capacidades, además del usuario, SYSTEM y administradores. **No se modificó su ACL.** Solo la nueva carpeta `development` recibió una DACL propia, protegida de herencia.

Estado verificado mediante Windows, no mediante los modos POSIX de Node:

| Propiedad | Resultado |
|---|---|
| Sistema de archivos | NTFS |
| Propietario/operador | `JV\JV`, SID `S-1-5-21-1786902297-2290887561-850712940-1001` |
| Herencia en la raíz de custodia | Desactivada |
| DACL explícita | Exactamente dos entradas FullControl: operador y SYSTEM (`S-1-5-18`) |
| Entradas heredadas, Users/Everyone u otros grupos en esa raíz | Ninguna |
| Herencia a archivos/subcarpetas | ContainerInherit y ObjectInherit para esas dos identidades |
| ACL del padre tras preparación | Igual a la capturada antes; `parentAclUnchanged=true` |
| Junction/reparse en la ruta existente | Rechazados por el verificador; ruta aceptada sin ellos |
| Ubicación Git | Fuera del repositorio |
| Sincronización conocida | Fuera de las raíces OneDrive detectables por entorno; sin reparse points |
| Shares ordinarios | No se detectó uno que cubriera la ruta; no es UNC ni carpeta pública |

Windows reporta shares administrativos como C$/ADMIN$/A$. No se cambiaron ni se consideran acceso de un usuario ordinario: la DACL de custodia no les concede permisos adicionales. Un administrador elevado puede tomar posesión de archivos y SYSTEM es parte de la plataforma de confianza; no se afirma protección contra un host comprometido.

El verificador bloquea propietario/SID distinto, DACL más amplia, raíz ausente, filesystem no NTFS, reparse points, share ordinario y raíz de sincronización conocida. No amplía permisos para acomodar una sesión distinta. No se inició sesión con otro usuario ni se crearon cuentas para probarlo; la exclusión de otros usuarios se fundamenta en la DACL verificada, no en un login alternativo inventado. Agentes de copia de disco de terceros requieren inventario operativo; no se certifica su inexistencia por consultar OneDrive.

Durante el desarrollo se corrigió una incompatibilidad local al heredar rutas de módulos PowerShell 7 en un hijo Windows PowerShell 5.1: el helper retira `PSModulePath` únicamente del entorno de ese hijo. No se cambió la configuración permanente del sistema ni se relajó la ACL.

## 2. Cifrado y gestión de claves

Se implementó cifrado por archivo **AES-256-GCM**, con clave aleatoria nueva de 32 bytes por respaldo, nonce de 12 bytes y tag de autenticación de 16 bytes. El encabezado autenticado vincula formato, destino, operationId y modo; una prueba sintética no se etiqueta silenciosamente como operación remota. La alteración de ciphertext, tag o encabezado impide descifrar.

El contenido cifrado incluye SQL, hash SQL, fingerprint de origen y bookmark. En disco solo quedan el contenedor `.kwgbak` y evidencia depurada; no un `.sql`, ni un bookmark de recuperación expuesto en un manifiesto de contenido.

La clave AES tiene dos envolturas:

1. **DPAPI CurrentUser real de Windows.** Solo la identidad autorizada usa el helper de protección/desprotección. La entropía adicional fija vincula el propósito con Kuwago/D1 DEV. La clave sin envolver viaja únicamente por pipes privados entre Node y el hijo PowerShell, nunca en argumentos, archivos o terminal. El hijo no hereda variables Cloudflare.
2. **Recuperación independiente:** clave de recuperación de exactamente 32 bytes, derivada con scrypt N=32768, r=8, p=1, salt aleatoria de 32 bytes y envoltura AES-GCM separada. No se guarda esa clave ni su derivación sin cifrar en el repositorio o artefacto. El contenedor conserva solo salt y envoltura autenticada.

La clave de recuperación real deberá generarse con un CSPRNG y custodiarse por el operador en un gestor/medio privado aprobado, separado del archivo. No sirve una contraseña predecible rellenada a 32 bytes: comprobar longitud no demuestra entropía. **En esta fase únicamente se generaron claves criptográficas de prueba**, mantenidas en memoria y descartadas; no una credencial API ni una clave de producción que haya que recuperar del chat.

El pipeline verifica ambas vías de descifrado antes de persistir, vuelve a leer el archivo cifrado y lo descifra de nuevo antes de restaurar/promover. Buffers de clave, derivación, SQL y recuperación se sobrescriben cuando termina su uso. Las cadenas administradas, buffers internos del runtime, paging o dumps del sistema no permiten prometer borrado físico inmediato. No se presentan logs ni volcados de memoria como mecanismo de recuperación.

**No depende solo de NTFS ni de una afirmación de BitLocker:** la prueba demostró ciphertext y autenticación reales por archivo. BitLocker sigue sin estar certificado; protección del host, paging/hibernación y copias de sistema requieren su revisión operativa. El cifrado por archivo sustituye la dependencia exclusiva del cifrado de volumen para estos artefactos, sin afirmar que cifra todo C:.

Fuentes: [DPAPI ProtectedData](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata), [crypto de Node](https://nodejs.org/api/crypto.html). Se usaron APIs disponibles en Node 26.1.0 y Windows local, sin instalar dependencias ni contratar servicios.

## 3. Entrada independiente backup-only

Comandos desde la raíz del repositorio:

```powershell
# Prueba completa local, SQL y respuestas sintéticas; no necesita token real.
npm --prefix infra/cloudflare/dev run backup:proof

# Entrada normal: en esta versión devuelve blocked y no consulta Cloudflare.
npm --prefix infra/cloudflare/dev run backup:only

# Regresiones nuevas: no aplican las seis migraciones.
npm --prefix infra/cloudflare/dev run test:backup:only
```

`d1-backup-only.mjs` acepta únicamente cero argumentos o el modo explícito `--local-proof`. La prueba no es fallback ante una API caída. La rama remota permanece cerrada por código antes de leer credenciales o crear conexión. Cuando se autorice en otra fase, su interfaz privada usa stdin acotado desde un adaptador de captura aprobado, no argumentos ni entrada interactiva visible; el secreto de recuperación tampoco se solicita aquí. No se abrió un formulario ni se introdujo un token.

Grafo de la nueva entrada: transporte de lectura/export → snapshot → cifrado → almacenamiento cifrado → verificador de restauración. **No importa `write.mjs`, `runner.mjs` de migraciones ni el helper legacy `backup.mjs` que persistía SQL.** La prueba de dependencias comprueba ese aislamiento. El transporte nuevo no expone applyBatch, publicación o bootstrap; solo consultas de lectura de lista cerrada y export del destino fijo.

Flujo:

1. Verificar custodia antes de cualquier solicitud; adquirir lock exclusivo con `wx`.
2. Validar cuenta fija/nombre/UUID, snapshot e integridad de lectura.
3. Solicitar un export completo y descargarlo mediante el cliente acotado existente.
4. Comparar snapshot/bookmark antes/después; calcular hashes de contenido.
5. Cifrar en memoria y comprobar DPAPI y clave de recuperación.
6. Persistir únicamente ciphertext en la carpeta propia `.pending-<UUID>`, con evidencia todavía **no verificada**.
7. Releer/descifrar el archivo y restaurar SQL en SQLite nueva en memoria, sin entorno heredado ni conexión remota. Comparar esquema/filas y hash/fingerprint.
8. Marcar evidencia verificada y promover atómicamente la carpeta a `<UUID>`. Solo entonces el resultado indica `verified`.
9. Cerrar streams/abortar solicitudes activas, descartar credenciales y buffers, limpiar temporales/lock. Terminar; no hay llamada posterior al escritor.

Cuenta y UUID se conservaron: `7a8bcd7992a3de359d2aff87df2fb693`, `c5cfbe44-4fd0-4c2a-83c1-b833935534ba`, base `kuwago-admin-db-development`. No hay selector de otra D1 o SQL arbitrario. Se siguen respetando límites de descarga y verificación de 2C.5S.

## 4. Recuperación comprobada

Prueba real nueva, guardada fuera de Git, **sin datos privados**:

```text
C:\Users\JV\AppData\Local\Kuwago\D1Backups\development\
  2f74192e-a70d-4baf-8bb5-33ffede54190\
    backup.kwgbak
    evidence.json
```

Resultado: modo `local-synthetic-proof`, verified=true, cleanupComplete=true, credentialDisposed=true. Se ejecutó después otra instancia Node para recuperar ese archivo por DPAPI y verificar su restauración; devolvió `verified_local_recovery`, 0 tablas/filas del dump vacío sintético. También se probó cifrado/descifrado y restauración de un dump sintético **con una tabla y una fila**, sin ejecutar archivos de migración.

Desde `infra/cloudflare/dev`, comando local de verificación que no imprime SQL ni escribe una base remota:

```powershell
node scripts/d1-backup-recover.mjs 2f74192e-a70d-4baf-8bb5-33ffede54190
```

La recuperación por clave independiente está implementada en `decryptEnvelope` y el CLI ofrece `--recovery`, con entrada privada por pipe acotado; rechaza teclear el secreto en una consola TTY. No copiar claves a comandos/chat/historial. La prueba de esa vía usó una clave sintética y comprobó que otra clave distinta falla. No se configuró ni custodió una clave humana de producción.

Si se pierde el perfil/DPAPI: se necesita el contenedor y la clave de recuperación separada. El motor criptográfico de esa vía no necesita DPAPI; el CLI de custodia actual sigue fijado al SID/ruta autorizados. Recuperar en otro equipo/usuario requiere preparar y aprobar su custodia/SID y verificar allí el artefacto, no ampliar ACL ni modificar identidad automáticamente. **No se declara probada una recuperación en un segundo equipo o usuario Windows.**

Si se pierde también el archivo o ambas vías de clave, este sistema no puede recuperarlo. Una copia cifrada adicional y su custodia se deben aprobar antes de usarlo como recuperación de desastre; no se creó sincronización o copia externa en esta fase. Ningún comando aquí restaura D1 remoto.

## 5. Limpieza y preservación de evidencia

- Nunca se escribe SQL sin cifrar, ni siquiera durante una descarga o restauración fallida. La carpeta temporal contiene como máximo ciphertext y metadatos depurados.
- No se conservan URLs firmadas, tokens o claves sin envolver en logs/evidencias. El transporte cancela streams, combina señales de abort y descarta su referencia al token al cerrarse. No se promete destruir todos los buffers internos de conexiones ya consumidas del runtime.
- La limpieza usa rutas conocidas de la operación y unlink/rmdir no recursivos; valida raíz, directorios y ausencia de junction/symlink. No barre otras carpetas ni borra archivos desconocidos. El lock solo se retira si pertenece al operationId actual.
- Si falla una etapa normal se retiran archivos propios no verificados y se descarta el secreto de recuperación de memoria. El paquete aún no es aceptado.
- Si falla la limpieza, el resultado cambia a `failed_cleanup_pending` o `verified_cleanup_pending`, conserva evidencia sin secretos y deja el lock para revisión. No hay retry automático ni intento de borrar más ampliamente para ocultar el problema.
- Tras promoción, la limpieza **no elimina nunca** el directorio de un respaldo verificado. Se probó un fallo después de promoción y se comparó que sus bytes siguieran intactos.
- Una terminación brusca puede impedir `finally`; solo quedarían lock y artefactos ya cifrados. La siguiente ejecución se bloquea, sin reanudación ni borrado automático.

La retención propuesta de 2C.5T se mantiene: respaldo cifrado 30 días; evidencia mínima 90 días; parciales con revisión al cierre/antes de 24 horas si existe incidente. No se automatizó expiración o destrucción de claves. Eliminar un contenedor no demuestra sanitización física del SSD; no se ejecutaron wipe, TRIM, limpieza de espacio libre ni cambios de claves de BitLocker.

## 6. Pruebas realizadas

**12/12 pruebas nuevas aprobadas**, sin fallos, omitidas o canceladas. No se ejecutó la suite general anterior, porque aplica migraciones versionadas en fixtures; esta fase lo prohíbe.

| Caso | Resultado |
|---|---|
| Custodia Windows real | Raíz externa, NTFS, DACL protegida con operador/SYSTEM |
| Carpeta inexistente | Bloqueo antes de consultar la fuente |
| ACL insegura simulada | Bloqueo antes de la fuente; no se concedieron permisos inseguros para probarlo |
| Cifrado real y lectura posterior | DPAPI + AES-GCM verificados; archivo cifrado releído/descifrado |
| Recuperación correcta/incorrecta | Clave sintética correcta recupera; otra clave/tag alterado falla |
| SQL no vacío sintético | Descifra y restaura una tabla/fila en SQLite aislada |
| Cifrado fallido | Sin SQL/parciales persistentes ni lock de retry después de limpieza exitosa |
| Export interrumpido / descarga parcial | No promoción y sin retry automático |
| Ciphertext corrupto / SQL corrupto | No se acepta ni promueve el respaldo |
| Limpieza fallida | Evidencia depurada, ciphertext pendiente, lock retenido |
| Fallo tras promoción | Contenedor verificado preservado byte a byte |
| Destino D1 incorrecto | Rechazo antes de descargar/cifrar |
| API de transporte | No tiene applyBatch/publicación ni admite escritura arbitraria |
| Aislamiento de dependencias/CLI | Sin imports de migración/bootstrap; ruta remota bloqueada |

También se ejecutaron:

- Build contratos y backend/TypeScript: correctos; sin upload.
- Lint backend: correcto.
- Parser PowerShell de los dos helpers: 0 errores.
- Prueba completa `backup:proof` con DPAPI/ACL reales y recuperación posterior desde otro proceso Node.

Evidencia de tests: `infra/cloudflare/dev/.wrangler/safe-runner-tests/2c5u-tests.txt`, ignorada por Git. Los datos de pruebas son sintéticos. Los tests se limitan a restaurar SQL sintético en memoria; no invocan Wrangler migrations, las seis migraciones, D1 remoto ni R2. No hubo cambios de interfaz que requirieran pruebas visuales de Admin/landing.

## 7. Archivos creados y alcance preservado

Raíz de código: `C:/Users/JV/Desktop/Kuwago Landing/grupo-kuwago-landing-source`.

```text
infra/cloudflare/dev/scripts/
  backup-custody.ps1           NUEVO: inspección/preparación/verificación de raíz fija
  backup-dpapi.ps1             NUEVO: protección de clave por pipe, CurrentUser
  d1-backup-only.mjs           NUEVO: CLI independiente, remoto bloqueado, prueba explícita
  d1-backup-recover.mjs        NUEVO: verifica recuperación local sin exponer SQL
  safe-d1/
    windows-custody.mjs        NUEVO: adaptador Windows/DPAPI
    encryption.mjs             NUEVO: sobre AES-GCM y recuperación
    encrypted-store.mjs        NUEVO: temporales cifrados y promoción/limpieza
    backup-transport.mjs       NUEVO: solo lectura/export, sin escritor
    backup-only.mjs            NUEVO: orquestación cifrada y cierre
infra/cloudflare/dev/test/backup-only.test.mjs  NUEVO
infra/cloudflare/dev/package.json              MODIFICADO: comandos/tests de backup-only
docs/PHASE-2C5U-LOCAL-BACKUP-CONTROLS.md         NUEVO
```

No se modificaron las migraciones/hashes, el escritor anterior, contratos, frontend ni configuración Cloudflare. La ruta legacy de migraciones sigue deshabilitada y **no se convierte en ruta cifrada por este cambio**: no debe habilitarse para obtener un respaldo. Integrar posteriormente recibos cifrados con una autorización de migración es otro alcance. Los backups de prueba previos verificados se conservaron; no se borraron por error.

## 8. Matriz GO / NO-GO

| Control | Estado |
|---|---|
| Directorio dedicado y ACL real | **GO local**, creado y verificado; ancestros sin modificación de ACL |
| Cifrado independiente de NTFS | **GO local**, AES-256-GCM comprobado |
| DPAPI CurrentUser | **GO local**, protect/unprotect reales |
| Recuperación independiente | **Motor probado con clave sintética**; custodia de clave real pendiente antes de datos reales |
| Entrada backup-only sin migraciones | **GO local**, grafo y CLI comprobados |
| Limpieza normal y fallo de limpieza | **GO local**, con señalización/lock y preservación de verificados |
| Permiso mínimo oficial de export D1 | **Pendiente**, no se infiere D1 Edit ni se probó con token |
| Productor remoto, host/formato y bookmark reales | **Pendientes**, ninguna exportación real en esta fase |
| Activación del camino remoto | **NO-GO**, `backupRemoteEnabled=false` |
| Crear token/exportar ahora | **NO-GO / no autorizado** |
| Solicitar posteriormente una aceptación acotada de export | **GO técnico condicionado** a revisión de permisos, clave de recuperación/custodio reales, captura privada y autorizaciones separadas |
| Migraciones/bootstrap/restore remoto/deploy | **Fuera de alcance**, siguen bloqueados |

Los bloqueantes **locales** de carpeta, cifrado de archivo, operación separada y tratamiento de parciales quedan atendidos. El uso remoto no se autoriza por haber pasado tests.

Antes de la siguiente operación: aceptar el informe, aclarar permiso de export o aprobar explícitamente una prueba exploratoria con Read, asignar/custodiar clave de recuperación real fuera del chat/repositorio y revisar el adaptador de captura privada. Autorizar luego, separadamente, creación/revocación de credencial, preflight y un export completo del objetivo único. No activar el escritor de migraciones como efecto colateral.

Riesgos residuales: host/operador privilegiado confiables, cadenas administradas/paging no borrables con garantía física, inventario de agentes de backup de terceros, recuperación en otro equipo aún no ensayada, ausencia de copia cifrada externa aprobada y posible intervención manual ante disco lleno/lock pendiente. No se contrató ni configuró ningún servicio para resolverlos automáticamente.

**Se detiene para revisión. No se solicita ni utiliza ninguna credencial Cloudflare.**
