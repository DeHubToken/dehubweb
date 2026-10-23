/** Light refracted into three broad folds over a deep blue-black field. */
export function glassLightPixel(x: number, y: number, accent: readonly number[]): [number, number, number] {
  const gauss = (distance: number, width: number) => Math.exp(-((distance / width) ** 2));
  const d1 = (y - (1040 - .82 * x + 76 * Math.sin(x / 260 + .2))) / 1.293;
  const d2 = (y - (100 + .36 * x + 140 * Math.sin(x / 410 + .4))) / 1.063;
  const d3 = (y - (940 - .12 * x + 150 * Math.sin(x / 430 + 1.9))) / 1.007;
  const sky = .16 * Math.exp(-(((x - 1510) / 900) ** 2 + ((y + 80) / 730) ** 2));
  const floor = .09 * Math.exp(-(((x - 180) / 800) ** 2 + ((y - 1120) / 630) ** 2));
  const light = sky + floor + .32 * gauss(d1, 78) + .21 * gauss(d2, 55) + .15 * gauss(d3, 70);
  const crest = .18 * gauss(d1 - 18, 26) + .10 * gauss(d2 + 16, 24);
  // Subpixel dithering avoids hard 8-bit contours without a visible texture.
  const noise = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1) * .45;
  return [2, 17, 24].map((base, i) => Math.max(0, Math.min(255,
    base + (accent[i] * .62 + [80, 145, 165][i] * .38) * light + [130, 215, 225][i] * crest + noise,
  ))) as [number, number, number];
}
