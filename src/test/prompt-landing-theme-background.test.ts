import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(resolve(__dirname, '../pages/PromptLanding.tsx'), 'utf8');

describe('Prompt landing theme background', () => {
  it('uses the nebula only for the system theme', () => {
    expect(SOURCE).toContain("const { theme } = useAppTheme();");
    expect(SOURCE).toContain("{theme === 'system' && <NebulaBackground />}");
  });
});
