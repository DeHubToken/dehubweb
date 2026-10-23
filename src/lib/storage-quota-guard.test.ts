import { afterEach, describe, expect, it, vi } from 'vitest';
import { evictCaches, pruneStaleLocalePacks } from './storage-quota-guard';

const quotaError = () => new DOMException('full', 'QuotaExceededError');

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('storage quota guard', () => {
  it('drops locale packs from older builds only', () => {
    localStorage.setItem('locale-pack:old:en:features', 'x');
    localStorage.setItem('locale-pack:new:en:features', 'y');
    localStorage.setItem('dehub_user', 'keep');
    expect(pruneStaleLocalePacks('new')).toBe(1);
    expect(localStorage.getItem('locale-pack:new:en:features')).toBe('y');
    expect(localStorage.getItem('locale-pack:old:en:features')).toBeNull();
    expect(localStorage.getItem('dehub_user')).toBe('keep');
  });

  it('evicts caches but never auth, wallet or drafts', () => {
    localStorage.setItem('locale-pack:a:en:core', 'x');
    localStorage.setItem('dehub-translation-cache-v3', 'x');
    localStorage.setItem('dehub_wallet_sessions', 'keep');
    localStorage.setItem('post_drafts', 'keep');
    expect(evictCaches()).toBe(2);
    expect(localStorage.getItem('dehub_wallet_sessions')).toBe('keep');
    expect(localStorage.getItem('post_drafts')).toBe('keep');
  });

  it('frees space and retries when a write hits the quota', () => {
    localStorage.setItem('locale-pack:a:en:core', 'x');
    const original = Storage.prototype.setItem;
    let calls = 0;
    // Simulate a full store: the first attempt at the new key fails.
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    spy.mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'dehub-dm-fee-warning-seen' && calls++ === 0) throw quotaError();
      return original.call(this, key, value);
    });
    vi.resetModules();
    return import('./storage-quota-guard').then(() => {
      expect(() => localStorage.setItem('dehub-dm-fee-warning-seen', '1')).not.toThrow();
      expect(localStorage.getItem('dehub-dm-fee-warning-seen')).toBe('1');
      expect(localStorage.getItem('locale-pack:a:en:core')).toBeNull();
    });
  });

  it('never throws when storage stays full', () => {
    const original = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    spy.mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'big') throw quotaError();
      return original.call(this, key, value);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.resetModules();
    return import('./storage-quota-guard').then(() => {
      expect(() => localStorage.setItem('big', 'x')).not.toThrow();
    });
  });
});
