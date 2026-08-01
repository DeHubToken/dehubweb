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
});
