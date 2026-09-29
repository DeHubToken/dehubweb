import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const iconRoot = path.join(process.cwd(), 'public', 'theme-icons');
const manifest = JSON.parse(await readFile(path.join(iconRoot, 'pack-manifest.json'), 'utf8'));
const selectedKeys = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const pngKeys = new Set(manifest.pngKeys);
let count = 0;

// Each complete pack owns its originals. Rebuilding never mixes rendered
// materials with tint or texture overlays from another theme's geometry.
for (const theme of manifest.themes) {
  const outputDir = path.join(iconRoot, theme);
  await mkdir(outputDir, { recursive: true });
  for (const key of manifest.keys) {
    if (selectedKeys && !selectedKeys.has(key)) continue;
    const source = path.join(iconRoot, 'sources', 'packs', theme, `${key}.png`);
    const image = sharp(source).ensureAlpha().resize(256, 256, {
      fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
    if (pngKeys.has(key)) {
      await image.png().toFile(path.join(outputDir, `${key}.png`));
    } else {
      await image.webp({ quality: 94, alphaQuality: 100 }).toFile(path.join(outputDir, `${key}.webp`));
    }
    count += 1;
  }
}
console.log(`Built ${count} icons from ${manifest.themes.length} complete original material packs.`);
