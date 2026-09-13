import { describe, it, expect } from 'vitest';
import { isMidSessionUnlock } from '../session-unlock';

const SAFE = '0x1111111111111111111111111111111111111111';
const EOA = '0x2222222222222222222222222222222222222222';
const OTHER = '0x3333333333333333333333333333333333333333';

const live = {
  intent: 'login' as const,
  sessionAddress: SAFE,
  hasLiveSession: true,
  walletEoa: EOA,
  walletSafe: SAFE,
};

describe('isMidSessionUnlock', () => {
  it('recognises the unlock that interrupts a tip', () => {
    expect(isMidSessionUnlock(live)).toBe(true);
  });

  it('accepts a session signed in as the owner EOA (no Pimlico)', () => {
    expect(isMidSessionUnlock({ ...live, sessionAddress: EOA })).toBe(true);
  });

  it('ignores case, which localStorage and the backend disagree on', () => {
    expect(isMidSessionUnlock({ ...live, sessionAddress: SAFE.toUpperCase() })).toBe(true);
  });

  it('is never true while adding a profile — that wallet has to sign in', () => {
    expect(isMidSessionUnlock({ ...live, intent: 'add-profile' })).toBe(false);
  });

  it('is false for a wallet that is not this session — drift, or another account', () => {
    expect(isMidSessionUnlock({ ...live, sessionAddress: OTHER })).toBe(false);
  });

  it('is false with no session to unlock into', () => {
    expect(isMidSessionUnlock({ ...live, hasLiveSession: false })).toBe(false);
    expect(isMidSessionUnlock({ ...live, sessionAddress: null })).toBe(false);
  });

  it('is false when the addresses are unknown, rather than matching null to null', () => {
    expect(isMidSessionUnlock({ ...live, walletEoa: null, walletSafe: null })).toBe(false);
  });
});
