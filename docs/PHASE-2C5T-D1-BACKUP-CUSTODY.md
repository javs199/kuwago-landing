# Fase 2C.5T — Permisos y custodia del respaldo D1

24/10/2026 · America/Costa_Rica · Revisión documental y comprobaciones locales de solo lectura.

**Dictamen: NO-GO para autorizar hoy una exportación remota.** La estrategia SQL completo + Time Travel + restauración aislada está definida y probada localmente en 2C.5S, pero el permiso mínimo de exportación sigue sin poder demostrarse con la documentación oficial consultada. Además, la carpeta protegida no existe, no se pudo verificar el cifrado y falta una entrada operativa de solo respaldo que no pueda continuar a migraciones.

Se revisaron 2C.5S, 2C.5R y el código actual. Esta fase entrega únicamente este informe: no crea carpetas de custodia, cambia ACL/cifrado, genera credenciales, consulta/exporta D1 remoto ni ejecuta migraciones. No modifica Cloudflare, scripts, SQL, hashes, dependencias o frontend. Sin commit ni push.

## 1. Permisos: comprobación oficial actual

Se abrieron nuevamente las referencias oficiales HTTP de los tres endpoints. Se buscó específicamente la sección de permisos aceptados y se contrastó con la documentación de importación/exportación. No se usaron ejemplos de terceros como prueba de autorización.

| Operación | Evidencia oficial actual | Conclusión verificable |
|---|---|---|
| Exportación completa, POST `/accounts/{account}/d1/database/{id}/export` | La [referencia de exportación](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/) documenta autenticación y payload, pero **no enumera permisos aceptados** | **Permiso mínimo exacto: pendiente.** No se demuestra que sea D1 Read ni que D1 Edit sea obligatorio |
| Consultar bookmark, GET `/time_travel/bookmark` | La [referencia de bookmark](https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/methods/get_bookmark/) sí enumera D1 Read y D1 Write como alternativas | **D1 Read es suficiente según documentación**. Aceptar Write también no convierte Write en mínimo necesario |
| Restaurar una base, POST `/time_travel/restore` | La [referencia de restore](https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/methods/restore/) describe la mutación, sin enumerar permisos aceptados | **Permiso mínimo exacto: pendiente.** Es una operación de escritura/destructiva; diseño exige autorización separada y capacidad apropiada, no el permiso de consultar bookmarks |

No inferir permisos por el verbo POST, por el nombre «backup», por una cuenta Workers Paid o porque el endpoint esté junto a otro que acepta Read. No se presenta la propuesta anterior de D1 Read para export como una confirmación.

**Cómo cerrar el pendiente:** obtener referencia oficial explícita o respuesta de Cloudflare sobre el endpoint exacto y alcance. No se envió ninguna consulta a soporte en nombre del usuario. Alternativamente, el usuario podría autorizar en otra fase una aceptación acotada de export con una credencial D1 Read; sería una prueba de capacidad de esa credencial, no documentación del mínimo universal. Un rechazo detendría la prueba sin ampliar permisos. No pedir D1 Edit para «ver si así funciona».

Consultar metadatos/esquema y consultar bookmarks siguen siendo permisos/acciones distintos de exportar, aunque puedan compartir una futura credencial. Revocar el token Read anterior no cambia las reglas de permisos del servicio. No existe una credencial actual disponible que se haya utilizado aquí.

El alcance D1 de cuenta no se convierte en ACL por UUID. La herramienta fija destino, pero otro programa con un eventual token de cuenta podría acceder a otras D1. Ese riesgo requiere aceptación o una separación aprobada; no se resuelve agregando permisos de Workers, R2, Access o DNS.

## 2. Ubicación y comprobaciones de custodia

Ubicación definida, consistente con el CLI actual y fuera del repositorio:

```text
C:\Users\JV\AppData\Local\Kuwago\D1Backups\development\<operationId>\
  complete-backup.json
  complete-backup.json.sql
```

No usar Desktop, Downloads, Temp general, carpetas de despliegue, Git, sincronización personal o adjuntos de chat. `operationId` debe ser el UUID generado por la herramienta, nunca un segmento de ruta arbitrario suministrado por el operador.

| Comprobación local de esta fase | Resultado |
|---|---|
| Sistema de archivos de C: | **NTFS**, consultado mediante DriveInfo |
| Carpeta base `C:\Users\JV\AppData\Local\Kuwago\D1Backups\development` | **No existe**; no se creó |
| ACL específica de esa carpeta | **No verificable todavía**, al no existir |
| Estado BitLocker de C: | Consulta falló con los permisos actuales; **cifrado no comprobado**. No se elevó ni cambió configuración |
| Token Cloudflare en el proceso auditor | Ausente; no se imprimió valor alguno |

### Política de acceso y cifrado para aprobar la carpeta

Preparación local futura, separada y autorizada:

1. Verificar el perfil/identidad local del operador; no asumir que el nombre de carpeta prueba identidad humana. Crear únicamente la carpeta de custodia nueva, sin mover ni borrar el proyecto.
2. Desactivar herencia permisiva de esa carpeta y establecer DACL explícita para el operador asignado, SYSTEM y administradores locales aprobados. Los accesos de Users, Authenticated Users, Everyone, invitados, cuentas de servicio no aprobadas o shares no deben conceder lectura de los dumps. No aplicar un DENY genérico que bloquee también al operador.
3. Comprobar propietario, DACL protegida, herencia de archivos hijos y ausencia de reparse points/junctions. Resolver la ruta y comprobar que sigue fuera de la raíz Git. Probar con un archivo **sintético**, incluyendo acceso de una cuenta estándar distinta. No cambiar ACL recursivamente sobre el perfil o disco.
4. Exigir cifrado del volumen C: con protección BitLocker activa y cifrado completo confirmado antes de escribir datos reales. No aceptar protección suspendida, desactivada o estado desconocido. Recuperación de BitLocker bajo custodia autorizada, nunca en el repositorio/informe/chat. Si no puede demostrarse ese cifrado, la ubicación queda NO-GO; otra ubicación cifrada requerirá aprobación y adaptación revisada del path fijo.
5. Confirmar exclusión de sincronización/copia automática no aprobada y destino de recuperación. Responsable y revisor de custodia deben quedar asignados expresamente antes de un export real.

Microsoft documenta [BitLocker como cifrado de volumen](https://learn.microsoft.com/en-us/windows/security/operating-system-security/data-protection/bitlocker/) y [icacls como herramienta de DACL](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls). No se ejecutaron comandos para modificar ninguno. Los modos 0600/0700 de Node no prueban permisos NTFS. El cifrado de volumen protege datos en reposo; no impide que un administrador autorizado o malware en una sesión desbloqueada lea archivos.

Comprobaciones de lectura preparadas para esa operación local, sin mostrar claves:

```powershell
Get-Acl -LiteralPath 'C:\Users\JV\AppData\Local\Kuwago\D1Backups\development' |
    Select-Object Owner, AreAccessRulesProtected, Access
Get-BitLockerVolume -MountPoint 'C:' |
    Select-Object MountPoint, VolumeStatus, ProtectionStatus, EncryptionMethod, EncryptionPercentage
```

No ejecutar `Get-BitLockerVolume` sin selección y conservar su salida completa: no se necesitan protectores ni claves de recuperación para este control. El operador local que pueda leer ese estado deberá aportar únicamente evidencia depurada de protección/cifrado.

## 3. Enlaces firmados, temporales y registros

La API de export informa que la URL de descarga dura **una hora**. Esa URL es una capacidad secreta de descarga: debe circular únicamente en memoria entre la respuesta API y el cliente de descarga. No copiarla al navegador, portapapeles, argumentos, PowerShell history, transcripciones, capturas, Notion, tickets, manifiestos o logs. [Referencia oficial de export](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/).

El código actual ya evita guardar esa URL y descargar con Authorization/cookies; restringe HTTPS/origen y no sigue redirects. Al terminar/cancelar se descartan referencias y se cierran streams. No se promete borrado físico instantáneo de cadenas administradas en RAM. **Descartar el enlace localmente no lo revoca en Cloudflare.** No hay mecanismo de revocación individual documentado en las fuentes revisadas; tampoco se presume que revocar el token API invalide una URL ya emitida. Si se filtra, registrar incidente sin volver a copiarla y tratarla como potencialmente válida hasta su expiración.

Política de archivos/registros:

- Mantener descarga y restauración de verificación en memoria dentro de los límites ya implementados; no hacer spill a Temp general. Si en el futuro se necesita `.part`, solo dentro de la carpeta cifrada por operación, con la misma ACL.
- SQL y manifiesto son privados. Persistirlos con nombres fijados, sin sobrescribir un respaldo existente. Si se incorpora promoción atómica de `.part`, el nombre final aparece solo tras validación, sin mezclar contenido de dos operaciones.
- **Brecha actual identificada:** `backup.mjs` escribe primero el SQL y después el manifiesto. Un fallo de disco/permisos entre ambos puede dejar SQL huérfano, sin recibo válido. Ya bloquea migraciones, pero no implementa su limpieza automática. Antes de exportar realmente se necesita limpieza/registro de orfandad probados en el lanzador de respaldo o un procedimiento supervisado de retirada al cerrar la operación. No declarar «todo temporal eliminado» solo porque se limpió el token.
- Campos de log permitidos: operationId, cuenta/UUID, hora, operación/resultado, HTTP/código depurado, tamaño y hashes. Excluir filas, SQL privado, claims/JWT, Authorization, cookies, cuerpos crudos, URL firmada y excepciones que puedan contenerla. Los bookmarks se conservan solo como metadatos privados de recuperación.
- Eliminar material parcial al cerrar la intervención; si debe conservarse por incidente, aislarlo en la misma custodia y marcarlo inválido, con responsable y fecha de revisión dentro de 24 horas. Nunca confundirlo con un backup restaurable ni reanudarlo automáticamente.

No se eliminó ningún respaldo existente ni se creó una rutina de borrado en esta fase documental.

## 4. Integridad y restauración aislada: criterios preparados

Se conservan los controles implementados en 2C.5S:

1. Destino exacto: cuenta `7a8bcd7992a3de359d2aff87df2fb693`, D1 `kuwago-admin-db-development`, UUID `c5cfbe44-4fd0-4c2a-83c1-b833935534ba`. No listar ni consultar otras D1.
2. Metadatos, esquema/historial aprobado, integridad y snapshot de todas las filas antes de export; GET bookmark del mismo destino.
3. Export completo, con datos y esquema, sin filtro de tablas. Aceptar solamente finalización válida del trabajo, descarga completa y origen permitido.
4. Snapshot/bookmark posteriores coherentes; un cambio cancela aceptación, aunque el SQL sea sintácticamente correcto.
5. SHA-256 de SQL/manifiesto, conteos y fingerprint canónico de tipos/valores. No basta el hash de un archivo incorrecto.
6. Restaurar bytes descargados en SQLite nueva en memoria con restricciones, timeout, sin entorno heredado ni acceso de SQL a otros archivos. Comprobar esquema, columnas, todos los valores, historial/secuencias, quick_check y FK. Como aceptación del productor remoto, repetir importación en D1 local workerd aislada, sin binding remoto; el destino local se descarta después de comparar.
7. Emitir recibo solo tras las comprobaciones; copia externa de JSON, export truncado o recibo antiguo no autorizan migraciones.

Preparados para repetir con datos **sintéticos**, cuando se autorice una fase local de pruebas:

```powershell
npm --prefix infra/cloudflare/dev run test:backup:readiness
npm --prefix infra/cloudflare/dev run test:migrations:safe
```

No se volvieron a ejecutar esas suites aquí porque sus fixtures aplican migraciones locales y esta fase restringe ejecutar migraciones. Se inspeccionó la evidencia de 2C.5S: 200 pruebas de backend y 30 específicas aprobadas. No se atribuyen resultados nuevos de restauración ni de una descarga real a esta revisión.

Límites actuales: export de hasta 16.000.000 bytes, snapshot de hasta 10.000 filas acumuladas/100 columnas por tabla, timeout y memoria JS acotados. Superarlos debe bloquear, sin truncar. La protección de datos reales requiere verificar cifrado/ACL antes de llegar a esta etapa.

## 5. Export interrumpido o consultas bloqueadas

Cloudflare advierte que una exportación puede bloquear consultas y necesita sondeo continuo; un trabajo sin sondeo termina cancelándose según el servicio. No se inventa un plazo máximo de liberación. [API export](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/), [import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

Procedimiento de incidente:

1. Detener la operación local ante timeout, error, cancelación, 10000/401/403, respuesta inválida o límite de sondeos. Registrar únicamente estado depurado y job/bookmark privado necesario. No reintentar la creación del export ni cambiar permisos.
2. No iniciar otro export mientras el estado del anterior sea desconocido. No enviar SQL, migraciones o restauraciones para «desbloquear» la base.
3. Conservar el lock y marcar el respaldo como incompleto/no aceptado. Retirar token del proceso y aplicar la política de parciales descrita arriba.
4. Cerrar streams; dejar de sondear si se abandona el trabajo. No llamar endpoints de cancelación no documentados ni borrar objetos R2/Cloudflare para forzar limpieza.
5. Una comprobación posterior de estado/disponibilidad será de solo lectura y deberá estar incluida en la autorización de incidente o aprobarse por separado, con frecuencia/límite acordados. Si persiste, escalar a Cloudflare mediante acción humana autorizada. Nunca afirmar que se canceló por el mero cierre de la consola.
6. Tras demostrar que ya no hay trabajo activo y revisar causa/evidencias, autorizar una nueva operación con ID propio. No reutilizar recibos o archivos parciales.

Antes del export futuro: ventana de mantenimiento, ausencia de otros escritores/reconciliadores y responsable disponible. La landing Hostinger no debe conectarse a este DEV durante la intervención.

## 6. Retención y eliminación

Política propuesta para aprobación, todavía no automatizada:

| Material | Retención / eliminación |
|---|---|
| Token temporal | Solo memoria durante la sesión; retirar del proceso y revocar por operador al cerrar o fallar. TTL no reemplaza revocación |
| URL firmada | Cero persistencia local. Descartar referencias al terminar; la caducidad remota es del proveedor |
| SQL completo + manifiesto privado | **30 días desde creación**, con fecha de eliminación registrada y responsable. Refinamiento operativo de la propuesta anterior de 30 días tras aceptación |
| Descarga fallida/temporal/SQL huérfano | Retirada al cierre; si hay incidente, custodia temporal con revisión dentro de 24 h y prórroga explícita |
| Registro mínimo sin secretos/datos de negocio | **90 días**, para trazabilidad de creación/verificación/eliminación; misma custodia restringida |

Antes de eliminar: revisar que la ruta resuelta sea exactamente la operación esperada bajo la raíz aprobada, que no sea junction/symlink, y enumerar los archivos concretos. Borrado con una sola herramienta nativa y rutas literales; nada de glob recursivo contra rutas calculadas, ni barrido del perfil o espacio libre. No tocar locks/journals de una operación de migración sin revisión de incidente. Si el respaldo está sujeto a recuperación/incidente abierto, detener eliminación y aprobar prórroga con nueva fecha, evitando retención indefinida silenciosa.

**Garantía de eliminación:** borrar un archivo no equivale a sanitización física. Microsoft describe esa diferencia en [SDelete](https://learn.microsoft.com/en-us/sysinternals/downloads/sdelete). No se recomendaron ni ejecutaron pasadas de sobrescritura del SSD, TRIM, limpieza de espacio libre o destrucción de la clave BitLocker de C: para eliminar un solo backup.

La eliminación operativa se hará sobre almacenamiento cifrado y con registro de rutas/hashes/hora, sin afirmar irrecuperabilidad forense. Si el requisito futuro exige esa garantía, usar custodia cifrada dedicada con destrucción de claves gestionada/auditable y tratamiento de réplicas/snapshots; requiere diseño/aprobación antes de recibir esos datos. Borrar una clave envuelta que aún pudiera recuperarse del mismo disco no demuestra borrado criptográfico. No destruir claves del sistema ni datos ajenos al respaldo.

## 7. Autorizaciones independientes

| Autorización | Incluye | No incluye |
|---|---|---|
| A — Preparación local | Carpeta/ACL, verificación de cifrado, procedimiento de parciales y entrada solo-respaldo, pruebas sintéticas | Cloudflare, token, export real, migraciones |
| B — Credencial mínima de lectura | Creación humana temporal, alcance/TTL y revocación acordados, si se aprueba | Consultas por el solo hecho de existir; Edit o incremento automático |
| C — Consultas | GET metadatos/bookmark y SELECT/PRAGMA de lectura de la D1 exacta | Crear ledger, exportar, restaurar o migrar |
| D — Exportación | Crear/sondear **un** export completo, descargar sin filtrar enlace, verificar/guardar bajo custodia, lecturas de coherencia expresamente incluidas | SQL mutante, R2 real, restauración remota, segundo intento automático |
| E — Credencial de escritura | Crear/revocar D1 Edit/Write temporal una vez justificado y aprobado su uso | Ejecutar SQL, migraciones o restore por disponer de ella |
| F — Migración | Lote exacto 0001–0006/hashes, cuenta/UUID, ventana, gates y lectura posterior | Bootstrap, restore, deploy, DNS/Access/Hostinger |
| G — Recuperación/restore | Incidente, destino y bookmark/dump concretos, impacto y aceptación propios | Reutilizar una autorización de consulta de bookmarks |

Un permiso técnico puede ser más amplio que una autorización operativa. Restaurar, exportar y migrar no se autorizan mutuamente. El operador no introduce secretos en chat ni argumentos; se reutilizará la captura privada existente cuando corresponda, sin activar su modo de migración para un respaldo.

## 8. Procedimiento exacto de la siguiente operación

**La siguiente operación ejecutable recomendada es local, no un respaldo remoto**, por los pendientes actuales:

1. Revisar y aprobar A: carpeta/cifrado/custodia y preparación de una entrada exclusivamente de respaldo. No crear token.
2. Crear/verificar la carpeta específica y sus ACL con datos sintéticos; obtener evidencia depurada de BitLocker activo. Si no es posible, parar.
3. Preparar/probar una entrada que solo consulte/capture/exporte/verifique y termine, sin importar/instanciar el escritor de migraciones. Mantener cerrada la vía remota durante sus tests. Añadir prueba de fallo entre escritura de SQL/manifiesto y limpieza controlada de huérfanos.
4. Obtener evidencia oficial del permiso mínimo de export, o presentar por separado el alcance de una eventual aceptación con Read. No crear ni solicitar Edit para resolverlo.
5. Presentar las evidencias anteriores y solicitar entonces, separadamente, B/C/D según el permiso conocido. Si el mínimo sigue sin demostrarse, marcarlo así y no ampliar permiso; una prueba con Read requiere aceptación humana explícita de su carácter exploratorio y del bloqueo temporal de consultas.

Solo después, la operación remota prevista será: captura segura → validar cuenta/nombre/UUID → snapshot/bookmark → un export completo → descarga privada → coherencia posterior → restauración local aislada → hashes/recibo/custodia → limpieza/revocación → informe y parada. No continuar a migraciones aunque el respaldo resulte correcto.

**Brecha concreta del código actual:** `d1-safe-migrate.mjs` invoca `runMigration`, que tras respaldar entra al bucle de seis etapas. Cambiar su flag remoto para obtener solo el respaldo no es seguro. Hace falta la entrada limitada del paso 3, con autorización de ejecución propia. Esta fase no la implementa ni activa porque su entrega es documental.

## 9. Matriz GO / NO-GO

| Requisito | Estado actual |
|---|---|
| Destino único y seis migraciones/hashes | Conservados en código; sin cambios en esta fase |
| Permiso mínimo export | **Pendiente; NO-GO para afirmarlo o exigir Edit** |
| Permiso consulta bookmark | **Documentado: D1 Read** |
| Permiso mínimo exacto restore | **Pendiente**; operación distinta, fuera del respaldo |
| Ubicación fuera del repositorio | **Definida**, coherente con el CLI |
| Carpeta/ACL/cifrado efectivo | **NO-GO**, carpeta no creada y BitLocker no verificable |
| Verificador íntegro/restauración local | Implementado y probado en 2C.5S; evidencia revisada, sin ensayo nuevo aquí |
| Entrada de solo respaldo y cierre de huérfanos | **Pendiente / bloqueante antes de export real** |
| Retención y eliminación | Política definida; responsable/aprobación y ejecución pendientes |
| Preparación local posterior | **GO técnico para someter A a aprobación** |
| Export/credenciales/migraciones ahora | **NO-GO; no autorizados ni ejecutados** |

La ausencia de datos actuales no reduce estos controles: el mismo procedimiento debe proteger futuros datos privados. No se presenta una política propuesta como carpeta cifrada operativa, ni evidencia histórica de tests como un respaldo remoto completado.

**Único archivo creado: este informe. Se detiene para revisión, sin pedir todavía ninguna credencial.**
