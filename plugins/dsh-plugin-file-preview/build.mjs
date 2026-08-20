/**
 * Build the browser half of dsh-plugin-file-preview.
 *
 * Produces lib/client.js in the dsh module-table bundle format:
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ...cjs... } })
 *
 * esbuild compiles src/client.tsx to a CJS body; every @deepseek-ai/* and
 * react import stays external (module-table edges), everything else is
 * bundled. Run with: node build.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "lib");
const bodyPath = join(outDir, ".client.body.js");
const bundlePath = join(outDir, "client.js");
const PKG_NAME = "dsh-plugin-file-preview";

mkdirSync(outDir, { recursive: true });
rmSync(bodyPath, { force: true });

const args = [
  "--yes",
  "esbuild@0.25.0",
  "src/client.tsx",
  "--bundle",
  "--format=cjs",
  "--jsx=automatic",
  "--target=es2020",
  "--minify-syntax",
  "--external:react",
  "--external:react/*",
  "--external:@deepseek-ai/*",
  "--outfile=" + bodyPath,
  "--log-level=warning",
];
console.log("[build] npx " + args.join(" "));
execFileSync("npx", args, { cwd: root, stdio: "inherit" });

const body = readFileSync(bodyPath, "utf8").trimEnd();
const wrapped =
  `window.__ModuleLoader__.load({\n` +
  `\tid: ${JSON.stringify(PKG_NAME)},\n` +
  `\tfactory: (require) => {\n` +
  `\t\tvar module = { exports: {} };\n` +
  `\t\tvar exports = module.exports;\n` +
  `\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n` +
  body +
  `\n\t\treturn module.exports;\n` +
  `\t}\n});\n`;

writeFileSync(bundlePath, wrapped);
rmSync(bodyPath, { force: true });
console.log("[build] wrote " + bundlePath + " (" + wrapped.length + " bytes)");
