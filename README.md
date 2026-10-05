# Grupo Kuwago — provisional landing

Static, dependency-free project prepared from the Google Stitch export for deployment on Hostinger at `grupokuwago.com`.

## Local preview

Requires Node.js 18 or newer.

```bash
npm run dev
```

Open `http://127.0.0.1:4173`.

## Contact configuration

Edit `assets/js/config.js` before publication:

```js
window.KUWAGO_CONTACT = {
  phone: "+506XXXXXXXX",
  email: "contact@example.com",
};
```

Keep the international prefix in the phone number and do not add spaces to the `tel:` value.

## Validation and production package

```bash
npm run check
npm run build
```

The generated `dist/` directory contains the files that should be uploaded to Hostinger's `public_html` directory.

## Current external dependencies

- Tailwind CSS browser CDN
- Google Fonts: Hanken Grotesk
- Google Material Symbols

The Stitch images have already been downloaded into `assets/images/` so the public page does not depend on temporary Google image URLs.

## Reference material

- `docs/DESIGN.md`: design tokens supplied by Stitch.
- `docs/reference/screen.png`: approved visual reference.
- `docs/reference/stitch-export.html`: untouched original HTML export.
