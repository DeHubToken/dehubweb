import { describe, expect, it } from 'vitest';
import { looksLikePausedRevert } from '@/lib/contracts/aa-utils';

describe('looksLikePausedRevert', () => {
  it('matches real Pausable reverts', () => {
    expect(looksLikePausedRevert('execution reverted: Pausable: paused')).toBe(true);
    expect(looksLikePausedRevert('ERC20Pausable: token transfer while paused')).toBe(true);
    expect(looksLikePausedRevert('reverted with custom error EnforcedPause()')).toBe(true);
  });

  it('ignores errors that only mention the word paused', () => {
    expect(looksLikePausedRevert('UserOperation reverted: video paused, retry')).toBe(false);
    expect(looksLikePausedRevert('{"isPaused":false,"status":"unpaused"}')).toBe(false);
    expect(looksLikePausedRevert('insufficient funds for gas')).toBe(false);
  });
});
