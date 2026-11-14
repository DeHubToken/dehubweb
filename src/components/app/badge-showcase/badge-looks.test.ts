import { describe, expect, it } from 'vitest';
import { BADGE_LOOKS } from './badge-looks';
import { BADGE_LOOK_THEMES } from '@/lib/badge-world';

describe('badge looks', () => {
  it('has a look for every theme the showcase routes to one', () => {
    expect([...BADGE_LOOKS].sort()).toEqual([...BADGE_LOOK_THEMES].sort());
  });
});
