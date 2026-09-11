import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(__dirname, '../components/app/cards/CardHeader.tsx'),
  'utf8',
);

describe('feed card badge layout', () => {
  it('centres chips without letting their baselines move the name row', () => {
    expect(source).toContain('inline-flex items-center gap-1 shrink min-w-0');
    expect(source).not.toContain('inline-flex items-baseline gap-1 shrink min-w-0 text-base');
  });

  it('keeps holder artwork raised beside the display name', () => {
    expect(source).toContain('w-[1em] h-[1em] shrink-0 -translate-y-px');
  });
});
