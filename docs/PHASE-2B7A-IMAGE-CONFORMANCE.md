# Fase 2B.7A — Corrección PNG y conformidad multimedia

24/10/2026 · America/Costa_Rica. Ejecución exclusivamente local.

**Decisión:** corrección del contrato PNG aprobada en pruebas locales. Se puede
preparar la revisión de un ensayo aislado del motor real, pero **no se autoriza ni
se habilita Images remoto**. Siguen pendientes plan/cuota, consentimiento explícito,
pruebas del motor real y revisión de resultados. JPEG de salida sigue siendo
exploratorio, fuera de la publicación administrativa.

## 1. Reproducción original y causas raíz

Se reutilizaron los mismos 24 inputs sintéticos de 2B.7, más tres solicitudes
paralelas: 27 operaciones locales. No se cambiaron bytes de los fixtures originales.
Se conservó el resultado anterior en .wrangler/phase2b7a/before.json y se reprodujo
25/27 antes de aplicar la corrección.

### PNG: rechazo incompleto, no un fallo de CRC

inflation-bomb declara RGB 8 bits, 1×1: su raster necesita exactamente **4 bytes**,
un filtro y tres componentes. IDAT contiene un zlib válido que expande a **4 MiB**.
CRC, firma, dimensiones y Adler podían ser correctos. Sharp y el simulador Images
producían una imagen de un píxel, ignorando datos sobrantes.

El preflight anterior verificaba el contenedor, pero no recorría el stream
descomprimido ni comprobaba su longitud contra IHDR. La recodificación exitosa
no demostraba que el archivo completo fuera coherente. Era un incumplimiento
del rechazo estricto y del control de descompresión; no se ha demostrado un ataque
contra producción ni el comportamiento del motor remoto.

### JPEG: referencia inadecuada para aislar una recodificación con pérdidas

output-jpeg tiene dimensiones/orientación correctas y no contiene EXIF/ICC/XMP.
El JPEG de 364 bytes tiene el mismo SHA-256 que sharp JPEG **calidad 80, 4:2:0**.
No apareció un fallo de orientación ni cambio inesperado de perfiles: la diferencia
se reproduce con el mismo encoder y parámetros sobre el PNG original.

La referencia antigua era el raster PNG sin comprimir y el criterio medía solo
cuatro esquinas. El resultado era delta máximo 25 frente a límite 20. La diferencia
corresponde a cuantización/submuestreo de JPEG, especialmente visible en este
fixture diminuto de colores saturados con bordes duros.

Se inspeccionó el simulador Miniflare instalado: el handler de Images toma
output_format, pero no propaga output_quality a su transformador. Pedir calidad 90
en output() sigue generando el mismo JPEG calidad 80 offline. No se modificaron
dependencias ni se sustituyó el binding por un mock para hacer pasar el caso.

## 2. Corrección PNG aplicada

La política pasa de **kuwago-png-v1 a kuwago-png-v2**. La versión vieja no habilita
la nueva. No se alteraron migraciones, registros aprobados, imágenes persistentes
ni revisiones históricas; los tests usan bases y buckets efímeros.

### Contenedor y chunks

- IHDR único y primero, IEND único y último, sin bytes posteriores.
- CRC de cada chunk y bit reservado del tipo; rechazo de críticos desconocidos.
- Combinaciones válidas de profundidad/color, dimensiones máximas y área máxima.
- PLTE obligatorio en indexados, prohibido en grises, tamaño/número de entradas
  coherente con bit depth; secuencia correcta respecto de tRNS e IDAT.
- tRNS sin duplicados, con longitud/rangos válidos y prohibido en imágenes con alfa.
- IDAT consecutivos, admitiendo fragmentación y chunks de tamaño cero legales;
  rechazo de reanudación tras un ancillary intermedio.
- Conservación del rechazo de APNG y del límite de chunks/tamaño comprimido.

### Raster y zlib

validatePngData usa DecompressionStream('deflate') en Workers. Concatena lógicamente
los contenidos IDAT sin copiar un raster completo. Calcula el número exacto de bytes
esperados a partir de dimensiones, componentes, profundidad y método de interlace.

Para cada fila se cuenta un byte de filtro más ceil(ancho×componentes×bits/8).
Adam7 usa los siete pasos y omite los pasos vacíos: no se inventan filas para ellos.
Se comprueban filtros 0–4 y longitud exacta; se detiene al superar el raster esperado.
EOF prematuro, checksum inválido, zlib truncado, streams concatenados y bytes
comprimidos posteriores se rechazan, incluyendo pruebas dentro de workerd.

En imágenes indexadas se deshacen los filtros de fila y se comprueba que cada
índice real exista en PLTE. Se respetan bits de padding. Solo se conservan dos
filas de índices, como máximo unos 8 KiB, no la imagen completa.

Entrada/salida siguen limitadas a 2 MiB, 4096 por eje y 8 MP. El máximo teórico
de raster RGBA16 es 64 MiB más filtros; se verifica en streaming y no se asigna
ese raster en JavaScript. Hay límite lógico de 30 s y lectura acotada. Esto limita
los datos aceptados, pero no certifica una cota absoluta de memoria nativa/CPU
del runtime ni un SLA bajo carga.

La estructura de zlib/scanlines/Adam7 sigue la [especificación PNG](https://www.w3.org/TR/png/).
La comprobación propia no reemplaza al decoder: verifica contenedor, raster y
coherencia; el decoder de confianza sigue reconstruyendo/recodificando la imagen.

### Integración y cuarentena

La misma validación se aplica **antes** del decoder local Sharp y del binding
Images, y de nuevo a sus salidas PNG antes de almacenarlas. El helper Sharp aislado
es un decoder, no una vía HTTP alternativa: el punto de entrada autorizado sigue
siendo processImage y el middleware JWT/RBAC.

- Entrada definitivamente inconsistente: 422, estado rechazado, auditoría y sin
  posibilidad de aprobación. El caso original no invoca el decoder.
- Salida del decoder inválida o fallo operativo: 503 y cuarentena, derechos
  pendientes, sin derivado aprobado. No se culpa al usuario de un fallo del proveedor.
- La validación no concede derechos; la aprobación independiente y el control
  comercial por revisión siguen intactos. Publicación, outbox, barrera y restauración
  conservan sus transacciones y controles anteriores.

Los assets v1 existentes no se certifican retrospectivamente como v2. Antes de
promover contenido legacy a un entorno real corresponde revisar/reprocesar con
nuevo asset, sin sobrescribir una revisión aprobada ni perder auditoría.

## 3. JPEG: métricas y criterio explícito

Resultados del fixture original con sharp, sin cambios de orientación/color:

| Calidad JPEG | Bytes | Delta esquinas contra PNG | MAE global contra PNG | PSNR contra PNG |
|---|---:|---:|---:|---:|
| 80, perfil efectivo offline | 364 | 25 | 10,0547 | 22,1248 dB |
| 85, experimento Node | 372 | 16 | 9,0078 | 22,5742 dB |
| 90, experimento Node | 388 | 3 | 8,2760 | 22,6790 dB |
| 95, experimento Node | 401 | 6 | 7,4089 | 22,8647 dB |
| 100, experimento Node | 425 | 1 | 6,7865 | 22,8779 dB |

El máximo global por canal del perfil 80 es 140 en bordes: no se oculta con la
medición de esquinas. Subir calidad no elimina el submuestreo ni garantiza idéntico
raster. Estos datos no justifican JPEG para logos o interfaces de bordes duros.

**Cambio explícito de evaluación, no reducción silenciosa del umbral:**

1. Se conserva pixelCornerMaxDelta=25 y legacyRawPixelPass=false; el límite antiguo
   sigue siendo 20. Si se usa únicamente esa evaluación histórica, el resultado
   posterior a corregir PNG es **26/27**, no 27/27.
2. Para JPEG exploratorio se añade una referencia de codificación equivalente:
   JPEG q80/4:2:0 en el simulador, q90/4:2:0 solicitado en el eventual motor real.
   Se compara el raster completo contra esa referencia, con máximo por canal **3**.
   No se comparan solo esquinas y no se exige igualdad de bytes comprimidos.
3. Offline: error máximo global **0**, MAE **0**, raster idéntico a la referencia
   equivalente. Por eso se acepta como **compatibilidad del códec en ese perfil**.
   No se acepta como conservación sin pérdidas del PNG ni como calidad comercial.
4. El reporte identifica scope exploratorio y productionApproved=false. JPEG y
   WebP de salida no se incorporan al Admin/catálogo. El contrato real sigue en PNG.
5. Se solicita explícitamente q90 en el probe. El reporte deja constancia de que
   el simulador no lo honra. El motor real debe comprobarse; una diferencia contra
   la referencia q90 no se dispensará automáticamente.

La nueva evaluación se identifica como **png-v2/jpeg-equivalent-encoding-v1**.
No es comparable sin explicación al perfil único anterior. La aceptación del
JPEG es limitada y medible, no una declaración de fidelidad visual universal.
[Opciones de salida de sharp](https://sharp.pixelplumbing.com/api-output/).

## 4. Antes y después

| Verificación | Antes 2B.7 | Después 2B.7A |
|---|---|---|
| PNG 1×1 con 4 MiB descomprimidos | 200; aceptado indebidamente | 422 png_raster_length_mismatch; decoder no invocado |
| Contrato PNG/rechazos, 25 solicitudes | 24/25 | **25/25** |
| JPEG raw contra PNG, criterio antiguo | Delta 25 >20 | **Sigue registrado como fallo de ese criterio** |
| JPEG contra perfil equivalente, raster completo | No medido | Error 0; capacidad exploratoria aceptada |
| WebP exploratorio | Aceptado | Aceptado; sin habilitación de publicación |
| Evaluación total | 25/27 con perfil antiguo | **27/27 con perfiles explícitos nuevos** |
| Gate de política | v1 | v2; v1 denegado |
| Motor real / consumo remoto | No ejecutado | No ejecutado |

Las regresiones no se cambiaron para aceptar un PNG malformado. El test anterior
que esperaba aceptación del excedente ahora exige su rechazo antes del decoder.
El test JPEG conserva la discrepancia histórica y exige métricas nuevas visibles.

## 5. Pruebas realizadas

**149 resultados backend aprobados**, incluyendo contenedores de subtests y diez
resultados nuevos de PNG estricto. Además: **31 pruebas Admin**, **49 contratos y
regresiones públicas**, **16 recorridos E2E**, TypeScript estricto, lint y builds
del Worker, Admin y landing. No se instalaron dependencias.

Cobertura adversarial nueva en workerd:
- Vector CRC conocido y PNG producido independientemente por sharp.
- Combinaciones legales de color/profundidad, IDAT partido/vacío y Adam7 pequeño,
  rectangular, indexado y 16 bits; decodificación independiente con sharp.
- Raster corto/largo, filtros fuera de rango, Adler roto, streams truncados,
  concatenados y datos sobrantes después del zlib.
- Críticos duplicados/fuera de orden/desconocidos, PLTE/tRNS inválidos, índices
  de paleta inexistentes después de deshacer filtros y bit reservado incorrecto.
- Input corrupto que no puede aprobarse y output del decoder corrupto que conserva
  cuarentena. Gate v1 rechazado; cero llamadas al decoder para el caso excedente.

La suite existente vuelve a cubrir JWT/RBAC, conflictos, aprobación independiente,
publicación/retirada, 202, reconciliación y restauración. No se cambiaron sus permisos.
E2E final: 16/16 y sin excepciones JavaScript, ambos idiomas, temas y responsive.
Una ejecución inicial concurrente con builds falló por timeout/recarga de la vista;
se añadieron diagnósticos del paso/errores y la ejecución aislada pasó completa.
No se eliminaron aserciones ni se aumentaron los timeouts para hacerla pasar.

## 6. Reproducibilidad y archivos

Desde la raíz:
```powershell
npm --prefix infra/cloudflare/dev run build
node --test infra/cloudflare/dev/test/png-conformance.test.mjs
node infra/cloudflare/dev/scripts/images-probe.mjs offline
npm --prefix infra/cloudflare/dev test
npm --prefix infra/cloudflare/dev run lint
npm --prefix apps/admin test
npm --prefix apps/admin run build
npm --prefix apps/admin run lint
npm --prefix apps/admin run test:e2e:local
npm run check
npm run test:contracts
npm run test:catalog
npm run test:assets
npm run test:loader
npm run test:pwa
npm run build
```
E2E requiere KUWAGO_PLAYWRIGHT_MODULE y el navegador ya instalados, como antes.
El probe se ejecutó solo con remote:false; no hizo whoami ni conexiones a la cuenta.

Artefactos ignorados, en infra/cloudflare/dev/.wrangler/phase2b7a/:
before.json, reproduction.log, jpeg-analysis.json, after.json, conformance.log,
backend-final.log, png-tests.log, media-regression.log, admin-tests.log y e2e-debug.log.
after.json separa contract, exploratory y legacyRawProfileFailures.
Las capturas E2E están en .wrangler/admin-e2e/.

Nuevos:
```
infra/cloudflare/dev/scripts/image-fidelity.mjs
infra/cloudflare/dev/test/png-conformance.test.mjs
docs/PHASE-2B7A-IMAGE-CONFORMANCE.md
```
Modificados:
```
infra/cloudflare/dev/src/images/policy.ts
infra/cloudflare/dev/src/images/processor.ts
infra/cloudflare/dev/probe/entry.ts
infra/cloudflare/dev/scripts/images-probe.mjs
infra/cloudflare/dev/test/image-runtime.test.mjs
infra/cloudflare/dev/test/images-probe.test.mjs
infra/cloudflare/dev/test/multimedia.test.mjs
apps/admin/scripts/e2e-local.mjs
```
No se modificaron el corpus original, UI del Admin, contratos compartidos, SQL,
landing, Worker público, configuración de infraestructura ni dependencias.

## 7. Riesgos residuales y condiciones de aprobación

- El motor real de Images sigue sin probarse. El simulador no demuestra calidad,
  latencia, cuotas, errores, metadatos ni estrictitud de todos los codecs remotos.
- El streaming se probó en workerd local; falta medir memoria/CPU y concurrencia
  bajo carga real. El timeout lógico no implica cancelar todo trabajo del proveedor.
- Un decoder puede tener vulnerabilidades fuera del corpus. Los límites, aislamiento,
  parcheo, revisión independiente y privacidad siguen siendo necesarios.
- JPEG exploratorio no es un formato de publicación aprobado. El perfil de calidad
  real y su comportamiento con fotos requieren revisión separada.
- El contenido v1 no recibe una certificación v2 automática; no se altera el historial.

**Recomendación:** aprobar esta corrección offline del contrato PNG y revisar el
ensayo remoto aislado preparado en 2B.7. Antes de ejecutarlo: confirmar cuenta,
plan, permisos y cuota; obtener autorización explícita para consumo; mantener
sin D1/R2 remotos ni Worker administrativo; usar únicamente fixtures sintéticos.
El gate v2 del Admin debe permanecer sin habilitar hasta aprobar la evidencia real.
No hay autorización de despliegue ni de publicación con este informe.

Sin Images remoto, consumo facturable, suscripciones, cambios de Access/D1/R2
remotos, Hostinger/DNS, deploy, commit ni push. Se detiene para revisión.
