# Identidad web

SVG originales del brandkit integrados en cabecera, pie y favicon.

## Vista tipográfica local

- TT Ramillas Trial Regular, Medium y Bold desde Tipografias/tt_ramillas. Su licencia permite evaluación interna y prohíbe páginas públicamente accesibles sin consentimiento escrito.
- Helvetica Neue instalada se consulta mediante local(); no se redistribuyen sus archivos. Si no está instalada en otro equipo, se usa Helvetica/Arial. La versión web definitiva queda por confirmar.
- preview/typography.css contiene la configuración de evaluación. El build elimina enlaces data-preview-only y no copia preview/ a dist. Por tanto el paquete de producción conserva las fuentes previas hasta recibir las licencias/archivos definitivos.
- Bodoni Moda fue aprobada por el usuario para reemplazar Didona en KUWAGO. Se usa el archivo Regular de 48 pt, alojado en assets/fonts/bodoni-moda junto con su licencia OFL. La palabra es texto accesible acompañado por el isotipo SVG original, con variantes morada y dorada para ambos temas. Se conserva intacta la biblioteca original de marca. Esta fuente y el logotipo sí forman parte del build de producción.

No se desplegó esta revisión.

## Clonar y revisar

Los binarios Trial de preview/fonts están excluidos de Git. Para reproducir la evaluación interna, copiar TT Ramillas Trial Regular.ttf, Medium.ttf y Bold.ttf desde la biblioteca privada a preview/fonts/tt-ramillas-trial-regular.ttf, tt-ramillas-trial-medium.ttf y tt-ramillas-trial-bold.ttf. Sin ellos se utiliza el fallback de la vista previa. No publicar la carpeta preview.
