import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('automatic dub preference', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  it('defaults to automatic dubbing and follows the auto-translate choice', async () => {
    const { getDubPreference } = await import('@/hooks/dub-preference');
    const { setAutoTranslateEnabled } = await import('@/lib/auto-translate-setting');
    expect(getDubPreference().on).toBe(true);
    setAutoTranslateEnabled(false);
    expect(getDubPreference().on).toBe(false);
    setAutoTranslateEnabled(true);
    expect(getDubPreference().on).toBe(true);
  });

  it('keeps an explicit off choice across reloads and auto-translate changes', async () => {
    localStorage.setItem('video-dubs:on', '0');
    const { getDubPreference } = await import('@/hooks/dub-preference');
    expect(getDubPreference().on).toBe(false);
    const { setAutoTranslateEnabled } = await import('@/lib/auto-translate-setting');
    setAutoTranslateEnabled(true);
    expect(getDubPreference().on).toBe(false);
  });

  it('keeps a manual language and on choice when auto-translate is off', async () => {
    const { getDubPreference, setDubPreference } = await import('@/hooks/dub-preference');
    const { setAutoTranslateEnabled } = await import('@/lib/auto-translate-setting');
    setDubPreference(true, 'zh-TW');
    setAutoTranslateEnabled(false);
    expect(getDubPreference()).toMatchObject({ on: true, lang: 'zh-TW', automatic: false });
    expect(localStorage.getItem('video-dubs:lang')).toBe('zh-TW');
  });
});
