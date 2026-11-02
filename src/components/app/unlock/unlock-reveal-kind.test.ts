import { beforeEach, describe, expect, it } from 'vitest';
import { nextUnlockRevealKind } from './unlock-reveal-kind';

describe('nextUnlockRevealKind', () => {
  beforeEach(() => localStorage.clear());

  it('takes turns: coin, confetti, foil, then starts again', () => {
    expect([1, 2, 3, 4].map(() => nextUnlockRevealKind())).toEqual(['coin', 'confetti', 'foil', 'coin']);
  });
});
