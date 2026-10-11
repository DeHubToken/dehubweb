import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { createInstance } from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageRouteSync } from '@/components/LanguageRouteSync';

const { loadLanguage } = vi.hoisted(() => ({ loadLanguage: vi.fn() }));
vi.mock('@/i18n', () => ({ loadLanguage, SUPPORTED_LANGUAGES: ['en', 'ar', 'es', 'fr', 'nl', 'tr'].map(code => ({ code })) }));
vi.mock('@/lib/seo/public-locales', () => ({ publicPageLanguages: () => ['ar', 'es', 'fr', 'nl', 'tr'] }));
function Location() { const location = useLocation(); return <output data-testid="url">{location.pathname + location.search + location.hash}</output>; }
async function mount(url: string) {
  const instance = createInstance();
  await instance.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: {} }, fr: { translation: {} }, tr: { translation: {} } } });
  render(<I18nextProvider i18n={instance}><MemoryRouter initialEntries={[url]}><LanguageRouteSync /><Location /></MemoryRouter></I18nextProvider>);
  return instance;
}
beforeEach(() => { loadLanguage.mockReset().mockResolvedValue(true); localStorage.clear(); });
describe('public language URLs', () => {
  it('selects the URL language and retains other parameters and anchors', async () => {
    const instance = await mount('/docs?ref=guide&hl=tr#intro');
    await waitFor(() => expect(instance.language).toBe('tr'));
    expect(screen.getByTestId('url').textContent).toBe('/docs?ref=guide&hl=tr#intro');
    expect(localStorage.getItem('user-preferred-language')).toBe('tr');
    await act(async () => { await instance.changeLanguage('fr'); });
    await waitFor(() => expect(screen.getByTestId('url').textContent).toBe('/docs?ref=guide&hl=fr#intro'));
  });
  it('does not let an older URL request overwrite a newer language selection', async () => {
    let finish: (ok: boolean) => void = () => {};
    const pending = new Promise<boolean>(resolve => { finish = resolve; });
    loadLanguage.mockImplementation((lang: string) => lang === 'tr' ? pending : Promise.resolve(true));
    const instance = await mount('/docs?hl=tr');
    await act(async () => { await instance.changeLanguage('fr'); });
    await waitFor(() => expect(screen.getByTestId('url').textContent).toBe('/docs?hl=fr'));
    await act(async () => { finish(true); await pending; });
    expect(instance.language).toBe('fr');
  });
});
