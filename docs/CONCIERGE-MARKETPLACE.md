# Concierge y Marketplace — integración local

Ruta estable: `/concierge-marketplace.html`. Activación central en `KUWAGO_PAGES.conciergeMarketplace` de `assets/js/config.js`. Header, menú móvil y footer utilizan esa configuración. La landing conserva su contenido principal.

## Referencia recibida

`../Marketplace/stitch_kuwago/` contiene portada y catálogo/carrito de escritorio, ambos en claro y oscuro. HTML y guía originales archivados en `docs/reference/marketplace/`; `assets.json` documenta las tres imágenes descargadas del export. No se recibieron diseños móviles específicos: se adaptaron las mismas composiciones a una columna.

La integración conserva portada costera, buscador superpuesto, categorías horizontales, catálogo de dos tarjetas y carrito lateral en escritorio. Reutiliza header, footer, marca, tipografías actuales, idiomas y controles institucionales. “Cómo funciona” explica el alcance actual; no es contenido comercial confirmado.

## Comportamiento

- Búsqueda por texto y filtros. Las categorías sin servicios muestran un estado vacío.
- Solo las dos fichas completas del catálogo: yoga privado al atardecer y chef privado gourmet. Datos y traducciones ES/EN en `assets/js/marketplace-data.js`.
- Detalle/opciones en diálogo nativo accesible, fecha opcional y viajeros (1–99 como límite de entrada de la interfaz, no capacidad confirmada).
- Agregar, editar y eliminar selección local, inicialmente vacía. No se incluyen ejemplos precargados ni fechas antiguas del carrito de Stitch.
- Sin persistencia al recargar, envío, reservas, cobros, impuestos calculados ni confirmaciones. El contacto dirige a la landing y no transmite el carrito.
- Precios y duraciones del export rotulados como referencia pendiente de validar. Subtotal y total “Por confirmar”. `confirmed: false` es metadato documental; cambiarlo no habilita compras ni elimina avisos.
- Página `noindex` mientras tenga datos de referencia; sin agregarla al sitemap comercial.

## Pendientes comerciales

Confirmar catálogo real, proveedores, derechos de fotografías, precios, moneda, unidades de cobro, duración, capacidad, disponibilidad, impuestos, cancelaciones y términos. Las imágenes de Stitch ilustran el diseño y no certifican un proveedor. Portales y políticas de ejemplo sin destino no se añadieron como enlaces rotos.

El export enumera seis categorías pero solo suministra dos fichas. Surf aparece únicamente como ejemplo del carrito, sin ficha completa; no se inventó como servicio adicional.

## Archivos

Página: `concierge-marketplace.html`, `assets/css/marketplace.css`, `assets/js/marketplace-data.js`, `assets/js/marketplace.js` e imágenes en `assets/images/marketplace/`.
Integración: `index.html`, `assets/js/{main,i18n,config}.js`, `assets/css/styles.css`.
Build: `tailwind.config.cjs`, CSS generado, `scripts/{page-config,build,check}.mjs`.
Referencias: `docs/reference/marketplace/`.

Verificaciones: `npm run check`, `npm run build`, `npm run test:loader`, sintaxis JS y revisión de navegador móvil/escritorio, claro/oscuro, español/inglés, carrito y navegación. La implementación inicial se revisó sin commit, push ni deploy. El usuario autorizó después commit, push y publicación de esta vista previa; el registro de despliegue se conserva en release/.
