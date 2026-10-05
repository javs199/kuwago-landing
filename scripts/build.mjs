import { cpSync, mkdirSync, rmSync } from "node:fs";

const output = "dist";
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

cpSync("index.html", `${output}/index.html`);
cpSync("assets", `${output}/assets`, { recursive: true });
cpSync(".htaccess", `${output}/.htaccess`);

console.log("Production files created in dist/.");
