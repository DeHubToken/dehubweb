#!/usr/bin/env node
/**
 * Render the signed-out welcome panel to static HTML for index.html.
 *
 * Why: the panel's silk plate is the LCP element of the home page, and it was
 * painted by React — after the entry chunk downloaded and ran. Lighthouse
 * mobile clocked that at 6–12 s. With the real markup in the HTML the plate
 * paints with the first frame, and React's first render simply replaces it
 * with identical DOM.
 *
 * How: esbuild bundles src/components/app/home-intro/prerender.tsx for Node
 * (react / react-dom stay external so there is one React
 * instance), the bundle is imported, and the markup is written to stdout.
 * Same pattern as generate-blog-manifest.mjs. Runs inside `vite build` from
 * prerenderHomeIntroPlugin; on any failure that plugin keeps the grey skeleton
 * card, so a broken prerender degrades the first paint instead of the build.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(ROOT, 'node_modules', '.cache', 'dehub-home-intro-prerender.mjs');
fs.mkdirSync(path.dirname(outfile), { recursive: true });

await build({
  entryPoints: [path.join(ROOT, 'src', 'components', 'app', 'home-intro', 'prerender.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  jsx: 'automatic',
  outfile,
  alias: { '@': path.join(ROOT, 'src') },
  // react / react-dom stay external so the bundle shares Node's single React
  // instance with react-dom/server; react-router-dom is bundled (its /server
  // entry has no ESM exports map for Node to resolve on its own).
  external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'],
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.MODE': '"production"',
    'import.meta.env.SSR': 'true',
  },
  // Some bundled dependencies are CommonJS and call require('react'); in an ESM
  // output esbuild routes that through a shim that throws unless a real require
  // exists, so hand it Node's.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'silent',
});

const mod = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
const html = mod.renderHomeIntroStatic();
if (typeof html !== 'string' || !html.includes('dehub-intro')) {
  throw new Error('prerender produced no panel markup');
}
process.stdout.write(html);
