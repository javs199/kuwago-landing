# Fase 2B.7 — Prueba aislada de Images

24/10/2026 · America/Costa_Rica.

**Cierre:** prueba preparada y ensayada offline. **No se ejecutó Images remoto**:
falta autorización explícita de consumo y verificación del plan/cuota de la cuenta.
Además, el corpus ampliado detectó un bloqueante de conformidad PNG local.
No se recomienda habilitar multimedia en DEV todavía.

## Auditoría y modalidad seleccionada

Se revisaron PHASE-2B6R-IMAGE-RUNTIME.md, el adaptador, política, gates, build y
configuración existente. El Admin no tiene IMAGES remoto configurado y su gate de
política no se habilitó. La prueba utiliza el adaptador original, sin copiar su lógica
de validación y sin modificar el Worker administrativo ni el Worker público.

La documentación vigente admite [bindings remotos con código local](https://developers.cloudflare.com/workers/local-development/)
y confirma [compatibilidad de Images en esa modalidad](https://developers.cloudflare.com/workers/local-development/bindings-per-env/).
Wrangler 4.152.0 instalado acepta images.remote en su esquema. Por eso el modo
preparado es **wrangler dev local + solo IMAGES con remote:true**.
No se usa wrangler dev --remote: ese modo sube código a un preview remoto y no
cumple el aislamiento solicitado. No hay deploy ni reutilización del Admin desplegado.

## Cuenta: evidencia y límites

Se ejecutó únicamente wrangler whoami --json con la sesión existente, capturando
la salida en memoria y mostrando solo metadatos sanitizados:

| Dato | Estado comprobado |
|---|---|
| Autenticación | OAuth válida, sin iniciar sesión nueva |
| Cuentas accesibles | Una; no se seleccionó cuenta para ejecutar la prueba |
| Scopes declarados | user:read, offline_access, account:read, workers:write, workers_scripts:write, workers_routes:write, zone:read |
| Scopes Images/facturación | No aparecen entre los declarados |
| Plan Images, consumo y cuota disponibles | **No comprobados** |
| Acceso efectivo al binding remoto | **No comprobado**; no se envió una transformación como prueba de acceso |
| Autorización de consumo remoto | **No concedida en esta fase** |

No se infiere que Images esté ausente por no aparecer en los scopes. Tampoco se
infiere que Workers Paid incluya un plan Images específico. Falta revisión de
Images y Billing en la cuenta elegida, o acceso de lectura adecuado. No se
ampliaron permisos, generaron tokens ni activaron productos.

Según [precios públicos consultados](https://developers.cloudflare.com/images/pricing/),
Images Free ofrece hasta 5.000 transformaciones únicas al mes y no cobra por exceder
esa cuota: las nuevas transformaciones pueden fallar. Images Paid incluye las
primeras 5.000 y cobra USD 0,50/1.000 adicionales. info() no se factura.
La documentación permite transformar imágenes fuera del almacenamiento Images;
no necesitamos contratar almacenamiento/delivery de Images para esta prueba.
Estos datos no prueban la suscripción ni la cuota restante de esta cuenta.

Si la cuenta no dispone del servicio/permisos necesarios, la ejecución debe detenerse:
no contratar, actualizar el plan, iniciar login o ampliar scopes automáticamente.
Aunque existiera cuota gratuita, se exige igualmente autorización explícita.

## Archivos preparados

Todos nuevos; no se modificaron archivos funcionales de la aplicación:
```
infra/cloudflare/dev/probe/entry.ts
infra/cloudflare/dev/probe/tsconfig.json
infra/cloudflare/dev/scripts/images-probe-corpus.mjs
infra/cloudflare/dev/scripts/images-probe.mjs
infra/cloudflare/dev/test/images-probe.test.mjs
docs/PHASE-2B7-IMAGES-VALIDATION.md
```

El probe solo tiene IMAGES. No contiene DB/D1, R2, service bindings, Access,
identidades administrativas, contratos comerciales ni referencias al catálogo.
No se habilita IMAGE_POLICY_VERIFIED del Admin.
Su entrada recibe únicamente un caseId de la lista compilada: no acepta archivos,
URLs, claves de objetos ni datos arbitrarios del operador/navegador.
Los datos son píxeles, metadatos y coordenadas sintéticos, generados localmente.

Controles:

- Escucha solo en loopback; workers.dev/previews/rutas desactivados.
- Solo POST /case, JSON acotado a 256 bytes, marcador de solicitud y sin Origin.
  No CORS; se rechazan solicitudes de navegador de otro origen y hosts ajenos.
- Máximo 32 solicitudes de ensayo por isolate y tres simultáneas. /health no llama
  Images. No hay reintentos automáticos de transformaciones.
- El runner remoto se detiene ante el primer fallo de conformidad o control
  positivo/servicio; no consume el resto del corpus intentando activar productos.
- La configuración se compara con la plantilla exacta: cualquier D1/R2/servicio,
  ingress público o propiedad inesperada hace fallar el validador.
- Preparación/offline no importan credenciales ni autentican contra Cloudflare.
- El modo remoto requiere flags explícitos, confirmación manual del plan y cuenta
  concreta; verifica whoami contra esa cuenta antes de iniciar la conexión.
- La conexión solo se prepara tras esas condiciones; no hay suscripción automática.
- Reportes sin tokens, cookies, datos de cuenta, bytes privados ni errores upstream
  completos. Las salidas crudas del proceso Wrangler no se copian al reporte.

Los flags son una declaración del operador y **no sustituyen la autorización humana**.
El límite por isolate no es un límite monetario de la cuenta: reiniciar el proceso
reinicia contadores y otros usos de la cuenta quedan fuera del ensayo.
El script comprueba que el puerto 8798 esté libre y cierra su proceso al terminar.

## Corpus y mediciones

24 casos y tres repeticiones paralelas de los formatos válidos: **27 solicitudes**.

| Grupo | Preparado/comprobado offline |
|---|---|
| Entradas | JPEG, PNG, WebP |
| Orientación | EXIF 1–8 sobre raster asimétrico, incluidos reflejos |
| Metadatos | EXIF/ICC generados, artista/descripción sintéticos, PNG texto y XMP con GPS ficticio |
| Dimensiones | 24×16 y ejes rotados; ancho permitido de 4096 |
| Rechazos | MIME falso, SVG activo, CRC corrupto y truncación de tres formatos |
| Límites | Entrada >2 MiB, cabecera 65535×65535 y excedente de datos descomprimidos |
| Salida del contrato | PNG saneado, dimensiones, ausencia de metadatos y hash |
| Capacidades exploratorias | JPEG/WebP crudos del binding; no entran al contrato administrativo |
| Concurrencia | Tres solicitudes simultáneas, sin carga sostenida |
| Fallos | Red caída simulada en el runner; no se provocó una caída real de Cloudflare |

La comparación utiliza sharp como referencia de raster/orientación, no igualdad de
PNG comprimido. El hash se calcula sobre cada salida efectiva y debe coincidir con
el que devuelve el adaptador para PNG. El límite fotométrico de la prueba es delta
máximo 20 por canal en las cuatro esquinas; no se cambió para ocultar diferencias.

Las latencias son tiempo hasta cabeceras, medido desde el coordinador local; no CPU,
heap ni tiempo exclusivo del servicio. El reporte separa respuestas de transformaciones
exitosas de rechazos de preflight. No se midieron carga sostenida ni memoria pico.

## Resultados reales de esta fase

| Verificación | Resultado |
|---|---|
| TypeScript de la prueba aislada | Aprobado |
| Build del probe y del backend existente | Aprobado |
| Lint backend y probe | Aprobado |
| Pruebas backend/regresión/instrumentación | **138 resultados aprobados**, incluidos los siete nuevos tests del probe |
| Ensayo de conformidad offline | **25/27 conformes; 2 discrepancias** |
| Procesador real de Cloudflare | **No ejecutado / no certificado** |
| Solicitudes remotas a Images iniciadas | **0** |
| Importe observado en facturación | **No consultado; no se presenta como USD 0 de la cuenta** |

Los tests de instrumentación pasan porque verifican que el runner detecta y conserva
las discrepancias; **no convierten el 25/27 en una aprobación de conformidad**.
El comando offline termina con código 1 si hay discrepancias.

En el ensayo offline registrado: 18 respuestas de transformación correctas a nivel
HTTP, p50 de 8,05 ms y p95 de 37,03 ms hasta cabeceras. Son cifras de esta máquina y
del simulador; no deben usarse para estimar latencia remota o comprometer un SLA.
Las métricas completas y hashes están en el JSON, no se necesita guardar fotos.

### Bloqueante: PNG con datos descomprimidos sobrantes

Caso inflation-bomb: PNG truecolor de 1×1, con zlib válido que expande a 4 MiB de
ceros. Para ese IHDR, una fila necesita solo cuatro bytes, incluido el filtro.
El binding offline respondió **200**, normalizando el primer píxel e ignorando el
excedente. Se repitió directamente con el adaptador sharp failOn:warning y también
respondió **200**. No basta con firma, CRC, dimensiones ni recodificación exitosa
para afirmar que toda la carga comprimida respetaba la geometría declarada.

Esto es un fallo de conformidad del rechazo estricto, compartido por las dos vías
locales observadas. No demuestra que el motor remoto se comporte igual ni que se
haya explotado consumo excesivo en producción. **Impide recomendar habilitación DEV**.
Las pruebas 2B.6R de bombas por dimensiones no cubrían este excedente comprimido.

Corrección propuesta, no aplicada en esta fase de preparación:

1. Añadir validación streaming del IDAT concatenado antes del decoder: comprobar
   zlib/checksum, tamaño descomprimido exacto según IHDR y filas/pasos Adam7.
2. Detener lectura al primer byte superior al raster esperado, sin materializar
   todo el raster; validar filtros de fila y rechazar truncación/excedente.
3. Aplicar la misma comprobación a ambas implementaciones, con límites/timeout.
4. Ampliar corpus de compresión y corrupción en los tres formatos. No usar
   normalización reparadora como sustituto de la validación estricta.
5. Revisar versión de política; no sobrescribir assets aprobados ni modificar
   revisiones históricas. Repetir conformidad local antes de aceptar un gate remoto.

El gate remoto sigue cerrado y no se modificó producción ni se publicaron estos casos.

### Pendiente: fidelidad de salida JPEG exploratoria

output-jpeg tiene formato/dimensiones correctos y carece de metadatos, pero su delta
máximo observado fue **25**, superior al criterio 20. JPEG implica pérdidas; esto
no demuestra un fallo de seguridad ni afecta la salida PNG del contrato actual.
Propuesta: acordar criterios fotométricos apropiados por formato y revisar calidad
si se desea introducir JPEG de salida. No se relajó el criterio ni se habilitó JPEG
en Admin/catálogo para hacer pasar el ensayo.

## Configuración y comandos

Desde la raíz, preparación segura y sin uso remoto:
```powershell
node infra/cloudflare/dev/scripts/images-probe.mjs prepare
node infra/cloudflare/dev/scripts/images-probe.mjs offline
node --test infra/cloudflare/dev/test/images-probe.test.mjs
npm --prefix infra/cloudflare/dev run build
npm --prefix infra/cloudflare/dev run lint
npm --prefix infra/cloudflare/dev test
```
El segundo comando puede devolver código 1 por los hallazgos descritos; no significa
que se haya intentado una operación remota. La preparación usa remote:false.

Artefactos ignorados por Git, en infra/cloudflare/dev/.wrangler/images-probe/:
```
entry.js
wrangler.offline.json
preparation.json
offline-results.json
assessment.json
```
assessment.json conserva estado de cuenta sanitizado, no autorización, cero llamadas
remotas y hallazgos. El runner no inventa resultados/importe ni crea remote-results.json
cuando solo se ha ejecutado offline.

Solo después de una autorización nueva y verificación del servicio, el operador
podría usar este comando preparado (NO ejecutado):
```powershell
node infra/cloudflare/dev/scripts/images-probe.mjs remote --authorize-images-usage --confirm-account-plan --account-id=ID_REAL_DE_LA_CUENTA
```
El ID debe corresponder a la sesión existente; no se incluyen identificadores reales
en el repositorio. El wrapper genera configuración temporal con solo IMAGES remoto:
```json
{
  "images": { "binding": "IMAGES", "remote": true },
  "vars": {
    "PROBE_MODE": "remote",
    "PROBE_APPROVED": "explicit-images-test"
  }
}
```
Esto es un fragmento explicativo, no la configuración del Admin. El marcador no es
un token ni una credencial. No ejecutar manualmente configs remotas saltando el wrapper.
Wrangler inicia código local; el único servicio remoto permitido sería Images.
La configuración estricta excluye D1/R2, Workers existentes y rutas públicas.

## Costos, riesgos y recomendación

- El diseño limita a 27 solicitudes del corpus, techo de 32 por sesión y tres
  concurrentes. Cada solicitud puede transformar una imagen; info() es adicional.
  No se equiparan solicitudes a unidades facturadas: hay preflight sin transformación,
  deduplicación mensual y errores del proveedor.
- No se verificó consumo previo/plan ni una factura. No se promete costo cero ni
  un tope monetario contractual. Revisar cuota, plan, tarifa vigente y alertas antes.
- El token OAuth existente podría carecer de permisos para la conexión. Si falla,
  detenerse; solicitar aprobación antes de login/ampliación, sin activar productos.
- Un 503 de un archivo negativo se registra como rechazo recuperable, no como
  prueba concluyente de un decoder estricto. Los controles positivos deben pasar.
- El simulador local utiliza sharp internamente. No es un decoder independiente
  ni certifica el motor real. La comparación remota permanece enteramente pendiente.
- El timeout del runner no garantiza cancelación del trabajo ya enviado al servicio.
  No hay reintentos automáticos. Reportes no contienen secretos ni datos reales.

**Orden recomendado:** revisar este informe → corregir y probar el límite de
descompresión PNG → verificar plan/permisos/cuota → autorizar expresamente un único
ensayo remoto aislado → revisar sus resultados antes de cualquier habilitación DEV.
No cambiar IMAGE_POLICY_VERIFIED hasta que se apruebe esa evidencia.

Sin despliegues, suscripciones nuevas, migraciones remotas, D1/R2 remotos, cambios
de Access/Hostinger/DNS, commit ni push. Se detiene esta fase para revisión.
