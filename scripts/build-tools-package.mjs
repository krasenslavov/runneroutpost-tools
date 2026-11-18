// Builds packages/runner-tools into packages/runner-tools/dist (ESM, CommonJS, browser bundle, types).
//   npm run tools:package        then, from packages/runner-tools: npm publish (a user step)
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const PKG = "packages/runner-tools";
rmSync(`${PKG}/dist`, { recursive: true, force: true });
mkdirSync(`${PKG}/dist`, { recursive: true });
const common = { bundle: true, tsconfig: "tsconfig.json", target: "es2022", logLevel: "warning" };
await build({
  ...common,
  entryPoints: [`${PKG}/src/index.ts`],
  format: "esm",
  platform: "node",
  outfile: `${PKG}/dist/index.js`,
});
await build({
  ...common,
  entryPoints: [`${PKG}/src/index.ts`],
  format: "cjs",
  platform: "node",
  outfile: `${PKG}/dist/index.cjs`,
});
await build({
  ...common,
  entryPoints: [`${PKG}/src/browser.ts`],
  format: "esm",
  platform: "browser",
  minify: true,
  outfile: `${PKG}/dist/browser.js`,
});

const tsc = spawnSync("npx", ["tsc", "-p", `${PKG}/tsconfig.json`], { stdio: "inherit" });
if (tsc.status !== 0) process.exit(1);
// The declaration of index.ts mentions only its own types, so that one file stands alone.
copyFileSync(".tmp-types/packages/runner-tools/src/index.d.ts", `${PKG}/dist/index.d.ts`);
rmSync(".tmp-types", { recursive: true, force: true });
const dts = readFileSync(`${PKG}/dist/index.d.ts`, "utf8");
if (/from "\.\.?\//.test(dts))
  throw new Error("dist/index.d.ts imports a repo file; it would not work once published");
writeFileSync(`${PKG}/dist/.built`, new Date().toISOString() + "\n");
console.log(`${PKG}/dist ready`);
