import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); localStorage.clear(); localStorage.setItem('user-preferred-language', 'en'); });
afterEach(() => vi.unstubAllGlobals());

it('renders inline English and interpolation without downloading optional dictionaries', async () => {
  const fetchPack = vi.fn();
  vi.stubGlobal('fetch', fetchPack);
  const { default: i18n } = await import('./index');
  expect(i18n.t('copy.performanceProbe', { defaultValue: 'Hello {{name}}', name: 'Sam' })).toBe('Hello Sam');
  expect(i18n.t('editor.rail.agent', 'Agent')).toBe('Agent');
  await Promise.resolve();
  expect(fetchPack).not.toHaveBeenCalled();
});

it('still loads translated copy for an explicit language without duplicating the English fallback', async () => {
  const fetchPack = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ copy: { performanceProbe: 'Hallo {{name}}' } }) }));
  vi.stubGlobal('fetch', fetchPack);
  const { default: i18n } = await import('./index');
  i18n.t('copy.performanceProbe', { lng: 'de', defaultValue: 'Hello {{name}}', name: 'Sam' });
  await vi.waitFor(() => expect(i18n.getResource('de', 'translation', 'copy.performanceProbe')).toBe('Hallo {{name}}'));
  expect(fetchPack).toHaveBeenCalledTimes(1);
  expect(fetchPack.mock.calls[0][0]).toContain('/de/features.json');
  expect(i18n.t('copy.performanceProbe', { lng: 'de', defaultValue: 'Hello {{name}}', name: 'Sam' })).toBe('Hallo Sam');
});
