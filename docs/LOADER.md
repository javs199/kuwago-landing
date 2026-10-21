# Loader de Kuwago

Vista previa local continua: `http://127.0.0.1:4173/docs/loader-preview.html`. Permite revisar ambos temas sin prolongar artificialmente la carga real del sitio. La carpeta docs no se incluye en dist.

Se utiliza la propuesta vectorial original **Curiosidad**: inclinación de cabeza de 2,2 grados y doble parpadeo, sin respiración. Los tres tiempos SMIL (dos ojos y cabeza) se redujeron juntos de 6,4 a **3,5 segundos**; los contornos y los tiempos relativos de los gestos se conservaron.

Los SVG web están en `assets/images/brand/`. El tema claro utiliza morado y marfil; el oscuro utiliza dorado y tinta. Los SVG incluyen una alternativa estática para `prefers-reduced-motion`.

La pantalla se muestra durante la carga del documento y se retira al recibir `window.load`, con una salida de 200 ms. No se fuerza una espera de 3,5 segundos: ese valor es el ciclo de la animación. Existe un límite de seguridad de 8 segundos para recursos bloqueados y tratamiento de restauración desde la caché de navegación. El mecanismo es independiente del JavaScript principal y de Tailwind. Sin JavaScript, el loader permanece oculto y la página sigue disponible.

La fuente se recuperó de la entrega original del otro chat:

`C:/Users/JV/Documents/Codex/2026-10-19/referenced-chatgpt-conversation-this-is-an/outputs/KUWAGO-Loaders-Parpadeo/svg/`

Se conservaron copias de las dos variantes originales de 6,4 segundos en `../recursos-marca/03-loaders/parpadeo/svg/`, fuera del paquete web. No se modificaron los originales ni los documentos de Affinity. Las otras variantes del paquete siguen pendientes de incorporación a la biblioteca.
