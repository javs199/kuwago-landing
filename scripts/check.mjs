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
const config = readFileSync("assets/js/config.js", "utf8");
if (/phone:\s*""/.test(config)) pending.push("phone number");
if (/email:\s*""/.test(config)) pending.push("email address");

console.log("Static project checks passed.");
if (pending.length) console.log(`Pending before publication: ${pending.join(" and ")}.`);
