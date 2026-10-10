import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';

const dependency = createRequire(realpathSync(new URL('../node_modules/wrangler/package.json', import.meta.url)));
export const { Miniflare, Response: WorkerResponse, convertV4MiniflareOptions } = dependency('miniflare');
const { build } = dependency('esbuild');

export async function productionWorkerModules() {
  const bundle = await build({
    entryPoints: ['CLOUDFLARE_WORKER_SEO.js'], bundle: true, write: false,
    format: 'esm', platform: 'browser', external: ['cloudflare:*'], target: 'es2022',
    plugins: [{ name: 'worker-wasm', setup(builder) {
      builder.onResolve({ filter: /@resvg\/resvg-wasm\/index_bg\.wasm$/ }, () => ({ path: './post-share-renderer.wasm', external: true }));
    } }],
  });
  return [
    { type: 'ESModule', path: 'worker.mjs', contents: bundle.outputFiles[0].text },
    { type: 'CompiledWasm', path: 'post-share-renderer.wasm', contents: readFileSync(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url)) },
  ];
}
