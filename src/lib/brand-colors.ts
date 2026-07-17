/**
 * Brand-colour extraction
 * ========================
 * Pull the most prominent colours out of a user's profile picture so the
 * customisable WebGL themes can render a personal "Brand" gradient (see the
 * Brand mode in theme-color.ts / SettingsPage).
 *
 * The image is drawn to a small offscreen canvas and its pixels are bucketed
 * into a coarse colour histogram. Buckets are scored by population weighted
 * toward vivid colours, then picked greedily so the returned palette is
 * visually distinct rather than three shades of the same background.
 *
 * @module lib/brand-colors
 */

/** Longest edge (px) the source image is downscaled to before sampling. */
const SAMPLE_SIZE = 64;
/** Channel quantisation step — 16 levels per channel keeps buckets meaningful. */
const BUCKET_STEP = 16;

type Bucket = {
  count: number;
  r: number; // running sum of actual channel values (0–255) for averaging
  g: number;
  b: number;
};

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** RGB (0–255) → HSL with h in 0–360, s/l in 0–1. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h = ((h * 60) % 360 + 360) % 360;
  return [h, s, l];
}

/**
 * Load an image cross-origin. Falls back to a cache-busting query param so a
 * previously-cached non-CORS response for the same URL can't taint the retry.
 * Rejects if the image can't be loaded (e.g. the host sends no CORS header).
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image for colour extraction'));
    // blob:/data: URLs are same-origin and never tainted — load them verbatim.
    // Appending a query string to them yields an invalid key and fails the load
    // (this is what broke Brand right after an optimistic profile-pic upload).
    const isRemote = /^https?:/i.test(url);
    if (isRemote) {
      // Cross-origin read + a distinct param so we don't reuse a non-CORS cache
      // entry (e.g. the one the <img> avatar populated) that would taint canvas.
      img.crossOrigin = 'anonymous';
      img.src = url.includes('?') ? `${url}&brandpx=1` : `${url}?brandpx=1`;
    } else {
      img.src = url;
    }
  });
}

/**
 * Extract up to `max` prominent, visually distinct colours from an image URL.
 * Returns hex strings ordered by prominence. Throws if the image can't be
 * read (load failure or a tainted/cross-origin canvas).
 */
export async function extractBrandColors(url: string, max = 3): Promise<string[]> {
  const img = await loadImage(url);

  const scale = Math.min(1, SAMPLE_SIZE / Math.max(img.naturalWidth || SAMPLE_SIZE, img.naturalHeight || SAMPLE_SIZE));
  const w = Math.max(1, Math.round((img.naturalWidth || SAMPLE_SIZE) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || SAMPLE_SIZE) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0, w, h);

  // getImageData throws a SecurityError on a tainted (cross-origin) canvas.
  const { data } = ctx.getImageData(0, 0, w, h);

  const buckets = new Map<number, Bucket>();
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 125) continue; // skip transparent pixels
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key =
      (Math.floor(r / BUCKET_STEP) << 10) |
      (Math.floor(g / BUCKET_STEP) << 5) |
      Math.floor(b / BUCKET_STEP);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }

  if (buckets.size === 0) throw new Error('No opaque pixels to sample');

  // Average each bucket and score it: population weighted toward vivid colours
  // and away from the extremes (pure black/white backgrounds), so a colourful
  // logo beats a large flat backdrop.
  const candidates = Array.from(buckets.values()).map((bk) => {
    const r = bk.r / bk.count;
    const g = bk.g / bk.count;
    const b = bk.b / bk.count;
    const [hue, sat, light] = rgbToHsl(r, g, b);
    // De-emphasise near-white / near-black; reward saturation.
    const midweight = 1 - Math.abs(light - 0.5) * 1.2;
    const score = bk.count * (0.25 + sat * 1.6) * Math.max(0.15, midweight);
    return { r, g, b, hue, sat, light, score };
  });
  candidates.sort((a, b) => b.score - a.score);

  // Greedily pick colours that are distinct in hue (or in lightness for near-
  // greys) so the palette reads as a real gradient, not one colour thrice.
  const picked: typeof candidates = [];
  const hueDist = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };
  for (const c of candidates) {
    if (picked.length >= max) break;
    const clashes = picked.some((p) => {
      if (c.sat < 0.12 && p.sat < 0.12) return Math.abs(c.light - p.light) < 0.18; // both grey → compare lightness
      return hueDist(c.hue, p.hue) < 28 && Math.abs(c.light - p.light) < 0.22;
    });
    if (!clashes) picked.push(c);
  }
  // If the picture is near-monochrome we may not fill `max`; top up with the
  // next highest-scoring buckets regardless of distinctness so Brand still works.
  for (const c of candidates) {
    if (picked.length >= max) break;
    if (!picked.includes(c)) picked.push(c);
  }

  return picked.slice(0, max).map((c) => toHex(c.r, c.g, c.b));
}
