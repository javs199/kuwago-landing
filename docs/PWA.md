# Grupo Kuwago — PWA V1

La experiencia personalizada de instalación se está implementando localmente sobre esta base, sin publicar cambios. Su comportamiento, archivos, pruebas y límites se describen en [PWA-INSTALLATION.md](PWA-INSTALLATION.md). Las referencias siguientes a ausencia de promoción propia corresponden a la V1 ya publicada.

Estado: configuración implementada y comprobada localmente el 22 de octubre de 2026. El usuario autorizó después commit, push y publicación en Hostinger. La verificación del dominio, versión y respaldo se registra en release/ y en el checklist de Notion. La instalación real en dispositivos Android/iOS sigue pendiente de prueba manual.

## Auditoría y alcance

No existían manifest, registro de Service Worker, metadatos de instalación ni iconos PWA. El sitio es estático, con dos páginas públicas, traducciones ES/EN y tema guardados por el código existente. Los cuerpos HTML se compararon con HEAD y permanecen idénticos: solo se añadieron metadatos y un script diferido en head.

El manifest define Grupo Kuwago / Kuwago, identidad estable `/`, inicio `/`, alcance `/`, modo `standalone` y colores `#3B0C5B`. Incluye PNG 192 y 512 para uso normal y PNG 512 específico maskable. El icono Apple de 180 px y los metadatos de iOS se incluyen en las dos páginas. Sin botones propios de instalación, promociones, publicidad, notificaciones ni suscripciones push.

## Marca e iconos

Fuente oficial existente: `assets/images/brand/kuwago-favicon.svg`, búho blanco sobre morado corporativo. Se rasterizó ese vector, sin recrear la marca. Los PNG son opacos; el maskable conserva más margen: todo el dibujo está dentro del círculo seguro central de radio 40% (172,4 px de radio máximo medido frente a 204,8 px permitidos en el lienzo de 512). Los demás iconos usan la composición original.

Generación reproducible con sharp como herramienta externa de desarrollo, sin nueva dependencia de producción ni cambios al lockfile:

```powershell
node scripts/generate-pwa-icons.mjs "RUTA_AL_DIRECTORIO_NODE_MODULES_QUE_CONTIENE_SHARP"
```

También funciona sin argumento si sharp está disponible en el entorno del proyecto. No es necesario regenerar iconos para ejecutar el sitio o su build.

## Service Worker y actualización

Se evaluó una caché offline y se optó por **network only, sin almacenamiento de aplicación**:

- `/sw.js`, alcance `/`, registrado al terminar la carga en un contexto seguro. `updateViaCache: none` evita reutilizar HTTP cache al comprobar actualizaciones del worker.
- Solo intercepta navegaciones GET de `/`, `/index.html` y `/concierge-marketplace.html` del mismo origen y sin query. Usa `fetch(request, { cache: 'no-store' })`.
- No intercepta APIs, rutas privadas, POSTs, consultas con parámetros, imágenes ni otros recursos. No utiliza Cache Storage, IndexedDB, localStorage ni datos personales. El tema/idioma del sitio sigue usando su almacenamiento anterior, sin cambios.
- No precarga archivos, no sirve copias antiguas ni inventa respuestas cuando falla la red. Se necesita conexión para cargar contenido; no se ofrece funcionamiento offline.
- Activa la nueva versión y toma control sin forzar recargas ni borrar cachés de otros componentes. Una página ya abierta conserva su documento hasta navegar o refrescar normalmente.
- `.htaccess` declara el MIME del manifest y pide revalidar HTML, manifest, worker y su registro; desactiva Expires para esos archivos. Los recursos existentes conservan su política HTTP habitual.
- Si el navegador no soporta el worker o falla el registro, el sitio sigue funcionando. El atributo no visual `data-pwa-worker` en `<html>` permite comprobar `ready`, `registering`, `unsupported` o `error`; no expone datos del usuario.

No se afirma que un Service Worker sea obligatorio en todos los navegadores actuales. Se incorpora este comportamiento acotado para preparar el ciclo de vida de la aplicación sin añadir caché offline ni modificar funciones comerciales.

## Archivos

- Nuevos: `manifest.webmanifest`, `sw.js`, `assets/js/pwa.js`.
- Nuevos iconos: `assets/images/pwa/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png`.
- Modificados: `index.html`, `concierge-marketplace.html`, `.htaccess`.
- Build y validación: `scripts/build.mjs`, `scripts/serve.mjs`, `scripts/check.mjs`, `package.json`.
- Nuevos comprobadores/herramientas: `scripts/pwa-check.mjs`, `scripts/test-pwa.mjs`, `scripts/generate-pwa-icons.mjs`, este documento.

El build copia manifest y worker a la raíz de dist; los PNG y el registro se copian con assets. No se exportan documentación, fuentes Trial ni imágenes excluidas de proyectos.

## Comprobaciones locales realizadas

- `npm run check`, `npm run build`, `npm run test:pwa` (8 pruebas), `npm run test:loader` (4 pruebas), sintaxis JS y `git diff --check`.
- Manifest y metadatos presentes en ambas páginas; dimensiones y cabeceras PNG, archivos y ámbito/inicio válidos. Validación repetida sobre dist.
- HTTP en `http://127.0.0.1:4174`: manifest `application/manifest+json`, inicio, ruta interna, worker, registro y cuatro iconos responden 200 con revalidación.
- En el navegador integrado se observó el registro real en estado `ready` en la landing y Servicios. Se revisaron navegación de ida/vuelta, menú móvil a 375 px, traducciones ES/EN, temas claro/oscuro y apertura de galería de Carabao. Sin desbordamiento en los anchos revisados.
- Ocho pruebas incluyen red sin caché, exclusión de rutas privadas/API/POST/query/orígenes externos, fallo offline sin respuesta falsa, ciclo de vida y registro fallido/no soportado.

El navegador integrado no proporciona una auditoría nativa de instalación Android/iOS ni acceso al panel Application de Chrome en estas herramientas. **No se ha instalado una app ni se ha certificado un resultado de instalación en un dispositivo físico.** Manifest válido y worker activo no equivalen por sí solos a esa comprobación.

Para repetir el preview con el servidor actualizado sin interferir con el que ya corre en 4173:

```powershell
$env:PORT = '4174'
npm run dev
```

## Verificación de producción — 22 de octubre de 2026

Publicado en https://grupokuwago.com/ con el código del commit `25ecb79`.

- Manifest, HTML, Service Worker y registro comparados por SHA-256 contra el paquete. Hostinger entrega `application/manifest+json` y cabeceras `no-cache, max-age=0, must-revalidate` sin Expires para esos documentos.
- Los cuatro PNG procesados por el hosting conservan dimensiones, opacidad y similitud de píxeles con los originales; la zona segura del maskable se verificó también sobre la respuesta pública.
- Registro real `data-pwa-worker=ready` observado en landing y Servicios por HTTPS. Dos tarjetas de Servicios y navegación presentes, sin desbordamiento en escritorio.
- ZIP de instalación retirado del directorio público. Paquete: `release/kuwago-pwa-25ecb79.zip`; respaldo: `release/backup-before-pwa-25ecb79/`; registro: `release/kuwago-pwa-25ecb79-deploy.json`.
- Pendiente: panel Application de Chrome, instalación en Android/iOS físicos y una futura prueba de actualización con la app instalada. No se afirma haber instalado la app en un dispositivo real.

## Procedimiento de publicación y pruebas finales

1. Publicar el contenido de dist incluyendo `.htaccess`, `/manifest.webmanifest`, `/sw.js`, `/assets/js/pwa.js` y los cuatro iconos. Conservar respaldo. Invalidar la caché del hosting si sigue mostrando el HTML anterior.
2. Confirmar desde HTTPS real que ambos HTML enlazan el mismo manifest, sus iconos son PNG válidos sin errores y `scope`/`start_url` siguen en el dominio canónico. Verificar que Hostinger/CDN respeta MIME y revalidación; la prueba local no ejecuta Apache ni verifica sus directivas.
3. En Chrome de escritorio, abrir DevTools → Application → Manifest: comprobar nombre, iconos, máscara segura, colores, display y advertencias de instalación. En Service Workers comprobar `/sw.js`, scope `/`, estado activated/running y actualización. En Cache Storage confirmar que este worker no crea cachés. Consultar Console/Network si hay errores.
4. Probar instalación y apertura standalone en Chrome Android y Safari iOS reales. Registrar modelo, versión de SO/navegador y resultado. Verificar navegación interna, tema, idioma y vuelta a la app después de abrir un enlace externo.
5. Publicar posteriormente un cambio de prueba autorizado, recargar y comprobar que se recibe sin copias viejas del Service Worker. Sin conexión es esperado que el contenido no cargue; no se ha prometido offline.

## Prueba desde Chrome Android

Después del deploy autorizado:

1. Abrir `https://grupokuwago.com/` directamente en Chrome, fuera del navegador interno de WhatsApp/Instagram y fuera de incógnito.
2. Esperar a que cargue. Abrir el menú ⋮ y seleccionar **Instalar aplicación** o **Añadir a pantalla de inicio** y la opción de instalar, según la versión de Chrome. La disponibilidad y el texto final dependen del navegador; no se añade un aviso propio.
3. Confirmar el nombre Kuwago/Grupo Kuwago y el búho. Instalar manualmente y abrir desde el icono del dispositivo.
4. Comprobar que inicia en la landing y se abre como ventana standalone, sin la barra normal de dirección. Entrar a Servicios y volver, cambiar ES/EN y tema, abrir/cerrar una galería y comprobar que los recursos cargan.

La dirección 127.0.0.1 del teléfono apunta al teléfono, no a esta computadora. El preview local de escritorio no reemplaza esta prueba en el dominio HTTPS; si se desea probar antes de producción hace falta un staging HTTPS autorizado.

## Compatibilidad esperada

- **Chrome Android y Chrome/Edge de escritorio:** instalación desde las opciones del navegador, con diferencias por versión y políticas del dispositivo. No se garantiza un banner automático.
- **iPhone/iPad:** Safari → Compartir → Añadir a pantalla de inicio; mantener «Abrir como app web» si aparece. No utiliza el flujo de promoción de instalación de Chrome. Icono Apple y metadatos preparados; prueba real pendiente.
- **Navegadores integrados:** pueden no ofrecer instalación; usar el navegador principal. Sin soporte, el sitio continúa como web normal.

Fuentes oficiales consultadas:

- [Chrome: cambios en criterios de instalación](https://developer.chrome.com/blog/update-install-criteria).
- [MDN: iconos PWA y maskable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons).
- [MDN: registro de Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register).
- [Apple: convertir un sitio en app desde Safari](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios).
