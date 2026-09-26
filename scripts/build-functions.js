// Bundles the API and all its npm dependencies into one self-contained file for Netlify.
// Run automatically on Netlify (see netlify.toml) or manually with `npm run build`.
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');

esbuild.buildSync({
  entryPoints: [path.join(root, 'netlify/src/api-entry.mjs')],
  outfile: path.join(root, 'netlify/dist/api-bundle.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // Bundled CommonJS packages (express) call require() for Node built-ins
  banner: { js: "import { createRequire as __athloraCreateRequire } from 'module'; const require = __athloraCreateRequire(import.meta.url);" },
  logLevel: 'warning',
});

console.log('Built netlify/dist/api-bundle.mjs');
