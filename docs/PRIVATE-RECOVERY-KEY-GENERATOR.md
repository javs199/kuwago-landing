# Generador privado de clave de recuperación D1

25/10/2026 · America/Costa_Rica.

**Preparado para revisión del código; no abierto ni ejecutado para generar una clave real.** No se ha creado evidencia de custodia en el gestor ni de recuperación externa. No hubo solicitudes a Cloudflare, tokens, exportaciones, migraciones, cambios de infraestructura, commit o push.

## Código y separación de responsabilidades

Desde la raíz `C:/Users/JV/Desktop/Kuwago Landing/grupo-kuwago-landing-source`:

| Archivo | Responsabilidad |
|---|---|
| `infra/cloudflare/dev/scripts/recovery-key-generator.ps1` | Nueva ventana Windows Forms local, lanzamiento manual, sin generación al abrir |
| `infra/cloudflare/dev/scripts/recovery-key-core.psm1` | Conversión de 32 bytes, puente privado al validador y limpieza selectiva del portapapeles |
| `infra/cloudflare/dev/scripts/safe-d1/recovery-format.mjs` | Decodificación canónica compartida con el verificador portable |
| `infra/cloudflare/dev/scripts/d1-recovery-key-validate.mjs` | Proceso local de validación de formato, por pipe, sin claves en salida |
| `infra/cloudflare/dev/scripts/d1-backup-portable-verify.mjs` | Actualizado para utilizar esa misma validación, sin cambiar el formato permitido |
| `infra/cloudflare/dev/scripts/backup-recovery-private.ps1` | Corregida selección de un único ejecutable Node cuando existen varias instalaciones |
| `infra/cloudflare/dev/test/recovery-key-generator.test.mjs` | Pruebas Node de formato, proceso de validación, integración PowerShell y controles de código |
| `infra/cloudflare/dev/test/recovery-key-private.test.ps1` | Vectores deterministas y portapapeles simulado; nunca abre el generador |

Se reutilizan el patrón de stdin privado de `backup-recovery-private.ps1`, el formato original del verificador portable, su contrato de recuperación y las suites backup-only. No se alteraron AES-GCM, DPAPI, envoltura independiente, destino D1 ni permisos de migración. No se añadieron dependencias.

## Generación y formato

Solo el evento del botón **Generar clave privada** llama a `System.Security.Cryptography.RandomNumberGenerator.Create().GetBytes()` sobre un buffer de exactamente 32 bytes. No se usa System.Random, Get-Random, generador de contraseñas o frase. El buffer se codifica con `Convert.ToBase64String`, sin saltos de línea.

Antes de mostrar siquiera el campo enmascarado, se verifica por un proceso Node local que el valor cumple el mismo decodificador usado por la recuperación portable: alfabeto Base64 estándar, 44 caracteres terminados en `=`, 32 bytes al decodificar y recodificación idéntica. Una representación con bits de padding no canónicos también se rechaza. La aceptación del formato **no demuestra custodia externa ni restauración**.

El secreto viaja a ese proceso exclusivamente por stdin privado acotado, sin argumentos ni entorno con claves. El hijo recibe solo PATH y SystemRoot y no tiene transporte HTTP. Su respuesta solo informa aceptación/formato/longitud. Errores crudos del hijo no se muestran. No se escriben claves, SQL ni archivos de recuperación.

Después de generar se deshabilita el botón para evitar sustituir accidentalmente una clave ya copiada. Para descartar una generación y comenzar otra es necesario finalizar conscientemente y abrir otra sesión, cuando esté autorizado.

## Interfaz y portapapeles

- Campo de solo lectura, oculto por defecto y sin atajos de copia del TextBox.
- Mostrar temporalmente durante 15 segundos, ocultar manualmente o al perder foco la ventana.
- Copia únicamente mediante botón y aceptación explícita del aviso de riesgo.
- Marcas `CanIncludeInClipboardHistory=0` y `CanUploadToCloudClipboard=0`, como DWORD serializados. Son controles de Windows; no protección frente a lectores de portapapeles de terceros o un host comprometido.
- Copia OLE no persistente después del cierre, sin reintentos automáticos de escritura del portapapeles.
- Botón para borrar la copia después de guardarla en el gestor y temporizador de 45 segundos desde la copia.
- Antes de limpiar se compara con la clave de esta sesión. Si otro contenido la sustituyó, no se borra deliberadamente ese otro contenido. Comparación y borrado son de mejor esfuerzo, no una transacción frente a aplicaciones concurrentes.
- Si Windows bloquea lectura/borrado, se muestra advertencia y no se afirma limpieza exitosa. El cierre normal se cancela para permitir liberar el bloqueo y volver a borrar. No existe limpieza garantizada ante terminar forzosamente el proceso, caída del host o software malicioso.
- El cierre requiere confirmar guardado o descarte; esa confirmación no se registra como prueba de bóveda externa. Se limpian el campo, buffers propios y referencias, se liberan timers/objetos y se descarta la copia en memoria.

La ventana no abre ni integra el gestor; el usuario guarda personalmente la clave en un campo secreto. No hay telemetría, red, token D1 ni operación sobre una base. No se modifica la configuración global de historial/sincronización de Windows.

Fuentes oficiales: [RandomNumberGenerator de .NET](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.randomnumbergenerator), [formatos de portapapeles e historial/sincronización](https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-formats). La implementación de los marcadores está preparada; no se probó el portapapeles real ni su historial en esta fase.

## Pruebas realizadas sin clave real

Desde `infra/cloudflare/dev`:

```powershell
node --test test/recovery-key-generator.test.mjs test/portable-recovery.test.mjs test/backup-only.test.mjs
npm run lint
npm run build
```

Resultado final: **20/20 pruebas aprobadas**, cero fallos, omitidas o canceladas; lint correcto; TypeScript y build correctos sin upload. El test PowerShell contiene **13 comprobaciones** internas y dos parsers sin errores.

Las cuatro pruebas nuevas comprueban:

1. Conversión exacta de bytes sintéticos deterministas y rechazo de frases, longitudes equivocadas, espacios/saltos de línea y Base64 no canónico.
2. Aceptación por el validador por pipe, rechazo de campos adicionales y ausencia de eco del vector sintético.
3. Puente real PowerShell→Node con vector sintético; limpieza con adaptador simulado, conservación de otro contenido, bloqueo de portapapeles y sintaxis de ventana/módulo.
4. Controles estáticos: RNG solo dentro del botón explícito, temporizadores, copia con consentimiento, limpieza y ausencia de llamadas a red/escritura de archivo/logs.

Se repitieron además las cuatro pruebas portables y doce de backup-only, incluida restauración de SQL sintético aislada, rechazo de claves/archivos alterados, DPAPI local y fallos de limpieza. Las claves de estas suites son únicamente fixtures de prueba y no son material real de custodia.

Durante la integración se detectaron dos ejecutables Node en PATH: `Get-Command` podía devolver ambos y concatenarlos en una ruta inválida. Se selecciona ahora el primer ejecutable resuelto, tanto en el puente nuevo como en el helper de recuperación ya existente. Tras esa corrección pasó el puente con material sintético. No se instalaron ni cambiaron versiones de Node.

**No probado por restricción expresa:** abrir Windows Forms, pulsar Generar, revelar/copiar una clave real, portapapeles físico, gestor real, custodia desde otro dispositivo y restauración con clave real. No se generó una clave real para probar el RNG. La selección de la API criptográfica se revisó en código; la operación humana queda pendiente.

## Procedimiento de uso futuro — NO ejecutado ahora

Requisitos locales: Windows, PowerShell 7, Node local y una sesión de escritorio de confianza. Revisar primero el código. No utilizar una consola conectada a Codex, transcripción, depurador, grabación, transmisión o acceso remoto compartido. Detener capturas y revisar personalmente historial/sincronización y lectores del portapapeles antes de generar.

1. Preparar en el gestor una entrada cifrada con nombre/alias de versión y campo secreto. Verificar que la bóveda será accesible sin el perfil Windows principal. No incluir claves en el nombre de la entrada.
2. **Solo cuando el usuario autorice abrirlo**, ejecutarlo personalmente desde una sesión privada:

```powershell
pwsh -NoProfile -STA -File "C:\Users\JV\Desktop\Kuwago Landing\grupo-kuwago-landing-source\infra\cloudflare\dev\scripts\recovery-key-generator.ps1"
```

3. La ventana abre vacía. Pulsar Generar una sola vez. La clave permanece oculta; no hacer capturas ni copiarla al chat/terminal. Si falla la validación, no se ofrece un valor para custodiar.
4. Si se necesita, mostrar 15 segundos en privado. Para transferirla al gestor, aceptar el aviso y pulsar Copiar al gestor. Pegar exclusivamente en el campo secreto de la bóveda y guardar.
5. Pulsar Borrar mi clave del portapapeles inmediatamente después de guardar, sin esperar el temporizador. Si está bloqueado, resolverlo y repetir el borrado. El botón no limpia retroactivamente capturas o gestores de portapapeles ajenos.
6. Finalizar y cerrar. No se conserva archivo de la clave. En otro dispositivo, acceder personalmente al gestor y comprobar disponibilidad de la entrada, sin mandar el contenido a Codex. Registrar únicamente alias/fecha/resultado no secreto.
7. Después, preparar mediante operación privada revisada un paquete sintético nuevo cifrado con ese material y probar recuperación desde la bóveda con el verificador portable. La ventana no crea ese fixture ni un backup; los paquetes previos usan claves transitorias diferentes.

El secreto en Base64 se conserva como texto exacto dentro del campo cifrado del gestor, sin transformarlo a una frase. No es necesario custodiar un archivo binario. Una rotación posterior no permite descifrar automáticamente paquetes antiguos: conservar sus versiones de clave mientras existan respaldos retenidos.

## Límites y decisión

Los arrays controlados se sobrescriben; strings .NET/Node, copias del TextBox, buffers internos, portapapeles de terceros, paginación, hibernación o dumps no permiten prometer borrado físico absoluto. El uso real confía en el equipo, Node, Windows, el gestor y el operador. El generador no configura cifrado del host ni acredita que no haya malware.

**Listo para revisión de código y procedimiento. No se abre automáticamente ni se produce la clave real.** La revisión visual/manual, custodia externa y restauración independiente siguen pendientes. Backup remoto y migraciones conservan permisos separados y gates deshabilitados. No se declara GO de exportación o custodia real.
