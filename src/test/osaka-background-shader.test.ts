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

  it('pops only during the existing end-of-life phase', () => {
    expect(SOURCE).toContain('struct OsakaRain');
    expect(SOURCE).toContain('float popEnvelope = smoothstep(0.84, 0.90, phase)');
    expect(SOURCE).toContain('drop *= 1.0 - smoothstep(0.88, 0.97, phase)');
    expect(SOURCE).toContain('float popRadius = mix(size * 0.75, size * 2.1, popProgress)');
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
