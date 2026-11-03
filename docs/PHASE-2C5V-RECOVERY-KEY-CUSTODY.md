# Fase 2C.5V — Custodia de la clave real de recuperación

25/10/2026 · America/Costa_Rica.

**Resultado: verificador independiente preparado y probado con material sintético. NO-GO para declarar custodia real o recuperación externa completadas.** No se generó, capturó, mostró ni almacenó una clave real. No se accedió a un gestor del usuario, medio externo o segundo equipo. No se consultó Cloudflare, exportó D1, creó tokens, aplicó migraciones, hizo commit ni push.

## 1. Revisión del mecanismo existente

Se revisaron `PHASE-2C5U-LOCAL-BACKUP-CONTROLS.md`, `encryption.mjs`, `d1-backup-recover.mjs`, `restore.mjs` y las pruebas de backup-only.

- El contenido se cifra con AES-256-GCM: clave de datos aleatoria por archivo, nonce de 12 bytes y tag de 16 bytes; encabezado autenticado con destino, identificador y modo.
- La envoltura DPAPI CurrentUser sirve para la operación ordinaria del Windows autorizado. No sustituye una recuperación de desastre.
- La segunda envoltura utiliza 32 bytes de recuperación, scrypt N32768/r8/p1 con salt de 32 bytes y AES-GCM. El secreto de recuperación no está en el contenedor.
- La vía criptográfica independiente ya existía; el CLI anterior exigía además la ruta/SID de custodia local. **No se eliminaron esos controles del CLI ordinario.** Se añadió un verificador distinto para recuperación portable, sin DPAPI ni ampliación de ACL.
- La clave de recuperación no es el token D1, la clave de datos AES por respaldo, la contraseña maestra del gestor ni la clave de BitLocker. Son materiales distintos.

No se modificaron algoritmo, formato cifrado, hashes de migraciones, permisos, destino D1, gates remotos ni mecanismo backup-only.

## 2. Custodia propuesta, todavía no acreditada

**Preferencia: gestor de contraseñas elegido y operado por el usuario**, con bóveda cifrada, MFA y recuperación de la propia bóveda disponible sin el equipo principal. El acceso al gestor desde otro dispositivo debe comprobarse personalmente. No se eligió proveedor ni se conectó ninguna cuenta.

La entrada debe guardar un secreto de **32 bytes generados mediante CSPRNG**, representado en Base64 canónico de 44 caracteres (terminado en `=`). Una contraseña aleatoria de 44 caracteres o una frase rellenada no son necesariamente esa representación. El generador debe ser local/de confianza y su resultado entregarse directamente a la bóveda por el usuario, fuera de Codex, chat, grabaciones, portapapeles sincronizado e historial. No se proporciona aquí una clave de ejemplo reutilizable.

Metadatos no secretos sugeridos: propósito Kuwago D1 DEV, alias de versión de clave, fecha, custodio y referencias de los paquetes cifrados que requieren esa versión. El alias no contiene la clave. No guardar un hash de la clave como comprobante de custodia.

**Alternativa: medio extraíble cifrado bajo control del usuario**, con su desbloqueo/recuperación custodiados por separado y verificados en otro equipo. BitLocker To Go es una opción para medios extraíbles en un entorno Windows compatible; su disponibilidad concreta y estado no se han comprobado. No crear un `.txt` sin cifrar en el disco principal para trasladarlo después. No situar secreto y única copia del respaldo en el mismo dominio de pérdida.

La clave de desbloqueo del medio y la recuperación de la bóveda no pueden depender únicamente del perfil DPAPI perdido. Mantener una segunda vía de recuperación física/custodiada según la decisión del usuario. No exportar una bóveda completa sin cifrado para esta prueba.

Fuentes oficiales consultadas: [NIST — gestor con MFA](https://www.nist.gov/cybersecurity-and-privacy/how-do-i-create-good-password), [Canadian Centre for Cyber Security — recuperación del gestor](https://www.cyber.gc.ca/en/guidance/password-managers-security-itsap30025), [Microsoft — BitLocker y medios extraíbles](https://learn.microsoft.com/en-us/windows/security/information-protection/bitlocker/bitlocker-key-management-faq). Estas fuentes respaldan las opciones; no demuestran la configuración personal del usuario.

## 3. Preparación técnica independiente

Archivos nuevos bajo `infra/cloudflare/dev`:

```text
scripts/safe-d1/portable-recovery.mjs
scripts/d1-backup-portable-verify.mjs
scripts/backup-recovery-private.ps1
test/portable-recovery.test.mjs
```

El módulo reutiliza `decryptEnvelope` y la restauración SQLite aislada existentes. No importa el protector Windows, el transporte remoto, el escritor de migraciones ni el bootstrap. No tiene llamadas HTTP. Verifica destino autenticado, identificador, hash SQL, fingerprint, integridad SQLite y filas restauradas. No escribe SQL descifrado ni una base persistente. La salida contiene únicamente identificador, modo, hash del archivo cifrado, conteos y resultado.

El nuevo CLI admite una ruta al contenedor (dato no secreto) y un objeto JSON acotado por pipe privado con `recoverySecretBase64`. Rechaza entrada TTY, clave inválida, archivos mayores de 34 MB, symlinks detectables, alteraciones y destino distinto. No acepta una clave como argumento o variable de entorno. No genera claves reales ni certifica procedencia externa del secreto. Siempre informa `externalCustodyVerified:false`: esa propiedad no se deduce de un descifrado exitoso.

El helper PowerShell 7 prepara entrada oculta con SecureString y entrega el secreto por stdin privado al CLI. No solicita token Cloudflare, no modifica ACL y no imprime errores crudos del hijo. Se preparó y verificó su sintaxis; **no se abrió ni se ensayó entrada humana en esta fase**. Su uso personal no debe ejecutarse mediante una herramienta de Codex, terminal compartida, transcripción, depurador o captura de pantalla.

Comando para ejecución **personal futura**, desde `infra/cloudflare/dev` en el equipo de recuperación preparado:

```powershell
pwsh -NoProfile -File ./scripts/backup-recovery-private.ps1 -BackupFile 'RUTA_AL_CONTENEDOR_CIFRADO.kwgbak'
```

La ruta se sustituye por un archivo cifrado aprobado; nunca por el secreto. El helper pide la clave en entrada oculta local. No pegarla en el chat ni en el propio comando. La representación Base64 solo se obtiene privadamente de la custodia externa. No se da un comando de ejemplo con clave literal.

La recuperación utiliza Node 26.1.0, con `node:sqlite`, y los módulos locales referenciados. No requiere Wrangler, npm install, Cloudflare ni conexión de red para verificar. Antes de trasladar herramientas al segundo equipo se debe revisar/cotejar la copia de código y sus dependencias locales. No se instaló software en otro equipo ni se afirma prueba Linux/macOS por no usar APIs Windows en el motor.

## 4. Prueba realizada y límite de evidencia

Comando local ejecutado desde `infra/cloudflare/dev`:

```powershell
node --test test/portable-recovery.test.mjs test/backup-only.test.mjs
```

**16/16 aprobadas, cero fallos/omitidas/canceladas:** cuatro pruebas nuevas y doce regresiones de backup-only.

| Comprobación | Evidencia / resultado |
|---|---|
| Independencia de DPAPI | Se eliminó deliberadamente `dpapiKey` del fixture cifrado; restauración correcta con la envoltura de recuperación |
| Respaldo no vacío | Una tabla y una fila sintéticas restauradas, fingerprint correcto |
| Proceso independiente | CLI nuevo ejecutado mediante un segundo proceso Node, sin perfil/DPAPI ni credenciales Cloudflare |
| Clave incorrecta | Rechazo; no salida SQL |
| Tag alterado y destino cambiado | Rechazo, sin restauración aceptada |
| Entrada vacía/inválida | Fallo depurado; sin éxito ficticio |
| Salida del hijo | No incluye SQL ni el material sintético de recuperación |
| Aislamiento del grafo | Sin protector Windows, cliente HTTP, transporte backup, runner/escritor de migraciones |
| Regresiones de custodia/backup-only | Las doce pruebas previas volvieron a pasar, incluida ACL Windows y fallos de limpieza |
| Lint | Correcto, cero warnings |
| TypeScript y build backend | Correctos; sin upload |
| Sintaxis helper PowerShell | Cero errores del parser; interacción humana pendiente |
| Gate remoto | Entrada normal de backup-only devuelve `blocked`, `remoteBackupEnabled:false` |

Los fixtures cifrados quedan bajo `.wrangler/portable-recovery-tests`, ignorada por Git. Las claves sintéticas solo estuvieron en memoria/pipes y se descartaron; no son claves de custodia real ni se ofrecen para recuperación futura. No se aplicaron las seis migraciones versionadas.

**No comprobado:** lectura del secreto desde un medio externo o gestor, permanencia del material tras cerrar sesión, acceso en otro equipo físico/usuario, disponibilidad de desbloqueo de la bóveda, ni recuperación con una clave real del usuario. Un segundo proceso en el mismo ordenador no equivale a un segundo equipo ni a custodia externa.

## 5. Ceremonia privada pendiente

1. El usuario elige gestor o medio cifrado y custodio; comunica solo la decisión y un alias no secreto, nunca claves.
2. El usuario comprueba privadamente acceso al gestor/medio desde otro equipo de confianza. Verifica MFA y recuperación de ese soporte. No se envían capturas con secretos.
3. Generar y registrar la clave real con CSPRNG fuera de Codex. Registrar solo alias y fecha en el acta. No generar ni rotar accidentalmente la clave al intentar recuperarla.
4. Preparar un nuevo respaldo **sintético** cifrado con esa clave, mediante una operación local privada previamente revisada. La creación de ese paquete con clave real aún no se ha ejecutado; el actual `backup:proof` usa una clave transitoria y **no sirve para vincular automáticamente una nueva clave custodiada**. No reutilizar los paquetes sintéticos antiguos como si conocieran la clave nueva.
5. Conservar el contenedor cifrado y las herramientas verificadas en una ubicación aprobada separada. Cerrar el proceso generador y la sesión de la bóveda; descartar la copia en memoria. No mantener la clave en un archivo temporal para facilitar la prueba.
6. En el otro equipo, recuperar personalmente la clave **desde su custodia externa**, no desde la memoria del proceso generador o un portapapeles del equipo principal. Ejecutar la entrada privada y el verificador portable sobre el paquete sintético. La ausencia de la envoltura DPAPI puede comprobarse sobre una copia de prueba cifrada, nunca modificando el único respaldo original.
7. Cotejar hash del contenedor, identificador, modo sintético, una tabla/una fila esperadas y resultado de restauración. Verificar también rechazo con material de prueba incorrecto, sin imprimirlo. No interpretar éxito criptográfico como prueba automática de procedencia del secreto.
8. Registrar acta no secreta: fecha, custodio, alias de bóveda/medio, equipo de recuperación (alias), hash del contenedor, conteos y resultado. Diferenciar observación directa de declaración del usuario. No adjuntar claves, screenshots de la bóveda, SQL privado o códigos MFA.
9. Cerrar bóveda, retirar medio con seguridad y limpiar memoria/procesos. Revisar una segunda copia cifrada y retención. Repetir después de cambiar la clave o el soporte; conservar versiones necesarias para respaldos retenidos. Rotar no recifra automáticamente respaldos anteriores.

**Intervenciones privadas imprescindibles:** selección de soporte, generación/registro de clave real, traslado/custodia externa, preparación privada del fixture ligado a ella y prueba en el equipo alternativo. No se han sustituido por evidencia inventada. La preparación del fixture y el ensayo humano del helper requieren cierre antes de usar datos reales.

## 6. Permisos y riesgos

Custodiar o verificar la clave no concede D1 Read/Edit, ni habilita exportaciones, migraciones o bootstrap. `backupRemoteEnabled=false` y el gate de migraciones permanecen desactivados. Cada operación remota conserva su autorización independiente. El permiso mínimo del endpoint de exportación sigue pendiente según 2C.5T; no se deduce de esta fase.

Los buffers controlados se sobrescriben; SecureString/BSTR se liberan y el proceso hijo termina. JSON, strings administradas, buffers internos, paging y volcados impiden prometer borrado físico. El helper no acredita un host libre de malware o grabación; esos controles y la confiabilidad del segundo equipo deben revisarse antes de la ceremonia. El verificador restaura en memoria con tiempo/recursos acotados y no sustituye un sandbox de sistema operativo ante un runtime comprometido.

## 7. Matriz de cierre

| Control | Estado |
|---|---|
| AES-GCM y recuperación independiente revisados | **Implementado y probado localmente** |
| Motor portable sin perfil DPAPI | **Implementado, cuatro pruebas nuevas aprobadas** |
| Procedimiento de gestor/medio cifrado | **Propuesto**, soporte/custodio todavía no seleccionados |
| Clave real registrada fuera del equipo | **Pendiente**, sin evidencia |
| Captura privada humana | **Preparada**, parser correcto; ensayo privado pendiente |
| Fixture nuevo ligado a clave real | **Pendiente**, no generado |
| Recuperación usando material externo exclusivamente | **Bloqueante para GO**, no ejecutada |
| Segundo equipo y recuperación de bóveda/medio | **Pendiente**, no comprobados |
| Autorización backup vs migración | **Separada**, ambos accesos remotos siguen cerrados |
| GO custodia real / exportación remota | **NO-GO** |

Se detiene para revisión. No se solicita ninguna clave en chat ni autorización para crear tokens o acceder a Cloudflare.
