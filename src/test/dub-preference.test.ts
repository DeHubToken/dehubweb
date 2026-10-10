import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('opt-in dub preference', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  it('defaults to original audio independently of auto-translate', async () => {
    const { getDubPreference } = await import('@/hooks/dub-preference');
    const { setAutoTranslateEnabled } = await import('@/lib/auto-translate-setting');
    expect(getDubPreference().on).toBe(false);
    setAutoTranslateEnabled(false);
    expect(getDubPreference().on).toBe(false);
    setAutoTranslateEnabled(true);
    expect(getDubPreference().on).toBe(false);
  });

  it('preserves a saved explicit opt-in across reloads', async () => {
    localStorage.setItem('video-dubs:on', '1');
    expect((await import('@/hooks/dub-preference')).getDubPreference().on).toBe(true);
  });

  it('does not turn an invalid legacy value into consent', async () => {
    localStorage.setItem('video-dubs:on', 'true');
    expect((await import('@/hooks/dub-preference')).getDubPreference().on).toBe(false);
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
