import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const iconRoot = path.join(root, 'public', 'theme-icons');
const systemDir = path.join(iconRoot, 'system');
const materialDir = path.join(iconRoot, 'materials');

const materialThemes = {
  cosmic: {
    material: path.join(materialDir, 'cosmic.webp'),
    base: { brightness: 1.05, saturation: 1.35, hue: 220 },
    materialOpacity: 0.42,
  },
  lavalamp: {
    material: path.join(materialDir, 'lavalamp.webp'),
    base: { brightness: 0.73, saturation: 1.55, hue: 338 },
    materialOpacity: 0.72,
  },
  light: {
    material: path.join(materialDir, 'light.webp'),
    base: { brightness: 1.04, saturation: 0.2 },
    materialOpacity: 0.48,
  },
  minimal: {
    base: { brightness: 0.98, saturation: 0 },
  },
};

const nativeThemeTreatments = {
  hazy: { backdrop: '#352456', base: { brightness: 0.82, saturation: 1.25 }, materialOpacity: 0.72 },
  swarms: { backdrop: '#07375c', base: { brightness: 0.86, saturation: 1.4 }, materialOpacity: 0.74 },
  winter: { backdrop: '#8bcfe5', base: { brightness: 1.08, saturation: 0.75 }, materialOpacity: 0.7 },
  osaka: { backdrop: '#467d7e', base: { brightness: 0.98, saturation: 0.65 }, materialOpacity: 0.7 },
  jungle: { backdrop: '#4b2c18', base: { brightness: 0.72, saturation: 1.15 }, materialOpacity: 0.76 },
};

const identitySources = {
  superpowers: {
    path: path.join(iconRoot, 'sources', 'superpowers-electric.png'),
    removeChromaBackdrop: true,
  },
  staking: { path: path.join(root, 'public', 'brand-kit', 'icons', 'vault.png') },
  bridge: { path: path.join(root, 'public', 'brand-kit', 'icons', 'chain.png') },
  buy: { path: path.join(root, 'public', 'brand-kit', 'icons', 'coin-bag.png') },
};

const themeIdentitySources = {
  dao: Object.fromEntries(
    ['system', 'light', 'minimal', 'cosmic', 'hazy', 'jungle', 'lavalamp', 'osaka', 'swarms', 'winter']
      .map((theme) => [theme, {
        path: path.join(iconRoot, 'sources', `dao-${theme}.png`),
        preserveCanvas: true,
      }]),
  ),
};

async function removeChromaBackdrop(input) {
  const { data, info } = await sharp(input)
    .resize(224, 224, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  const mask = Buffer.alloc(pixels);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 3;
    const greenDominance = data[offset + 1] - Math.max(data[offset], data[offset + 2]);
    mask[pixel] = Math.max(0, Math.min(255, 255 - (greenDominance - 18) * 5));
  }
  const softenedMask = await sharp(mask, {
    raw: { width: info.width, height: info.height, channels: 1 },
  }).blur(0.65).extractChannel(0).raw().toBuffer();
  const rgba = Buffer.alloc(pixels * 4);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    rgba[pixel * 4] = data[pixel * 3];
    rgba[pixel * 4 + 1] = data[pixel * 3 + 1];
    rgba[pixel * 4 + 2] = data[pixel * 3 + 2];
    rgba[pixel * 4 + 3] = softenedMask[pixel];
  }

  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extend({ top: 16, bottom: 16, left: 16, right: 16, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function normalizeIdentity(source) {
  if (source.removeChromaBackdrop) return removeChromaBackdrop(source.path);
  if (source.preserveCanvas) {
    return sharp(source.path)
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }
  return sharp(source.path)
    .resize(224, 224, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 16, bottom: 16, left: 16, right: 16, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function writeThemeIdentitySources(theme, outputDir) {
  for (const [key, sources] of Object.entries(themeIdentitySources)) {
    const source = sources[theme];
    if (!source) continue;
    const normalized = await normalizeIdentity(source);
    await sharp(normalized)
      .webp({ quality: 94, alphaQuality: 100 })
      .toFile(path.join(outputDir, `${key}.webp`));
  }
}

async function applyTreatment(input, output, treatment) {
  const base = sharp(input).ensureAlpha().modulate(treatment.base);
  if (!treatment.material) {
    await base.webp({ quality: 92, alphaQuality: 100 }).toFile(output);
    return;
  }

  const { data: alpha, info } = await sharp(input)
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const texturePipeline = sharp(treatment.material).resize(info.width, info.height, { fit: 'cover' });
  if (treatment.backdrop) texturePipeline.flatten({ background: treatment.backdrop }).blur(7);
  const { data: texture } = await texturePipeline.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    rgba[pixel * 4] = texture[pixel * 3];
    rgba[pixel * 4 + 1] = texture[pixel * 3 + 1];
    rgba[pixel * 4 + 2] = texture[pixel * 3 + 2];
    rgba[pixel * 4 + 3] = Math.round(alpha[pixel] * treatment.materialOpacity);
  }
  const material = await sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).webp({ quality: 92, alphaQuality: 100 }).toBuffer();

  await base
    .composite([{ input: material, blend: 'over' }])
    .webp({ quality: 92, alphaQuality: 100 })
    .toFile(output);
}

await mkdir(systemDir, { recursive: true });
for (const [key, source] of Object.entries(identitySources)) {
  const normalized = await normalizeIdentity(source);
  await sharp(normalized).webp({ quality: 94, alphaQuality: 100 }).toFile(path.join(systemDir, `${key}.webp`));
}
await writeThemeIdentitySources('system', systemDir);

const icons = (await readdir(systemDir)).filter((name) => name.endsWith('.webp'));
for (const [theme, treatment] of Object.entries(materialThemes)) {
  const outputDir = path.join(iconRoot, theme);
  await mkdir(outputDir, { recursive: true });
  for (const icon of icons) {
    const key = path.parse(icon).name;
    if (themeIdentitySources[key]?.[theme]) continue;
    await applyTreatment(path.join(systemDir, icon), path.join(outputDir, icon), treatment);
  }
  await writeThemeIdentitySources(theme, outputDir);
}

for (const [theme, treatment] of Object.entries(nativeThemeTreatments)) {
  const outputDir = path.join(iconRoot, theme);
  const material = path.join(outputDir, 'wand.webp');
  for (const key of Object.keys(identitySources)) {
    await applyTreatment(
      path.join(systemDir, `${key}.webp`),
      path.join(outputDir, `${key}.webp`),
      { ...treatment, material },
    );
  }
  await writeThemeIdentitySources(theme, outputDir);
}

const identityCount = Object.keys(identitySources).length + Object.keys(themeIdentitySources).length;
console.log(`Built ${icons.length} semantic icons and ${identityCount} page identities across every raster theme.`);
