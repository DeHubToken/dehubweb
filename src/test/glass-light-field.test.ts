import { describe, expect, it } from 'vitest';
import { glassLightPixel } from '@/lib/glass-light-field';

describe('Glass refracted light', () => {
  it('separates cyan crests from deep blue-black negative space', () => {
    const dark = glassLightPixel(200, 200, [0, 210, 230]);
    const crestY = 1040 - .82 * 800 + 76 * Math.sin(800 / 260 + .2) + 18 * 1.293;
    const crest = glassLightPixel(800, crestY, [0, 210, 230]);
    expect(dark[1]).toBeLessThan(35);
    expect(crest[1]).toBeGreaterThan(120);
    expect(crest[2]).toBeGreaterThan(crest[0] * 3);
    expect(Math.abs(crest[1] - glassLightPixel(801, crestY, [0, 210, 230])[1])).toBeLessThan(3);
  });

  it('recolours the light without replacing the dark field with a flat tint', () => {
    const teal = glassLightPixel(900, 350, [0, 210, 230]);
    const rose = glassLightPixel(900, 350, [230, 0, 160]);
    expect(rose[0]).toBeGreaterThan(teal[0]);
    expect(rose[1]).toBeLessThan(teal[1]);
    for (const pixel of [teal, rose, glassLightPixel(-500, 1500, [0, 210, 230])]) {
      expect(pixel.every(value => Number.isFinite(value) && value >= 0 && value <= 255)).toBe(true);
    }
  });
});
