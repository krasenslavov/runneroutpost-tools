# Build steps

1. Node 18 or newer.
2. `npm install`.
3. `npm run build:extension` writes extension/dist/firefox and chrome. `npm test` runs the package tests, `npm run build:package` builds the npm package.

The popup bundles packages/runner-tools with esbuild, unminified. It makes no network calls and asks for no permissions.
