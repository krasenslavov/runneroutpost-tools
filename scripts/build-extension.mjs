// Builds the RunnerOutpost browser extension into extension/dist/: a zip for Chrome and Edge and one for Firefox.
//   npm run tools:extension
// The popup bundles packages/runner-tools (no minification, so a reviewer can read it) and asks for no
// permissions. It needs `zip` on the PATH.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const SRC = "extension/src";
const DIST = "extension/dist";
const manifest = JSON.parse(readFileSync(`${SRC}/manifest.json`, "utf8"));
const version = manifest.version;
rmSync(DIST, { recursive: true, force: true });

for (const target of ["chrome", "firefox"]) {
  const dir = `${DIST}/${target}`;
  mkdirSync(`${dir}/icons`, { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    await sharp("public/icons/icon-512.png")
      .resize(size, size)
      .png()
      .toFile(`${dir}/icons/icon-${size}.png`);
  }
  for (const f of ["popup.html", "popup.css"]) copyFileSync(`${SRC}/${f}`, `${dir}/${f}`);
  await build({
    entryPoints: [`${SRC}/popup.js`],
    bundle: true,
    format: "iife",
    target: "es2020",
    tsconfig: "tsconfig.json",
    outfile: `${dir}/popup.js`,
    logLevel: "warning",
  });
  const m = structuredClone(manifest);
  if (target === "firefox") {
    m.browser_specific_settings = {
      gecko: {
        id: "group-run-tools@runneroutpost.com",
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      },
      gecko_android: { strict_min_version: "142.0" },
    };
  }
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(m, null, 2) + "\n");
  execFileSync("zip", ["-qr", `../runneroutpost-group-run-tools-${target}-${version}.zip`, "."], {
    cwd: dir,
  });
}
console.log(`Built ${DIST}: chrome and firefox zips (${version})`);
