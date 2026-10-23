# Primer deploy de Kuwago

Fecha local: 20 de octubre de 2026, America/Costa_Rica.

## Resultado

La landing V1 se publicó en https://grupokuwago.com/ mediante la carga de un ZIP en el asistente PHP/HTML del plan Hostinger Business. Hostinger confirmó que el sitio fue creado y las comprobaciones HTTPS posteriores respondieron correctamente.

## Paquete

- Archivo local: `release/kuwago-landing-v1-2026-10-20.zip`.
- Tamaño aproximado: 188 MB; contiene las galerías completas de propiedades.
- SHA-256: `FB51FF30F422FF743B66989D7C3A3FCA748D2739E1F388511ADA00D0C69F13AE`.
- Solo contiene los archivos públicos de dist, incluida la configuración .htaccess. No contiene código fuente de configuración, dependencias npm, archivos internos de marca ni documentos de referencia.
- Sin sección de proyectos Antes/Después ni sus fotos. El trabajo de V2 queda conservado en el proyecto local.
- Incluye el loader Curiosidad de 3,5 segundos, Tailwind compilado localmente, robots.txt, sitemap.xml y metadatos de vista previa social.

## Verificaciones realizadas

- `npm run build`, `npm run check`, `npm run test:loader`, sintaxis JavaScript y `git diff --check`: correctos.
- Existencia local de las 270 fotos referenciadas en galerías y de los recursos enlazados directamente por el HTML: verificada en el paquete.
- HTTPS principal: 200.
- HTTP principal y HTTPS con www: 301 hacia https://grupokuwago.com/.
- CSS local, JavaScript del loader, SVG Curiosidad, robots.txt y sitemap.xml: 200.
- Foto de proyecto excluida y copia de referencia docs/v2-projects/index.html: 404.
- Español e inglés y temas claro y oscuro: comprobados en navegador.
- Apertura y navegación de la galería de Carabao Villa: correctas; imagen cargada con dimensiones válidas.
- Sin errores de consola en el recorrido de producción comprobado.

No se ha realizado una auditoría exhaustiva de todos los navegadores o tamaños de pantalla en este deploy.

## Servicios y próximos pasos

- El dominio sigue utilizando los nameservers de Hostinger; no se cambió a Cloudflare para este lanzamiento.
- No se crearon correos corporativos ni se modificaron registros de correo.
- Se mantienen los contactos aprobados de la landing: WhatsApp y Gmail existentes.
- No se ejecutó commit ni push. La carga directa a Hostinger fue autorizada en el chat para este primer deploy.
- Las dependencias de construcción Tailwind 3 presentan avisos de npm audit: no se distribuyen en la web estática ni se ejecutan en Hostinger. Su revisión/migración queda como mantenimiento pendiente.

## Recuperación y próximas publicaciones

Conservar el ZIP y su suma SHA-256 como referencia de esta primera versión. Antes del siguiente deploy, respaldar el contenido existente del alojamiento; generar un nuevo paquete y nombre de versión sin sobrescribir este ZIP. Para restaurar V1, cargar su contenido público en la raíz del mismo sitio y verificar HTTPS, estilos y galerías. No había una versión pública previa que recuperar.

## Coherencia de recursos entre publicaciones

El build agrega a las URLs locales de CSS y JavaScript un parámetro v derivado de SHA-256. Cuando cambia un archivo, cambia su URL y el navegador descarga la versión correspondiente aunque conserve una copia anterior durante siete días. No se modifica el diseño ni se borran preferencias. Los recursos PWA con revalidación obligatoria conservan sus URLs. Validación: npm run test:assets y comprobación responsive del paquete de dist. Esta corrección responde al logo desbordado y controles antiguos observados en dispositivos con recursos en caché.
