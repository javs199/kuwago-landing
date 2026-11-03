# Fase 2B.7C — Una prueba remota aislada de Images

24/10/2026 · America/Costa_Rica.

**Estado final: APROBADO para el caso PNG sintético autorizado.** Una transformación mediante Images Binding remoto respondió HTTP 200 y cumplió el contrato comprobado. La conexión temporal terminó inmediatamente después. No se ejecutó el corpus remoto ni se habilitó el procesador en el Admin.

## 1. Autorización y límites ejecutados

La solicitud de esta fase autoriza una sola transformación PNG sintética, tolerancia de hasta US$1, sin reintentos, contratación, cambios de suscripción, deploy, D1/R2 remotos ni modificaciones de Workers existentes, Access, Hostinger o DNS.

Se revisaron los informes 2B.6R, 2B.7, 2B.7A y 2B.7B y el entorno de prueba preparado. El coordinador anterior recorre varios casos, por lo que **no se ejecutó su modo remoto**. Se añadió una variante de caso único que reutiliza el procesador y el constructor/validador de configuración de aislamiento existentes.

| Condición previa | Evidencia |
|---|---|
| Separación del sistema administrativo y público | Entrypoint de prueba local; no importa endpoints administrativos, autenticación, catálogo ni SQL |
| Único binding remoto | `images: { binding: "IMAGES", remote: true }` |
| Sin D1/R2 | Ninguna configuración de bases, buckets o servicios; validación exacta con `assertProbeConfig` |
| Sin modificar Worker existente | Wrangler en desarrollo local, nombre aislado `kuwago-images-isolated-probe`; sin comando deploy ni `dev --remote` |
| Sin ingreso público del Worker local | Loopback `127.0.0.1:8798`, `routes: []`, `workers_dev: false`, `preview_urls: false` |
| Imagen sintética y no sensible | PNG generado localmente, cuatro bloques de color; 24 × 16 píxeles y 117 bytes |
| Un intento | Límite del runtime consumido antes del procesamiento, guardia adicional en `output()` y un único POST del coordinador |
| Sin repetición tras reinicios | Diario exclusivo `attempt.lock` creado antes de abrir la conexión; una nueva ejecución queda denegada |
| Sesión existente | `whoami --json` capturado en memoria: sesión autenticada y exactamente una cuenta accesible; sin login ni generación de tokens |

La cuenta se seleccionó de la única cuenta accesible en esa sesión. No se reproducen identificadores ni credenciales. El acceso efectivo quedó demostrado por la respuesta real; esto no verifica todas las condiciones comerciales de la suscripción.

## 2. Archivos creados

```text
infra/cloudflare/dev/probe/single-entry.ts
infra/cloudflare/dev/scripts/images-single-probe.mjs
infra/cloudflare/dev/test/images-single-probe.test.mjs
docs/PHASE-2B7C-REMOTE-IMAGES-RESULT.md
```

No se modificaron el procesador, la política PNG v2, el runner anterior, la interfaz Admin, la landing, dependencias ni configuraciones de infraestructura existentes. Se preservan todos los cambios previos del repositorio.

Evidencia local generada, excluida por `.gitignore`:

```text
infra/cloudflare/dev/.wrangler/images-single-probe/
  input.png
  input.json
  entry.js
  wrangler.json
  attempt.lock
  output.png
  result.json
```

El JSON de configuración contiene el identificador de cuenta necesario, no tokens. No borrar el diario para repetir esta fase: otra transformación requiere nueva autorización.

## 3. Comandos y secuencia

Desde `infra/cloudflare/dev`, se ejecutaron primero las pruebas locales del límite de un intento:

```powershell
node --test test/images-single-probe.test.mjs
npm run lint
node ../../../apps/admin/node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck probe/single-entry.ts
```

**Única ejecución remota de esta fase** — registro histórico, no instrucción para repetirla:

```powershell
node scripts/images-single-probe.mjs remote-once --authorize-one-png --max-usd=1
```

El coordinador invocó la sesión existente de Wrangler mediante `whoami --json` y después:

```text
node node_modules/wrangler/bin/wrangler.js dev --config <ruta absoluta a .wrangler/images-single-probe/wrangler.json>
```

Wrangler ejecutó el código local con el binding Images remoto. Se hicieron consultas locales de disponibilidad `/health` sin acceso a Images. Hubo **un solo POST a `/case`**, sin redirecciones, fallback, pruebas paralelas ni reenvío automático. Tras recoger la evidencia, se cerró el árbol del proceso de prueba. Se comprobó después que el puerto 8798 no estaba escuchando.

El uso de binding remoto con código local está documentado por [Cloudflare](https://developers.cloudflare.com/workers/local-development/#remote-bindings). No se reutilizó ni desplegó el Worker administrativo. La conexión temporal necesaria para el binding forma parte del ensayo; no equivale a una actualización del Worker existente.

## 4. Resultado observable

Inicio del intento: **2026-10-24T21:55:26.195Z** (15:55:26 en Costa Rica).
Cierre registrado: **2026-10-24T21:55:30.643Z**.

| Dato | Resultado |
|---|---|
| Estado HTTP del único POST | 200 |
| Latencia local medida hasta las cabeceras de respuesta | 286 ms |
| Intentos de transformación `output()` | **1** |
| Transformaciones resueltas | **1** |
| Consultas `.info()` | **2**, entrada y salida; no son transformaciones |
| Validación del procesador | `validated: true` |
| Error de procesador / código de proveedor capturado | Ninguno |
| Entrada | PNG sintético, 24 × 16, 117 bytes |
| Salida | PNG, 24 × 16, 107 bytes |
| Píxeles decodificados | Idénticos a la entrada |
| EXIF, ICC y XMP detectados en salida | Ninguno |
| Hash de salida frente al encabezado del procesador | Coincide |

SHA-256 de entrada:

```text
1a553215d604d05fe58bc14b934c73335373d35f7d40191946ba8e74c3f3a03c
```

SHA-256 de salida:

```text
f0649bd322bb6d557ef717710742093eda9a647f00cc2b1c84834faa98ece193
```

Extracto sanitizado del runtime de prueba, conservado en `result.json`:

```json
{
  "mode": "remote",
  "maxTransforms": 1,
  "claimed": true,
  "infoCalls": 2,
  "transformAttempts": 1,
  "transformCompleted": 1,
  "validated": true,
  "error": null,
  "upstreamCode": null
}
```

La validación incluye las comprobaciones del procesador existente: preflight PNG estricto, dimensiones, decodificación informativa, salida PNG v2 válida, saneamiento y hash. La comparación local adicional comprobó igualdad del raster. No se exige igualdad binaria entre encoders; la diferencia de tamaño y hash no constituye un fallo.

No apareció error de entitlement, permiso o cuota en este caso. Esto demuestra disponibilidad operativa del binding para la cuenta utilizada en ese momento, no una garantía de capacidad futura.

## 5. Consumo y margen de US$1

**Consumo técnico observable:** un intento de transformación efectivo y dos consultas informativas. **Consumo monetario observable:** no disponible (`observedUsd: null`, `invoiceVerified: false`). No se consultó una factura ni se atribuyó un importe inventado a la cuenta.

La [tarifa pública consultada](https://developers.cloudflare.com/images/pricing/) incluye las primeras 5.000 transformaciones únicas mensuales; Images Paid indica US$0,50 por 1.000 adicionales. `.info()` no se factura. El importe proporcional de una transformación adicional sería US$0,0005 según esa tarifa, sujeto a cuota y reglas efectivas de facturación; no es un cargo comprobado.

El volumen ejecutado se mantuvo en el límite autorizado y su costo esperado según esa tarifa está por debajo de US$1. **No puede certificarse el gasto real facturado ni la cuota restante con esta evidencia.** El argumento `--max-usd=1` documenta el consentimiento; no crea un tope de facturación en Cloudflare. La salvaguarda aplicada fue limitar estrictamente las operaciones, sin activar productos ni cambiar planes.

## 6. Pruebas locales y cierre

- Pruebas nuevas: **3/3 aprobadas**, con binding falso y red externa bloqueada. Cubren el fixture aislado y la denegación de un segundo intento tras éxito o fallo. No consumen Images remoto.
- Lint del entorno DEV: aprobado.
- TypeScript estricto del nuevo entrypoint y sus imports: aprobado.
- Build del entrypoint mediante esbuild: aprobado durante la preparación local.
- Aislamiento y exclusión Git de los artefactos generados: comprobados.
- Puerto 8798 al finalizar: sin listener.

Durante la preparación local se corrigieron errores del fixture de pruebas y un import no utilizado antes de abrir la conexión remota. No hubo intentos remotos fallidos previos ni se repitió el intento exitoso. No se ejecutaron pruebas JPEG ni el corpus completo en esta fase.

## 7. Riesgos residuales y siguiente decisión

1. Un PNG pequeño no valida orientaciones EXIF, imágenes adversariales, tamaños máximos, carga concurrente, fallos prolongados ni otros formatos. No extrapolar este resultado a JPEG o a aprobación productiva general.
2. Las dos consultas `.info()` fueron suficientes para este archivo; no se han certificado todos los datos devueltos por el motor para otros archivos.
3. La medición de 286 ms incluye coordinación local y red; no representa CPU del Worker ni un SLA del proveedor.
4. El contador registra llamadas de la aplicación al binding; no permite auditar operaciones internas del proveedor ni sustituye sus métricas de facturación.
5. El bloqueo evita repetición mediante este coordinador y runtime, pero no impide que otro operador ejecute otros programas. Mantener el diario y el control de autorizaciones.
6. Los diagnósticos remotos se limitan a códigos y señales sanitizadas; no se guardan respuestas de autenticación ni logs crudos.

**Recomendación:** revisar este resultado y comprobar manualmente el consumo en el Dashboard cuando se actualice. Si se aprueba, definir y autorizar por separado un ensayo de conformidad PNG más amplio, con presupuesto y número de operaciones explícitos. No habilitar todavía multimedia del Admin ni avanzar automáticamente a otra fase.

Sin cambios de suscripción, D1/R2 remotos, Workers existentes, Access, DNS o Hostinger. Sin deploy, commit ni push. La fase termina aquí para revisión.
