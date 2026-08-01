import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, '../components/app/OsakaBackground.tsx'), 'utf8');

describe('Osaka rain shader', () => {
  it('samples both neighbouring rows so drops cross grid seams', () => {
    expect(SOURCE).toContain('osakaDropCell(gv, id + vec2(0.0, -1.0)');
    expect(SOURCE).toContain('osakaDropCell(gv, id + vec2(0.0, 1.0)');
    expect(SOURCE).toContain('mergeOsakaDrops');
  });

  it('gates a small splash to a sparse subset at the existing end-of-life phase', () => {
    expect(SOURCE).toContain('struct OsakaRain');
    expect(SOURCE).toContain('float popEligible = step(0.74, n)');
    expect(SOURCE).toContain('drop *= 1.0 - popEligible * smoothstep(0.91, 0.985, phase)');
    expect(SOURCE).toContain('vec2 splashA = splashUv');
    expect(SOURCE).toContain('vec2 splashB = splashUv');
    expect(SOURCE).toContain('vec2 splashC = splashUv');
    expect(SOURCE).not.toContain('float popRadius');
    expect(SOURCE).not.toContain('float shell = abs(dr - popRadius)');
    expect(SOURCE).toContain('pop *= wet');
  });

  it('stores a directional drying streak beside the existing wipe mask', () => {
    expect(SOURCE).toContain('uniform float u_streakDecay');
    expect(SOURCE).toContain('texture2D(u_prev, v_uv).rg');
    expect(SOURCE).toContain('vec2 across = vec2(-tangent.y, tangent.x)');
    expect(SOURCE).toContain('float streakStamp = stamp * bands * moving * 0.62');
    expect(SOURCE).toContain('vec2 wipeField = texture2D(u_wipe, uv).rg');
    expect(SOURCE).toContain('float dryingStreak = smoothstep(0.025, 0.55, wipeStreak)');
  });
});
