import { existsSync, readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const requiredFiles = [
  "assets/css/styles.css",
  "assets/js/config.js",
  "assets/js/main.js",
  "assets/images/logo.jpg",
  "assets/images/hero.jpg",
];

const errors = [];
for (const file of requiredFiles) {
  if (!existsSync(file)) errors.push(`Missing required file: ${file}`);
}

if (/https:\/\/lh3\.googleusercontent\.com/.test(html)) {
  errors.push("Remote Stitch image URLs are still present.");
}

if (!html.includes("grupokuwago.com")) {
  errors.push("Confirmed domain is missing from index.html.");
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
