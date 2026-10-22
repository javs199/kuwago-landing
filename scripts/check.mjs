import { getConciergePage } from './page-config.mjs';
import { checkPwa } from './pwa-check.mjs';
import { existsSync, readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const requiredFiles = [
  "assets/css/styles.css",
  "assets/css/tailwind.css",
  "robots.txt",
  "sitemap.xml",
  "assets/js/config.js",
  "assets/js/footer-socials.js",
  "assets/js/main.js",
  "assets/css/loader.css",
  "assets/js/loader.js",
  "assets/images/brand/03-curiosidad.svg",
  "assets/images/brand/03-curiosidad-morado.svg",
  "assets/images/brand/kuwago-favicon.svg",
  "assets/images/brand/kuwago-isotipo-morado.svg",
  "assets/images/brand/kuwago-isotipo-dorado-plano.svg",
  "assets/fonts/libre-bodoni/LibreBodoni-Regular.ttf",
  "assets/fonts/libre-bodoni/OFL.txt",
  "assets/fonts/libre-bodoni/LibreBodoni-Bold.ttf",
  "assets/images/carabao-portada.webp",
];

const errors = [];
errors.push(...checkPwa());
try {
  const page = getConciergePage();
  if (page) {
    const pageHtml = readFileSync(page, 'utf8');
    if (/cdn\.tailwindcss\.com|https:\/\/lh3\.googleusercontent\.com/.test(pageHtml)) errors.push('Marketplace must use local CSS and images.');
    for (const [, path] of pageHtml.matchAll(/(?:src|href)="(assets\/[^"?#]+)"/g)) {
      if (!existsSync(path)) errors.push(`Marketplace asset missing: ${path}`);
    }
    for (const [, id] of pageHtml.matchAll(/href="#([^" ]+)"/g)) {
      if (!pageHtml.includes(`id="${id}"`)) errors.push(`Marketplace fragment missing: ${id}`);
    }
  }
} catch (error) { errors.push(error.message); }
if (html.includes("cdn.tailwindcss.com")) errors.push("Production must use compiled local Tailwind CSS.");
for (const file of requiredFiles) {
  if (!existsSync(file)) errors.push(`Missing required file: ${file}`);
}

if (/https:\/\/lh3\.googleusercontent\.com/.test(html)) {
  errors.push("Remote Stitch image URLs are still present.");
}

if (!html.includes("grupokuwago.com")) {
  errors.push("Confirmed domain is missing from index.html.");
}

if (/id="projects-section"|data-project-id=|id="project-details-modal"/.test(html)) {
  errors.push("V1 must not include the Before / After project section or its dialog.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const pending = [];
if (!html.includes("https://wa.me/50689883466")) pending.push("WhatsApp link");
if (!html.includes("mailto:grupokuwago@gmail.com")) pending.push("email address");

console.log("Static project checks passed.");
if (pending.length) {
  console.log(`Pending before publication: ${pending.join(" and ")}.`);
} else {
  console.log("All contact destinations are correctly configured.");
}
