import { getConciergePage } from './page-config.mjs';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const conciergePage = getConciergePage();
const output = "dist";
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

// Trial fonts are licensed for internal evaluation only. Never export preview links.
const html = readFileSync("index.html", "utf8").replace(/<link\b[^>]*\bdata-preview-only[^>]*>\s*/g, "");
writeFileSync(`${output}/index.html`, html);
if (conciergePage) {
  const pageHtml = readFileSync(conciergePage, "utf8").replace(/<link\b[^>]*\bdata-preview-only[^>]*>\s*/g, "");
  writeFileSync(`${output}/${conciergePage}`, pageHtml);
}
// V1 omits project photos; keep source assets available for V2.
const projectImages = resolve("assets/images/projects");
cpSync("assets", `${output}/assets`, {
  recursive: true,
  filter: source => {
    const absolute = resolve(source);
    return absolute !== projectImages && !absolute.startsWith(`${projectImages}${sep}`);
  },
});
cpSync(".htaccess", `${output}/.htaccess`);
cpSync("robots.txt", `${output}/robots.txt`);
cpSync("sitemap.xml", `${output}/sitemap.xml`);

console.log("Production files created in dist/.");
