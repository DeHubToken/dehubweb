// Vite's public/ copy may run before buildStart generators finish. Publish the
// sitemap and table generated during this build, regardless of hook timing.
import { copyFileSync, cpSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['seo-i18n.json', 'sitemap-static.xml']) {
  copyFileSync(resolve(root, 'public', file), resolve(root, 'dist', file));
}
// Publish the matching pointer and bounded locale generations together, even
// when Vite copied public/ before the locale generator completed.
const localeOutput = resolve(root, 'dist/locale-pages');
if (dirname(localeOutput) !== resolve(root, 'dist')) throw new Error('Invalid locale output path');
rmSync(localeOutput, { recursive: true, force: true });
cpSync(resolve(root, 'public/locale-pages'), localeOutput, { recursive: true });
