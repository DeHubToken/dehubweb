/**
 * Impersonation folding — the cases that matter are the evasions.
 *
 * A scam account never copies a creator's name exactly; it swaps a Cyrillic
 * letter in, doubles a character, or hides a zero-width space in the middle.
 * If any of those stop matching, the warning silently stops appearing, and the
 * failure is invisible in the UI — hence a test rather than a manual check.
 */
import { describe, it, expect } from 'vitest';
import { foldName, looksLike, checkImpersonation, staffImpersonated } from '@/lib/impersonation';

describe('foldName', () => {
  it('folds case, spacing and punctuation away', () => {
    expect(foldName('De Hub.')).toBe(foldName('DeHub'));
  });

  it('folds Cyrillic and Greek lookalikes to their Latin twin', () => {
    expect(foldName('DеHub')).toBe('dehub');   // Cyrillic е
    expect(foldName('DeHυb')).toBe('dehub');   // Greek υ
  });

  it('folds digits that stand in for letters', () => {
    expect(foldName('D3Hub')).toBe('dehub');
    expect(foldName('DeHu8')).toBe('dehub');
  });

  it('collapses repeated characters', () => {
    expect(foldName('DeHubbb')).toBe('dehub');
  });

  it('drops zero-width characters', () => {
    expect(foldName('De​Hub')).toBe('dehub');
  });
});

describe('looksLike', () => {
  it('matches the evasions', () => {
    for (const spoof of ['DеHub', 'D3Hub', 'DeHubb', 'DeHub.', 'De Hub', 'De​Hub']) {
      expect(looksLike(spoof, 'DeHub')).toBe(true);
    }
  });

  it('allows one typo of slack on longer names', () => {
    expect(looksLike('maldotet', 'maldoteth')).toBe(true);
  });

  it('does not flag a different name that happens to be close in length', () => {
    expect(looksLike('someoneelse', 'maldoteth')).toBe(false);
    expect(looksLike('DeHub Official', 'DeHub')).toBe(false);
  });

  it('requires exact folding for very short names', () => {
    expect(looksLike('bob', 'bib')).toBe(false);
  });
});

describe('checkImpersonation', () => {
  const creator = { address: '0xAAA', displayName: 'DeHub', username: 'dehub' };

  it('marks the creator by address, not by name', () => {
    expect(checkImpersonation({ address: '0xaaa', displayName: 'anything' }, creator)).toEqual({
      isCreator: true,
      isImpersonating: false,
    });
  });

  it('flags a different account wearing the name', () => {
    expect(checkImpersonation({ address: '0xBBB', displayName: 'DеHub' }, creator).isImpersonating).toBe(true);
  });

  it('says nothing when either address is missing', () => {
    expect(checkImpersonation({ displayName: 'DeHub' }, creator).isImpersonating).toBe(false);
    expect(checkImpersonation({ address: '0xBBB', displayName: 'DeHub' }, null).isImpersonating).toBe(false);
  });

  it('leaves an unrelated commenter alone', () => {
    expect(checkImpersonation({ address: '0xCCC', displayName: 'SableRaven' }, creator)).toEqual({
      isCreator: false,
      isImpersonating: false,
    });
  });
});

describe('staffImpersonated', () => {
  const MAL = '0x9324840523a5d17dd12a2f11a9472e5a199c1937';
  const STRANGER = '0x1111111111111111111111111111111111111111';

  it('flags copies of Mal from another wallet', () => {
    for (const displayName of ['Mal | Riftn Founder', 'mal.eth', 'Real MaI', 'Мal Official', 'maldoteth']) {
      expect(staffImpersonated({ address: STRANGER, displayName })).toBe('Mal');
    }
    expect(staffImpersonated({ address: STRANGER, username: 'real_maldoteth' })).toBe('Mal');
    expect(staffImpersonated({ address: STRANGER, displayName: 'Riftn Support' })).toBe('Riftn');
  });

  it('never flags the real owner or ordinary names', () => {
    expect(staffImpersonated({ address: MAL, displayName: 'mal', username: 'maldoteth' })).toBeNull();
    // His new wallet: the @maldoteth username is his
    expect(staffImpersonated({ address: STRANGER, displayName: 'Mal | Founder', username: 'maldoteth' })).toBeNull();
    for (const displayName of ['Mal', 'MaI', 'Мal', 'Its Mal', 'Malek', 'Malik', 'Kemal', 'Mal Jones', 'Normal']) {
      expect(staffImpersonated({ address: STRANGER, displayName })).toBeNull();
    }
  });
});
