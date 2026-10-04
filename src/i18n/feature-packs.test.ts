import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
describe('feature language packs', () => {
  it('loads an English feature only when its strings are used', async () => {
    vi.resetModules();
    localStorage.clear();
    const fetchPack = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ editor: { packProbe: 'Editor loaded' } }) });
    vi.stubGlobal('fetch', fetchPack);
    const { default: i18n } = await import('./index');
    expect(fetchPack).not.toHaveBeenCalled();
    i18n.t('editor.packProbe');
    await vi.waitFor(() => expect(i18n.getResource('en', 'translation', 'editor.packProbe')).toBe('Editor loaded'));
    expect(fetchPack).toHaveBeenCalledTimes(1);
    expect(fetchPack.mock.calls[0][0]).toMatch(/\/locale-packs\/web\/[^/]+\/en\/creator.json$/);
    expect(i18n.t('editor.packProbe')).toBe('Editor loaded');
    expect(fetchPack).toHaveBeenCalledTimes(1);
  });

  it('keeps cached selected-language packs usable offline', async () => {
    vi.resetModules();
    const manifest = (await import('./locale-manifest.json')).default;
    localStorage.setItem(`locale-pack:${manifest.version}:fr:core`, JSON.stringify({ common: { offlineProbe: 'Hors ligne' } }));
    const fetchPack = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchPack);
    const { default: i18n, loadLanguage } = await import('./index');
    expect(await loadLanguage('fr')).toBe(true);
    expect(i18n.getResource('fr', 'translation', 'common.offlineProbe')).toBe('Hors ligne');
    expect(fetchPack).not.toHaveBeenCalled();
  });
});
