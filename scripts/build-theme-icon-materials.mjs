import { readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const sourceDir = path.join(root, 'public', 'theme-icons', 'system');
const materialDir = path.join(root, 'public', 'theme-icons', 'materials');

const themes = {
  cosmic: {
    material: 'cosmic.webp',
    base: { brightness: 1.05, saturation: 1.35, hue: 220 },
    materialOpacity: 0.42,
    blend: 'over',
  },
  lavalamp: {
    material: 'lavalamp.webp',
    base: { brightness: 0.73, saturation: 1.55, hue: 338 },
    materialOpacity: 0.72,
    blend: 'over',
  },
  light: {
    material: 'light.webp',
    base: { brightness: 1.04, saturation: 0.2 },
    materialOpacity: 0.48,
    blend: 'over',
  },
  minimal: {
    base: { brightness: 0.98, saturation: 0 },
  },
};

const icons = (await readdir(sourceDir)).filter((name) => name.endsWith('.webp'));

for (const [theme, treatment] of Object.entries(themes)) {
  const outputDir = path.join(root, 'public', 'theme-icons', theme);
  await mkdir(outputDir, { recursive: true });

  for (const icon of icons) {
    const input = path.join(sourceDir, icon);
    const output = path.join(outputDir, icon);
    const base = sharp(input).ensureAlpha().modulate(treatment.base);

    if (!treatment.material) {
      await base.webp({ quality: 92, alphaQuality: 100 }).toFile(output);
      continue;
    }

    const { data: alpha, info } = await sharp(input)
      .ensureAlpha()
      .extractChannel(3)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data: texture } = await sharp(path.join(materialDir, treatment.material))
      .resize(info.width, info.height, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rgba = Buffer.alloc(info.width * info.height * 4);
    for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
      rgba[pixel * 4] = texture[pixel * 3];
      rgba[pixel * 4 + 1] = texture[pixel * 3 + 1];
      rgba[pixel * 4 + 2] = texture[pixel * 3 + 2];
      rgba[pixel * 4 + 3] = Math.round(alpha[pixel] * treatment.materialOpacity);
    }
    const material = await sharp(rgba, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .webp({ quality: 92, alphaQuality: 100 })
      .toBuffer();

    await base
      .composite([{ input: material, blend: treatment.blend }])
      .webp({ quality: 92, alphaQuality: 100 })
      .toFile(output);
  }
}

console.log(`Built ${icons.length} semantic icons for ${Object.keys(themes).join(', ')}.`);
