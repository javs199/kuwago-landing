import { getConciergePage } from './page-config.mjs';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, sep, join } from "node:path";
import { versionAssets, versionModuleImports } from './asset-versioning.mjs';

const conciergePage = getConciergePage();
const output = "dist";
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

// Trial fonts are licensed for internal evaluation only. Never export preview links.
const html = readFileSync("index.html", "utf8").replace(/<link\b[^>]*\bdata-preview-only[^>]*>\s*/g, "");
writeFileSync(`${output}/index.html`, versionAssets(html));
if (conciergePage) {
  const pageHtml = readFileSync(conciergePage, "utf8").replace(/<link\b[^>]*\bdata-preview-only[^>]*>\s*/g, "");
  writeFileSync(`${output}/${conciergePage}`, versionAssets(pageHtml));
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
// Version every static ESM dependency, including shared validators, as well as HTML entries.
function versionModules(directory) {
  for (const entry of readdirSync(directory,{withFileTypes:true})) {
    const path = join(directory,entry.name);
    if (entry.isDirectory()) versionModules(path);
    else if (entry.name.endsWith('.js')) writeFileSync(join(output,path),versionModuleImports(readFileSync(path,'utf8'),path));
  }
}
versionModules('assets/js');
cpSync(".htaccess", `${output}/.htaccess`);
cpSync("robots.txt", `${output}/robots.txt`);
cpSync("sitemap.xml", `${output}/sitemap.xml`);
cpSync("manifest.webmanifest", `${output}/manifest.webmanifest`);
cpSync("sw.js", `${output}/sw.js`);

console.log("Production files created in dist/.");
