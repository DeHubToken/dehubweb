import { describe, it, expect } from 'vitest';
import {
  assessLocal,
  MIN_PASSWORD_LENGTH,
  PASSPHRASE_LENGTH,
  MIN_ACCEPTABLE_SCORE,
} from '@/lib/wallet-core/passwordStrength';

/**
 * The meter's job is to predict the verdict, not to be encouraging. A password
 * that submit will refuse must never render in a band that reads as progress —
 * that mismatch is what had people typing a password, seeing a lit bar, and
 * only learning it was too short when the form bounced them.
 */
describe('the meter never flatters a password submit will reject', () => {
  const rejected = [
    'aB3$',            // four characters, all four character classes
    'Password1!',      // ten, all four classes
    'Appleboy123',     // eleven — one short
    'short',
    '12345678',        // in the common list
    'qwertyuiop123',   // predictable prefix
  ];

  it.each(rejected)('scores %s below the accept threshold', (pw) => {
    const a = assessLocal(pw);
    expect(a.acceptable).toBe(false);
    expect(a.score).toBeLessThan(MIN_ACCEPTABLE_SCORE);
  });

  it('never reports acceptable and a rejecting score at the same time', () => {
    const samples = [...rejected, '', 'a', 'Appleboy123!', 'correcthorsebatterystaple'];
    for (const pw of samples) {
      const a = assessLocal(pw);
      expect(a.score >= MIN_ACCEPTABLE_SCORE).toBe(a.acceptable);
    }
  });
});

describe('length is what actually buys strength', () => {
  it('accepts a long single-class passphrase', () => {
    // 25 characters of lowercase has a far bigger search space than
    // "Appleboy123!", and the old rule rejected it while accepting that.
    const a = assessLocal('correcthorsebatterystaple');
    expect(a.acceptable).toBe(true);
    expect(a.score).toBe(4);
  });

  it(`accepts exactly ${PASSPHRASE_LENGTH} characters with no variety`, () => {
    const a = assessLocal('a'.repeat(PASSPHRASE_LENGTH - 1) + 'b');
    expect(a.acceptable).toBe(true);
  });

  it(`still rejects a short password however many character classes it has`, () => {
    const a = assessLocal('aB3$aB3$aB'); // 10 chars, 4 classes
    expect(a.longEnough).toBe(false);
    expect(a.acceptable).toBe(false);
  });

  it(`accepts the documented minimum of ${MIN_PASSWORD_LENGTH} with two classes`, () => {
    const a = assessLocal('applepieday1');
    expect(a.acceptable).toBe(true);
  });
});

describe('warnings state every blocker, not just the first', () => {
  it('mentions the length rule even when the password is also predictable', () => {
    // The old code pushed the "common password" warning and then rendered only
    // warnings[0], so the length requirement was invisible for exactly the
    // passwords most likely to be too short.
    const a = assessLocal('letmein');
    expect(a.warnings).toContain('This is a common or predictable password');
    expect(a.warnings.some((w) => w.includes(String(MIN_PASSWORD_LENGTH)))).toBe(true);
  });

  it('asks for variety only once the length rule is satisfied', () => {
    const a = assessLocal('applepieday');  // 11 chars — length is the live problem
    expect(a.warnings.some((w) => w.includes(String(MIN_PASSWORD_LENGTH)))).toBe(true);
    expect(a.warnings.some((w) => w.startsWith('Add a number'))).toBe(false);
  });
});

describe('requirements checklist', () => {
  it('reports both rules, unmet, for an empty password', () => {
    const a = assessLocal('');
    expect(a.requirements).toHaveLength(2);
    expect(a.requirements.every((r) => !r.met)).toBe(true);
  });

  it('ticks the variety rule on length alone for a passphrase', () => {
    const a = assessLocal('a'.repeat(PASSPHRASE_LENGTH));
    expect(a.requirements[1].met).toBe(true);
  });
});
