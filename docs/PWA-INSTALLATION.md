# Instalación personalizada de Kuwago

Estado: implementación local, sin commit, push ni deploy. Se parte de la PWA publicada en 25ecb79, con documentación en 397da0c. El usuario informó que la instalación base funciona en un Android; no se considera una prueba del nuevo componente en ese dispositivo.

## Auditoría y alcance

Se conservaron sin cambios el manifest (nombre, identidad, scope, standalone y colores), los cuatro iconos y el Service Worker network only. `assets/js/pwa.js` sigue registrando el worker como antes. Las dos páginas añaden únicamente una hoja de estilos y dos scripts diferidos al head. La interfaz se genera una vez por documento, reutilizando isotipos oficiales morado/dorado, temas y diccionarios ES/EN.

## Comportamiento

- Banner inferior automático al cargar el documento en un navegador con guía compatible o evento nativo disponible, sin esperar beforeinstallprompt ni robar foco. Se reserva espacio al final del documento, incluyendo el safe area. Se oculta temporalmente al abrir menús, diálogos o galerías y cuando están visibles propiedades, contacto o controles de servicios/carrito; vuelve al salir si no se descartó.
- En navegadores con `beforeinstallprompt`, se guarda el evento real y se cancela su promoción automática. `prompt()` se llama una sola vez por evento, sin esperas previas, exclusivamente desde la activación real de un botón. Una inicialización repetida no duplica el banner ni sus listeners.
- Chrome/Edge reconocidos muestran el banner aunque no entreguen evento nativo. El evento controla únicamente la posibilidad de lanzar prompt(); sin él, el botón abre instrucciones manuales.
- En Safari iOS/iPadOS y los navegadores iOS reconocidos se ofrece una guía manual. Desde otro navegador iOS se indica primero abrir el sitio en Safari. iPadOS con identificación de escritorio se reconoce por MacIntel y soporte multitáctil. Los tablets Android en modo escritorio usan la plataforma de User Agent Client Hints cuando está disponible.
- Navegadores integrados identificables y navegadores desconocidos no reciben pasos adivinados. Un evento real del navegador sigue permitiendo instalación directa aunque no se reconozca su marca.
- «Instalar aplicación» abre el diálogo nativo o la guía correspondiente. «Ahora no» oculta el banner durante la visita actual. Leer la guía también lo oculta durante esa visita; cerrarla nunca confirma instalación.
- «Instalar Kuwago» está en el menú móvil y la navegación del footer, disponible incluso durante el aplazamiento. No se añadió otra entrada larga al header de escritorio.
- Si el usuario rechaza el diálogo nativo, el evento se consume y se oculta el banner durante la visita. Si acepta, se oculta la oferta durante la visita, **sin marcar instalación completada**. `appinstalled` real o ejecución standalone ocultan la interfaz. Un fallo muestra ayuda y nunca éxito ficticio.
- Se escucha cambio de display-mode, pageshow e idioma. La guía usa dialog nativo (foco, Escape, contenido de fondo inerte), botones de al menos 44 px, etiquetas ES/EN y foco visible.

## Preferencias y límites de detección

La clave `kuwago-pwa-install-visit-v1` de sessionStorage guarda únicamente `{dismissed: true}` durante la visita, sin identidad ni datos comerciales. Una entrada directa o desde otro origen inicia otra visita; navegación interna, recargas e historial conservan la elección. No se escribe ni consulta localStorage para rechazos o indicios de instalación. Las antiguas preferencias persistentes del instalador se ignoran. No se modifica la preferencia existente de tema/idioma.

Un sitio web no dispone de una detección universal de todas sus instalaciones en otros navegadores, perfiles o desde una pestaña normal de Safari. Standalone evita mostrar la oferta dentro de la app, pero no garantiza conocer una instalación al visitar después la web en Safari. La ausencia de `beforeinstallprompt` tampoco demuestra que la app esté instalada. Si el almacenamiento está bloqueado, la elección se respeta en memoria para ese documento, pero no puede garantizarse entre recargas.

La guía explica que un acceso directo no equivale necesariamente a una app independiente. No hay botón «Ya la instalé», no se genera un evento de instalación y no se muestra un mensaje de éxito por leer los pasos. La app continúa requiriendo conexión; no se modificó su política de caché.

## Compatibilidad prevista

| Navegador/dispositivo | Oferta directa | Alternativa sin evento |
| --- | --- | --- |
| Chrome Android, teléfono/tablet | Sí, si entrega beforeinstallprompt | Menú de Chrome; distinguir Instalar de acceso directo |
| Chrome/Edge de escritorio | Sí, si entrega beforeinstallprompt | Guía del menú correspondiente; texto puede variar por versión/políticas |
| Safari iPhone/iPad | Sin API de prompt equivalente | Compartir → Añadir a pantalla de inicio; Abrir como app web si aparece |
| Chrome/Edge/Firefox en iOS reconocidos | Depende de la plataforma; no se presupone API | Abrir en Safari y seguir la guía de Safari |
| Firefox Android | No se presupone beforeinstallprompt | Guía del menú con advertencia explícita sobre accesos directos |
| Navegador integrado o desconocido | Solo ante un evento real disponible | Sin instrucciones de menú específicas adivinadas |

La instalación Android puede variar según servicios de Google, fabricante, navegador, restricciones del dispositivo y elegibilidad. La web no promete un APK/WebAPK ni certifica la creación de una app nativa.

## Validación realizada

- `npm run check`, `npm run build`, `npm run test:pwa` (24 pruebas: 8 de base y 16 del nuevo flujo), `npm run test:loader` y sintaxis JS.
- Pruebas de lógica y controlador con eventos/DOM simulados: plataformas objetivo, dispositivos con UA de escritorio, ausencia de API, rechazo, aceptación sin confirmar instalación, appinstalled, standalone, errores, descarte por visita, nueva entrada directa, recarga/navegación interna, protección de zonas importantes, duplicados e interacción de usuario requerida. **No son instalaciones reales en Android, iOS ni Edge.**
- Revisión visual y de teclado del componente local en el navegador integrado, con idiomas ES/EN, claro/oscuro, móvil y escritorio. El flujo manual real de Chrome abre el dialog accesible sin provocar una instalación.
- Comprobación real local de aparición sin evento nativo, descarte conservado tras recarga, reaparición tras entrada directa y ocultación/restauración al abrir/cerrar menú móvil y entrar/salir de propiedades. Sin desbordamiento horizontal a 375 px.
- Una fixture visual iOS rotulada como simulación se guarda bajo release/ (ignorada por Git y fuera de dist). Renderiza el mismo componente con un perfil manual simulado; no cambia la detección del producto ni dispara eventos de instalación.

Pendiente: probar la experiencia nueva en Chrome Android/tablets, Safari iOS/iPadOS, Chrome y Edge de escritorio reales, incluyendo completar/rechazar el diálogo nativo y abrir la app instalada. No se realizó ninguna instalación real adicional durante esta implementación.

Cuando un dispositivo táctil se identifica como Linux de escritorio y no permite distinguir un tablet Android de un ordenador, Chrome recibe instrucciones comunes, sin asumir un menú específico de escritorio. Si Edge resulta ambiguo, se espera un evento real en vez de adivinar pasos.

## Archivos

- Nuevos: `assets/js/pwa-install-state.js`, `assets/js/pwa-install.js`, `assets/css/pwa-install.css`, `scripts/test-pwa-install.mjs` y este documento.
- Modificados: `index.html`, `concierge-marketplace.html`, `assets/js/i18n.js`, `scripts/pwa-check.mjs`, `package.json`, `.htaccess` y `docs/PWA.md`; `assets/css/tailwind.css` regenerado por el build.
- `.htaccess` incorpora revalidación para los scripts y CSS del instalador, evitando que una futura publicación conserve versiones antiguas. La comprobación de esas cabeceras en Hostinger requiere un deploy autorizado.

Vista normal local: http://127.0.0.1:4174/. En Chrome sin evento disponible, el banner aparece automáticamente y abre la guía; el footer y el menú móvil permiten reabrirla tras descartarlo.

## Fuentes oficiales

- [MDN: promover la instalación y beforeinstallprompt](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt).
- [Google: aplicaciones web en Android y tablets](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid).
- [Google: aplicaciones web de escritorio](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DDesktop).
- [Microsoft: instalación de aplicaciones en Edge](https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge).
- [Apple: añadir una app web desde Safari](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios).
- [Mozilla: aplicaciones web en Android](https://support.mozilla.org/en-US/kb/use-web-apps-firefox-android).

## Publicación del instalador — 22 de octubre de 2026

Publicado con autorización del usuario en Hostinger. Se versionó la URL de i18n.js en ambas páginas para que las traducciones nuevas no dependan de una copia anterior con caché de siete días. Se conserva el manifest y el Service Worker. Paquete y respaldo bajo release/; ver registro kuwago-install-9f8b21b-deploy.json.
