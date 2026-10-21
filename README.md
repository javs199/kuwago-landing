# Grupo Kuwago — provisional landing

Static landing prepared from the Google Stitch export for deployment on Hostinger at `grupokuwago.com`. Tailwind CSS is compiled locally; production needs no Node.js runtime.

## Local preview

Requires Node.js 18 or newer.

Install build dependencies with `npm ci` and generate styles with `npm run css` before the first local preview. Run `npm run css` again after changing utility classes.

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

- Google Fonts: Hanken Grotesk
- Google Material Symbols

The Stitch images have already been downloaded into `assets/images/` so the public page does not depend on temporary Google image URLs.

V1 omits Before / After projects. Their source is preserved in `docs/v2-projects/`; project images are excluded from `dist/`. Upload only `dist/`, never the source repository, brand library or internal references.

The build uses Tailwind 3 to preserve the approved visual design. Its npm audit findings affect build-time dependencies; no npm packages are shipped to the static web host. Review and migrate these dependencies as part of ongoing maintenance.

## Reference material

- `docs/DESIGN.md`: design tokens supplied by Stitch.
- `docs/reference/screen.png`: approved visual reference.
- `docs/reference/stitch-export.html`: untouched original HTML export.
