import { beforeEach, describe, expect, it, vi } from 'vitest';

const prefs = vi.hoisted(() => ({
  language: 'tr-TR',
  changed: undefined as undefined | (() => void),
  saved: new Map<string, string>(),
}));
vi.mock('i18next', () => ({ default: {
  get language() { return prefs.language; },
  on: (_event: string, callback: () => void) => { prefs.changed = callback; },
} }));
vi.mock('react', () => ({ useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() }));

describe('stage caption language preferences', () => {
  beforeEach(() => {
    vi.resetModules();
    prefs.saved.clear();
    prefs.language = 'tr-TR';
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => prefs.saved.get(key) ?? null,
      setItem: (key: string, value: string) => prefs.saved.set(key, value),
    } });
  });

  it('follows the app language until an explicit choice', async () => {
    const captions = await import('../stage-captions');
    expect(captions.useCaptionLanguage()).toBe('tr');
    prefs.language = 'pt_BR';
    prefs.changed?.();
    expect(captions.useCaptionLanguage()).toBe('pt');
  });

  it('persists choosing the current default instead of following later language changes', async () => {
    const captions = await import('../stage-captions');
    captions.setCaptionLanguage('tr');
    expect(prefs.saved.get('dehub.stage.captions.lang')).toBe('tr');
    prefs.language = 'en';
    prefs.changed?.();
    expect(captions.useCaptionLanguage()).toBe('tr');
    vi.resetModules();
    expect((await import('../stage-captions')).useCaptionLanguage()).toBe('tr');
  });

  it('remembers spoken language even when the app language has no caption support', async () => {
    prefs.language = 'cy';
    const captions = await import('../stage-captions');
    captions.setCaptionLanguage(null);
    expect(prefs.saved.get('dehub.stage.captions.lang')).toBe('source');
    prefs.language = 'en';
    vi.resetModules();
    expect((await import('../stage-captions')).useCaptionLanguage()).toBeNull();
  });
});
