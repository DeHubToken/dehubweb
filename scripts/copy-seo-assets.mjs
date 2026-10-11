// Vite's public/ copy may run before buildStart generators finish. Publish the
// sitemap and table generated during this build, regardless of hook timing.
import { copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['seo-i18n.json', 'sitemap-static.xml']) {
  copyFileSync(resolve(root, 'public', file), resolve(root, 'dist', file));
}
