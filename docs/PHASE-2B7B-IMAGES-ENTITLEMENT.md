# Fase 2B.7B — Disponibilidad de Cloudflare Images Binding

24/10/2026 · America/Costa_Rica.

**Conclusión: preparación compatible; acceso efectivo de la cuenta todavía no confirmado.** La documentación admite Images Binding remoto con código local y la versión instalada de Wrangler lo contempla. Las suscripciones comunicadas por el usuario son consistentes con continuar la verificación, pero no demuestran por sí solas que el binding pueda ejecutarse. No se ejecutó ninguna operación de Images ni se inició una conexión remota de prueba.

## 1. Alcance y evidencia

Se revisaron `docs/PHASE-2B7-IMAGES-VALIDATION.md`, `docs/PHASE-2B7A-IMAGE-CONFORMANCE.md`, el coordinador `infra/cloudflare/dev/scripts/images-probe.mjs` y la configuración offline generada. Se consultó documentación oficial vigente y metadatos de la sesión existente de Wrangler. No se modificaron código, configuraciones ni dependencias. Este informe es el único archivo creado en esta fase.

| Evidencia | Procedencia | Resultado y alcance |
|---|---|---|
| Workers Paid, R2 Paid e Images Stream Basic | Inspección del Dashboard comunicada por el usuario | Confirmación del usuario; no reconsultada aquí mediante API de suscripciones |
| Transformaciones registradas: cero | Dashboard comunicado por el usuario | No demuestra cuota restante, ventana de facturación ni acceso al binding |
| Sin métricas de Images Binding | Dashboard comunicado por el usuario | No prueba indisponibilidad; ausencia de métricas tampoco prueba habilitación |
| Sesión Wrangler | `whoami --json`, salida sanitizada | Autenticada, OAuth Token, una cuenta accesible, código de salida 0; sin nuevo login |
| Permisos declarados | Misma consulta | `user:read`, `offline_access`, `account:read`, `workers:write`, `workers_scripts:write`, `workers_routes:write`, `zone:read` |
| Lectura de Images y Billing | Permisos declarados frente a documentación API | No aparecen permisos Images/Billing; no se intentaron esas consultas autenticadas |
| Identidad de la cuenta objetivo | Sesión frente al Dashboard informado | La consulta sanitizada no acredita por sí sola que sea la misma cuenta. Debe cotejarse privadamente antes de autorizar consumo |
| Wrangler instalado | `node_modules/wrangler/package.json` del entorno DEV | 4.152.0 |
| Configuración preparada | Coordinador y JSON offline | `images.binding=IMAGES`; `remote` depende del modo. El JSON offline mantiene `remote:false`; sin D1/R2 |
| Conformidad de imágenes | Informe 2B.7A existente | Resultado previo offline, no nueva ejecución ni evidencia del motor real |

La salida de autenticación se capturó en memoria y solo se imprimieron estado, tipo de autenticación, cantidad de cuentas y nombres de scopes. No se publican identificadores de cuenta, correos, tokens ni cookies. Los permisos de escritura presentes en la sesión no se utilizaron.

Se inspeccionó el estado Git: existen numerosos cambios de fases anteriores. Se preservan; esta revisión no los descarta ni los considera nuevos cambios de 2B.7B.

## 2. Suscripción y cuota: lo que confirma la documentación

La [documentación de precios de Images](https://developers.cloudflare.com/images/pricing/) distingue:

| Modalidad publicada | Transformaciones |
|---|---|
| Images Free | Hasta 5.000 únicas al mes; al excederlas, nuevas transformaciones pueden devolver 9422, sin cobro automático por exceso |
| Images Paid | Primeras 5.000 incluidas; USD 0,50 por 1.000 adicionales al mes |

El almacenamiento y la entrega de imágenes alojadas en Images se facturan por separado. Las consultas `.info()` no se facturan. Estos son precios y cuotas públicos, no el saldo verificado de Kuwago.

**No se necesita deducir una suscripción nueva a partir de Workers Paid o R2 Paid.** Son productos distintos. Tampoco se traduce automáticamente la etiqueta comercial «Images Stream Basic» a una habilitación específica del binding: falta comprobar el detalle del producto y su correspondencia con la cuenta objetivo. No hay evidencia suficiente para recomendar contratar o cambiar el plan.

No se afirma que queden 5.000 transformaciones disponibles ni que una futura prueba cueste cero. Deben confirmarse el periodo, consumo acumulado, modalidad efectiva y condiciones de la cuenta. La cifra cero del Dashboard carece aquí de evidencia independiente de su rango temporal y filtros.

## 3. Consultas de lectura disponibles y límites encontrados

| Consulta oficial | Permiso mínimo de lectura documentado | Qué verifica | Ejecución en esta fase |
|---|---|---|---|
| `GET /accounts/{account_id}/subscriptions` | Billing Read | Suscripciones y detalles devueltos para la cuenta | No ejecutada; la sesión no declara ese permiso |
| `GET /accounts/{account_id}/images/v1/stats` | Images Read | Conteo y capacidad de imágenes almacenadas | No ejecutada; la sesión no declara ese permiso |
| Wrangler `whoami --json` | Sesión existente | Autenticación, cuentas accesibles y scopes | Ejecutada, con salida sanitizada |

Fuentes: [List Subscriptions](https://developers.cloudflare.com/api/resources/accounts/subresources/subscriptions/methods/get/) e [Images usage statistics](https://developers.cloudflare.com/api/resources/images/subresources/v1/subresources/stats/methods/get/).

El endpoint de estadísticas expone `count.current` y `count.allowed` de almacenamiento. No debe utilizarse como cuota de transformaciones ni como prueba de acceso al binding. En las referencias públicas consultadas no se encontró un GET específico que certifique el entitlement operativo del binding sin procesar imágenes. Esta es una limitación de lo investigado, no una afirmación sobre APIs internas de Cloudflare.

No se inventa una respuesta 403: esas dos consultas no se enviaron. No se extrajeron credenciales internas de Wrangler, generaron tokens ni ampliaron scopes. Tampoco se consultaron claves de firma de Images. La vía pendiente de lectura es revisar los detalles de la suscripción y cuota en una sesión autorizada del Dashboard, o mediante un mecanismo de lectura ya habilitado que disponga de los permisos correspondientes.

## 4. Wrangler: modalidad correcta y aislamiento

La [documentación de desarrollo local](https://developers.cloudflare.com/workers/local-development/#remote-bindings) describe expresamente esta configuración para Images:

```json
{
  "images": {
    "binding": "IMAGES",
    "remote": true
  }
}
```

Es un fragmento explicativo, **no una configuración activada durante esta fase**. Permite ejecutar código local y utilizar el motor remoto solamente para ese binding. La simulación local tiene fidelidad limitada. La [referencia del binding](https://developers.cloudflare.com/images/optimization/binding/) documenta el procesamiento de bytes sin requerir una imagen de origen publicada.

La preparación existente es adecuada para aislar el ensayo: Worker de prueba distinto del Admin, loopback `127.0.0.1`, sin bindings D1/R2, sin rutas públicas, con `workers_dev:false` y `preview_urls:false`. Esto no sustituye la necesidad de revisar toda configuración efectiva antes de ejecutarla.

No usar `wrangler dev --remote`: ese modo sube código a un preview remoto. No se ejecutó `wrangler dev`, no se abrió la sesión/proxy de binding remoto y no se enviaron imágenes, ni siquiera mediante `.info()`. Aunque esa consulta sea gratuita, implica procesamiento remoto ajeno al alcance de esta verificación.

## 5. Dictamen

| Comprobación | Estado |
|---|---|
| Soporte oficial del binding remoto con Worker local | **Aprobado documentalmente** |
| Compatibilidad de la configuración preparada | **Aprobada por inspección**, sin conexión remota |
| Suscripciones y métricas comunicadas | **Evidencia del usuario**, conservada con ese alcance |
| Acceso efectivo de esta cuenta al binding | **Pendiente** |
| Plan de transformaciones y cuota restante de esta cuenta | **Pendiente** |
| Autorización de procesamiento/consumo remoto | **No concedida para esta fase** |
| Activación del procesador en Admin DEV | **No autorizada por este informe** |

No se ha identificado una incompatibilidad que justifique cambiar infraestructura. Tampoco se ha demostrado disponibilidad operativa. Las aprobaciones offline de 2B.7A mantienen su alcance; no certifican orientación, metadatos, calidad, latencia o fallos del motor real.

## 6. Propuesta de prueba remota mínima, todavía no ejecutada

1. Cotejar privadamente la cuenta del Dashboard con la seleccionada en Wrangler. Confirmar detalle del plan, periodo y cuota; detenerse si exige activar productos, ampliar permisos o iniciar una autenticación no autorizada.
2. En una fase posterior, preparar un selector de caso único y un límite estricto en el coordinador. **El runner actual ejecuta el corpus completo y admite hasta 32 solicitudes: no sirve tal cual para una autorización limitada a una transformación.** No se cambia ahora.
3. Utilizar un único PNG sintético pequeño, sin datos privados, con hash y dimensiones conocidos; validar primero el archivo offline.
4. Iniciar el Worker local aislado con solo IMAGES remoto. Autorizar expresamente la conexión temporal necesaria para el binding; no desplegar un Worker ni reutilizar el administrativo.
5. Ejecutar como máximo una operación de recodificación PNG y dos consultas `.info()` de entrada/salida. Sin reintentos automáticos ni concurrencia. No utilizar almacenamiento alojado, D1, R2 o URLs públicas.
6. Registrar resultado sanitizado: aceptación o error, duración, dimensiones, tipo de salida, hash, ausencia de metadatos y validación estricta PNG v2. El hash del resultado identifica la evidencia; no se exige igualdad binaria con sharp.
7. Cerrar la conexión al terminar o ante el primer error. Registrar el consumo observado si el panel lo permite, considerando posibles demoras. Una llamada puede consumir cuota o generar cargo según el plan; no se garantiza costo cero.

Esta prueba solo confirmaría acceso y un caso PNG. No aprobaría el conjunto JPEG/WebP, concurrencia, rendimiento productivo ni integración remota del Admin. El corpus completo requeriría una autorización de alcance separado.

### Autorización necesaria

Antes de implementar y ejecutar ese ensayo, obtener autorización explícita que delimite, por ejemplo:

> Autorizo preparar y ejecutar una prueba aislada de Images Binding en la cuenta previamente verificada, con un PNG sintético, máximo una transformación y dos consultas info, sin reintentos. Autorizo la conexión temporal del binding remoto y el posible consumo de cuota o cargo de Images según el plan. Sin D1/R2, despliegues, activación de productos ni cambios de suscripción.

Este texto es una propuesta, **no una autorización recibida**. Si aparece un requisito adicional de contratación o permisos, detenerse y comunicarlo.

## 7. Cierre de la fase

Verificaciones realizadas: lectura de informes y configuración local, versión de Wrangler, consulta autenticada de metadatos y contraste con documentación oficial el 24/10/2026. No se repitieron pruebas de aplicación: no hay cambios de código. Los resultados históricos de 2B.7A no se presentan como pruebas ejecutadas hoy en 2B.7B.

Sin transformaciones, subidas, activaciones, cambios de suscripción, generación de tokens, conexiones Images de prueba, deploy, cambios de Access/D1/R2, Hostinger/DNS, commit ni push. Se detiene para revisión.
