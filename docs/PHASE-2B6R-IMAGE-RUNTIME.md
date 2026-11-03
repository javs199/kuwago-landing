# Fase 2B.6R — Runtime de imágenes

24/10/2026 · America/Costa_Rica. Cierre de implementación y validación LOCAL.

**Decisión:** Cloudflare Images Binding como procesador seleccionado para Workers.
El adaptador portable está implementado y probado en workerd con el binding offline.
La habilitación multimedia en DEV remoto sigue bloqueada hasta comprobar el motor
real con imágenes sintéticas y autorización separada. No se activó ningún servicio.

## 1. Auditoría de sharp y requisitos conservados

El único import de sharp propio de la aplicación de procesamiento está en
scripts/image-normalizer.mjs, fuera del bundle Worker; otras importaciones son
fixtures/pruebas. El harness local lo conecta mediante IMAGE_NORMALIZER.
sharp 0.35.5 usa binarios nativos/libvips: nodejs_compat no convierte esos binarios
en módulos ejecutables por workerd. No se intentó empaquetarlo para Workers.
Véanse [instalación de sharp](https://sharp.pixelplumbing.com/install/) y
[compatibilidad Node de Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/).

El adaptador Node existente usa failOn:warning, límite de 8.000.000 píxeles,
metadatos para comprobar dimensiones/páginas, rotate() para orientación y png()
para decodificar/recodificar, sin conservar EXIF/ICC. Entrada y salida se limitan
a 2 MiB y 4096 por eje. No tiene un límite propio duro de memoria/CPU del proceso
Node; esos límites no deben confundirse con las comprobaciones de dimensiones.

Se conservan JWT real, identidad estable, RBAC D1, privacidad de originales,
aprobación de derechos independiente, revisiones inmutables, hashes de derivados,
restauración, outbox/reconciliación y barrera pública. Una carga no es publicación;
la validación técnica tampoco equivale a aprobación de uso.

La auditoría detectó dos carencias adicionales y se corrigieron: la respuesta
anterior solo comprobaba firma PNG y dimensiones declaradas por el decoder;
y cualquier respuesta no exitosa del decoder se clasificaba como corrupción.
Ahora se inspecciona la estructura real de salida y los fallos operativos conservan
cuarentena con código y auditoría persistentes, permitiendo reintento explícito.

## 2. Alternativas

| Criterio | A. Images Binding, seleccionado | B. WASM portable, p. ej. jSquash | C. Servicio aislado de confianza |
|---|---|---|---|
| Runtime | API oficial de Workers; prototipo ejecutado en workerd | Viable con integración explícita de módulos WASM | Worker llama binding privado; sharp vive fuera del isolate |
| Decoder | Operado/actualizado por Cloudflare; estrictitud a verificar con corpus real | Equipo debe mantener codecs y parches de seguridad | Equipo mantiene libvips, binarios y proceso |
| EXIF/orientación | Se verifica el resultado; ocho orientaciones probadas offline | Exige parser, transformaciones/reflejos y pruebas propios | sharp ya realiza orientación; protocolo debe verificar resultado |
| Recodificación | Entradas JPEG/PNG/WebP; este sistema conserva salida PNG | Requiere varios codecs; encoder PNG adicional | Implementación local existente produce PNG |
| Dimensiones/tamaño | Preflight propio antes del binding y controles posteriores | Mismos controles, además límites de memoria WASM | Mismos controles, además límites del proceso externo |
| Memoria/CPU | Evita crear raster RGBA en el código del Worker; motor administrado | Raster de 8 MP RGBA ≈32 MB, más copias/heap WASM; riesgo con concurrencia | Memoria/CPU deben aislarse y limitarse en el servicio |
| Latencia | Dos info() y una transformación al ingerir; medir p95 remoto | Inicialización WASM y CPU del isolate; benchmark pendiente | Salto adicional, colas/arranque y transferencia privada |
| Costos | Transformaciones + Workers/R2; cuenta no comprobada | Workers CPU/requests y R2; sin tarifa Images | Cómputo adicional, red/almacenamiento y operación |
| Dependencias | Ninguna dependencia nueva para el adaptador | Varios WASM y adaptación/versionado de codecs | sharp/libvips, despliegue y canal autenticado adicionales |
| Mantenimiento | Menor carga propia; vigilar cambios del proveedor | Mayor superficie propia de seguridad y compatibilidad | Mayor carga de despliegue, observabilidad y recuperación |

La viabilidad de WASM se apoya en el [ejemplo oficial del proyecto jSquash](https://raw.githubusercontent.com/jamsinclair/jSquash/main/examples/cloudflare-worker/README.md),
que exige configurar los módulos. Es un ejemplo en formato Worker antiguo:
no se presenta como integración moderna probada en este repositorio.
No se instalaron codecs WASM ni se construyó un servicio remoto alternativo.
Los riesgos/complejidad de B/C son evaluación de arquitectura, no benchmarks medidos.

Workers documenta 128 MB por isolate, compartidos por solicitudes concurrentes.
Las asignaciones WASM cuentan en ese límite. El tiempo de espera de un binding
no equivale a tiempo CPU del Worker. [Límites oficiales](https://developers.cloudflare.com/workers/platform/limits/).

## 3. Implementación desacoplada

- src/images/policy.ts: política kuwago-png-v1, firmas, estructura, dimensiones,
  orientación EXIF y saneamiento PNG. Es TypeScript portable, sin Node.
- src/images/processor.ts: interfaz ImageProcessor, implementación Images,
  wrapper del adapter local y elección explícita del procesador.
- multimedia.ts: usa processImage; sigue controlando almacenamiento/transacciones,
  validación y aprobación. No se trasladó autorización al procesador.

El contrato interno devuelve bytes PNG, dimensiones comprobadas, SHA-256 calculado
en Workers, política y procesador. D1 guarda política/procesador en validation_code,
además del digest existente. No cambia el esquema ni los contratos públicos.
No se alteraron migraciones, aprobaciones previas, medios sellados ni revisiones.

### Controles antes y después de decodificar

1. Límite de bytes antes de procesar, MIME real y coherencia con el declarado.
2. PNG: estructura/chunks, CRC, IHDR/dimensiones y fin completo; rechaza APNG.
3. JPEG habitual baseline/progresivo: segmentos, dimensiones SOF, EXIF TIFF,
   scans, EOI final sin concatenaciones; rechaza contenedores MPF/multipicture.
4. WebP: RIFF/tamaño, codec VP8/VP8L, canvas y dimensiones; rechaza animaciones.
5. Se rechazan dimensiones >4096 o área >8 MP antes de invocar el decoder.
6. Images info() debe concordar con formato, bytes y dimensiones de cabecera.
   info() solo no se considera prueba de decodificación completa.
7. input(bytes).output({format:'image/png', anim:false}) hace la transformación.
   No se usan URLs públicas, format:auto, redirecciones al original ni resizing
   para ocultar una entrada demasiado grande.
8. La salida se limita a 2 MiB, comprueba estructura/CRC y dimensiones orientadas.
   Solo se conservan IHDR/PLTE/tRNS/IDAT/IEND. EXIF, ICC, XMP/texto y cualquier
   otro ancillary desaparecen. Un PNG inválido del proveedor deja cuarentena.
9. Una segunda info() comprueba la salida saneada; el hash se calcula sobre los
   bytes finales que realmente se almacenan y posteriormente se aprueban.

Los parsers propios son un preflight/saneamiento estructural, **no un decoder**.
La validación del contenido comprimido depende del decoder de confianza. Formatos
JPEG poco comunes o estructuras no soportadas se rechazan; no se aceptan por duda.
La estrictitud del motor real frente a imágenes dañadas debe comprobarse antes de
habilitar su política. El saneamiento no es un análisis antimalware universal.

La documentación describe [Images con bytes y desarrollo local](https://developers.cloudflare.com/images/optimization/binding/)
y el tratamiento de [metadatos/orientación](https://developers.cloudflare.com/images/optimization/features/).
Se comprueba la salida en vez de confiar solo en esa descripción.

### Misma política, sin exigir el mismo PNG comprimido

Ambos adaptadores aplican los mismos límites y saneamiento. No se exige igualdad
de bytes entre libvips y el motor de Cloudflare: pueden codificar píxeles de forma
diferente. Cada digest corresponde al derivado exacto aprobado de su asset.
No se regenera/sobrescribe un derivado aprobado al cambiar de entorno o motor.
Un cambio de política/procesador exige un asset nuevo y revisión independiente.
Un retry que encuentra bytes distintos bajo una clave ya creada falla cerrado.

## 4. Selección y bloqueo seguro

IMAGE_PROCESSOR=cloudflare-images-v1 selecciona exclusivamente IMAGES.
IMAGE_POLICY_VERIFIED debe igualar kuwago-png-v1, tras la aceptación autorizada.
Por defecto no está establecido: la API responde 503 y mantiene cuarentena,
sin derivado ni derechos aprobados. No hay fallback automático a sharp/original.

El wrapper local-sharp-v1 requiere EXECUTION_MODE=local-only y IMAGE_NORMALIZER.
El harness añade explícitamente ese indicador. Es una restricción del procesador,
no un bypass JWT/RBAC. El cliente HTTP no puede establecer estas variables.
Sin procesador disponible se conserva la cuarentena existente.

Timeout lógico de 30 s para el proceso completo y lectura acotada de salida.
Entrada y salida usan buffers acotados, sin acumular una lista proporcional al
número de fragmentos recibidos; evita crecimiento de objetos por chunks diminutos.
El timeout no asegura cancelar una operación interna ya enviada a Images ni sus
costos; tampoco es preempción de CPU. Se requieren mediciones/alertas reales.
Se conservan cuotas de subida/lectura de 2B.6. Las copias comprimidas aún consumen
memoria por solicitud; no se certificó concurrencia máxima bajo 128 MB.

## 5. Evidencia y límites de las pruebas

Se ejecutó el bundle portable en **workerd**, usando el binding IMAGES offline real
de Miniflare, no un mock exitoso que devuelve bytes prefabricados. Se prohibió el
fetch externo en la prueba del adaptador. El API Worker completo se probó también
con Images, JWT RS256, RBAC, D1 y R2 efímeros.

El simulador offline de Miniflare usa procesamiento Node/sharp internamente.
Esto confirma el contrato y ejecución del código Worker, no independencia de
decoders ni equivalencia con la infraestructura de Cloudflare.
La documentación distingue un simulador offline de fidelidad limitada del motor
remoto. **No se utilizó --remote ni ninguna conexión de binding remota.**

| Caso | Resultado local |
|---|---|
| JPEG, PNG, WebP | Transformación PNG correcta, dimensiones y digest verificados |
| MIME falso, SVG/GIF | Rechazo previo al decoder |
| CRC roto, truncaciones, JPEG concatenado | Rechazo; nunca salida validada |
| Payload IDAT dañado con CRC reconstruido | Fallo de decodificación, sin aprobación |
| Cabecera de bomba de descompresión, tamaño excesivo | Rechazo previo por dimensiones/bytes |
| PNG/WebP animados | Rechazo, sin aplanar silenciosamente |
| EXIF 1–8 | Ocho resultados 200 offline, raster asimétrico comparado; incluye reflejos |
| Metadatos | Ausencia de EXIF y texto sintético privado en salida |
| Servicio caído, deadline, respuesta activa inválida | Error sanitizado; sin salida utilizable |
| Política no verificada / binding ausente | 503, cuarentena persistente y aprobación denegada |
| Fallo de conexión con política habilitada en fixture | Cuarentena/código persistentes |
| Intento de sharp fuera de modo local | Denegado antes de invocar el adapter |
| API completa con fixture de política local | Imagen validada y privada; editor no aprueba; admin independiente sí |

El valor de política habilitado en esa fixture **no certifica DEV remoto**.
La prueba de timeout usa 10 ms en el factory del test; producción mantiene 30 s.
No se usaron imágenes privadas reales ni datos comerciales.

Resultados: **131** resultados backend (incluidos contenedores de subtests),
**31** pruebas Admin, **49** contratos/regresiones públicas y **16** recorridos E2E.
TypeScript, lint, build Worker/Admin y verificaciones de aislamiento aprobados.
La suite original conserva publicación, retirada/202, RBAC, restauración y outbox.
Sin dependencias nuevas; auditoría npm sin vulnerabilidades reportadas.

Comandos desde la raíz:
```powershell
npm --prefix infra/cloudflare/dev run build
npm --prefix infra/cloudflare/dev run lint
npm --prefix infra/cloudflare/dev test
node --test infra/cloudflare/dev/test/image-runtime.test.mjs
npm --prefix apps/admin run build
npm --prefix apps/admin run lint
npm --prefix apps/admin test
npm --prefix apps/admin run test:e2e:local
npm run check
npm run test:contracts
npm run test:catalog
npm run test:assets
npm run test:loader
npm run test:pwa
```
E2E mantiene el requisito anterior KUWAGO_PLAYWRIGHT_MODULE y navegador instalado.
Logs locales ignorados: .wrangler/phase2b6r-*.log; capturas del Admin en admin-e2e/.

## 6. Costos y cuenta pendientes

Según la [tarifa pública consultada](https://developers.cloudflare.com/images/pricing/),
Images Free incluye 5.000 transformaciones únicas/mes; superar ese límite no compra
capacidad automáticamente y puede impedir transformaciones nuevas. Images Paid
incluye esas primeras 5.000 y cobra USD 0,50/1.000 adicionales. info() no se factura.
Son cifras documentales, no confirmación de la cuenta ni una contratación.

Usar R2 evita introducir almacenamiento alojado en Images; Workers, almacenamiento,
operaciones y backups R2 conservan su facturación. La normalización ocurre al ingerir,
no en cada lectura pública; reintentos/variaciones pueden afectar consumo.
Confirmar elegibilidad del binding, plan Images, cuotas, presupuesto y alertas.
Workers Paid no se toma como prueba de una suscripción Images concreta.

## 7. Wrangler propuesto, no aplicado

Fragmento a fusionar posteriormente en el entorno **administrativo DEV**, conservando
bindings D1/R2/Access/origen existentes. No es configuración completa ni un comando
de despliegue, y no se añadió a la configuración activa:
```json
{
  "images": { "binding": "IMAGES" },
  "vars": {
    "IMAGE_PROCESSOR": "cloudflare-images-v1",
    "IMAGE_POLICY_VERIFIED": ""
  },
  "limits": { "cpu_ms": 1000 }
}
```
El presupuesto CPU de 1 s es una propuesta conservadora a medir, no una garantía
ni el límite del motor Images. No añadir nodejs_compat para intentar cargar sharp.
No dar IMAGES, D1 ni PRIVATE_MEDIA al Worker público. El reconciliador continúa
copiando derivados ya aprobados y no necesita decodificar ni el binding Images.
El gate permanece vacío hasta cumplir la siguiente matriz.

## 8. Prueba remota mínima y condiciones de habilitación

**Pendiente y requiere nueva autorización**:

1. Verificar cuenta/plan/costos y aprobar el uso remoto de Images; sin compras
   automáticas. Preparar prototipo privado aislado, solo con Images y datos sintéticos.
   No necesita D1/R2 de Kuwago ni el sitio de Hostinger para probar el decoder.
2. Ejecutar el mismo corpus en el motor real: tres formatos, ocho orientaciones
   con raster asimétrico, EXIF/GPS/ICC/XMP/texto, animación y archivos malformados,
   truncados, entropy dañada, concatenados y bombas de dimensiones/descompresión.
3. Comprobar info(): nombres MIME, fileSize, orientación/dimensiones; PNG completo
   y sin metadatos después de saneamiento; digest sobre los bytes almacenables.
4. Probar errores de transformación/cuota y timeout. Nunca entregar originales
   ni marcar validado si el motor no permite demostrar un resultado correcto.
5. Medir CPU/heap del Worker, latencia p50/p95, concurrencia y facturación. Registrar
   versión del código/política, corpus y resultados. No se prometen números remotos.
6. Solo tras revisión satisfactoria autorizar binding/gate en Admin DEV; mantener
   JWT/Access, grants explícitos y aislamiento. Aplicar el gate verificado mediante
   configuración de despliegue, nunca mediante React o un endpoint administrativo.
7. Repetir ingestión → derechos → revisión → publicación → retirada → recuperación
   con recursos DEV autorizados. No trasladar fixtures/credenciales de pruebas.

Si el motor real tolera daños que violen la política, no se habilita el gate:
mantener cuarentena y reevaluar WASM o un servicio privado con decoder estricto.
La compatibilidad del adaptador está resuelta localmente; la aceptación del decoder
real y la preparación operativa siguen siendo condiciones bloqueantes de habilitación.

## 9. Archivos y cierre

Nuevos: src/images/policy.ts, src/images/processor.ts y test/image-runtime.test.mjs
en infra/cloudflare/dev, además de este informe.
Modificados en infra/cloudflare/dev: src/multimedia.ts, src/catalog/types.ts,
scripts/build.mjs, test/admin-harness.mjs y test/multimedia.test.mjs.
No se modificaron sharp, dependencias, SQL, contratos compartidos, React, su diseño,
landing pública ni configuraciones remotas. Trabajo Git anterior conservado.

Estado: **implementación y pruebas locales aprobadas; habilitación remota pendiente**.
Sin commit, push, deploy, migraciones remotas, activación Images, cambios de Access,
DNS ni Hostinger. Se detiene para revisión.
