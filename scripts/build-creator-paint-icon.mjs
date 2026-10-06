import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Each palette is an original in its theme's material family. Packaging must
// preserve those originals rather than replace them with one recoloured shape.
export async function buildCreatorPaintIcons(sharp) {
  const root = path.join(process.cwd(), 'public', 'theme-icons');
  const manifest = JSON.parse(await readFile(path.join(root, 'pack-manifest.json'), 'utf8'));
  for (const theme of manifest.themes) {
    const source = path.join(root, 'sources', 'packs', theme, 'paint.png');
    await sharp(source).ensureAlpha().resize(256, 256, {
      fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 },
    }).webp({ quality: 94, alphaQuality: 100 }).toFile(path.join(root, theme, 'paint.webp'));
  }
  console.log(`Packaged original paint palettes for ${manifest.themes.length} theme families.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { default: sharp } = await import('sharp');
  await buildCreatorPaintIcons(sharp);
}
