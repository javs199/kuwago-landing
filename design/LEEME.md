# design/ — referencia visual (Google Stitch)

Una carpeta por pantalla, numerada en el orden del flujo del usuario:

```
design/
  01-inicio/
    captura.png      ← export de imagen de Stitch (obligatoria)
    codigo.html      ← "Export code" de Stitch (HTML + Tailwind), opcional
    notas.md         ← opcional: estados, interacciones, qué NO es definitivo
  02-catalogo/
  ...
```

Reglas:
- La captura manda; el HTML de Stitch es pista de estructura, no código de producción.
- Si rediseñas una pantalla, reemplaza sus archivos (git guarda la versión anterior) y avisa en la spec afectada.
- Las fuentes y colores de la marca del proyecto (los del cliente, en sus tokens) ganan sobre lo que haya puesto Stitch.
