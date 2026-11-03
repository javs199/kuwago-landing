# Guía Carabao: publicación independiente

27 de octubre de 2026, 17:17 Costa Rica.

URL: **https://grupokuwago.com/menu/**. La variante `/menu` redirige 301 a `/menu/`.

Se publicó únicamente una carpeta nueva `public_html/menu` en Hostinger, sin reemplazar archivos existentes de la landing ni añadir navegación hacia ella. No se modificaron Admin/API, Cloudflare, D1, Access, DNS ni correos.

Fuente original: `C:\Users\JV\Desktop\Kuwago Landing\Menu`.

El usuario autorizó expresamente publicar la guía completa, incluida la contraseña de Wi-Fi, después de advertir que la URL carece de autenticación. Este informe no reproduce credenciales. El contenido original permanece intacto.

Se añadieron a la copia de publicación meta robots y cabecera `X-Robots-Tag: noindex, nofollow, noarchive`, además de impedir el listado de directorios. Es una petición de no indexación a buscadores, **no un control de acceso**. Cualquiera con la URL puede consultarla o compartirla.

Contenido subido: `index.html`, `carabao-welcome.css`, `img/` y `.htaccess` propios. No se subieron el PDF original ni los ZIP de trabajo dentro del directorio público. El paquete de transporte se conserva fuera de `public_html`.

Paquete local: `release/kuwago-menu-20261027T231458-full.zip`, 274 entradas, todas bajo `menu/`. La copia inicial sin contraseña no se extrajo ni se publicó; la publicación final corresponde al paquete completo autorizado.

Verificación HTTPS:

- Página, CSS y portada: 200.
- **269 recursos locales comprobados**, ninguno falló.
- Todas las anclas internas apuntan a IDs existentes.
- HTML publicado coincide byte por byte con la copia preparada: SHA-256 `8cbb9c33700b4a449468fcabbf9224619c2bde3b601e3e648b6384b436e138bf`.
- Cabecera noindex comprobada remotamente y meta robots comprobada en navegador.
- Portada cargada en navegador; no hay desbordamiento horizontal a 1280 px.
- Landing principal idéntica antes/después: SHA-256 `68a6b9a969ca9dec05891d30d679c326f9eda5433b8136128dececb890c22caf`.

El paquete independiente no forma parte todavía del build de la landing. En futuras publicaciones completas se debe conservar `public_html/menu` o incorporar explícitamente esta página al paquete; no eliminarla por sincronización de carpetas.

Evidencias locales: `release/menu-publication-plan.json`, `release/menu-publication-result.json`, `release/menu-publication.png`. Sin commit ni push.
