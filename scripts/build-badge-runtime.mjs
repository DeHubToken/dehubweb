import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.argv[2] || 'badge-runtime/index.html');
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/components/app/badge-showcase/badge-runtime.ts'],
  bundle: true, minify: true, format: 'iife', target: 'es2020', write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
});
const js = result.outputFiles[0].text;
if (js.includes('</script')) throw new Error('Unsafe inline script');
const template = readFileSync(resolve(root, 'scripts/badge-runtime.html'), 'utf8');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, template.replace('/*BUNDLE*/', () => js));
console.log(`Wrote ${output}`);
