import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen, waitFor } from '@testing-library/dom';

// ---- Auth: a mutable stand-in we flip between signed in / out --------------
const authState = {
  walletAddress: null as string | null,
  isAuthenticated: false,
  isLoading: false,
};
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authState }));

// ---- Supabase: the wallet's saved preference blob --------------------------
let serverPrefs: Record<string, unknown> | null = null;

vi.mock('@/integrations/supabase/client', () => {
  const query = () => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = self;
    q.maybeSingle = self;
    q.upsert = self;
    // Thenable so `await withWalletHeader(query, addr)` resolves.
    q.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({
        data: serverPrefs ? { preferences: serverPrefs } : null,
        error: null,
      }).then(onFulfilled);
    return q;
  };
  return { supabase: { from: () => query() } };
});
vi.mock('@/lib/supabase-wallet-client', () => ({
  withWalletHeader: (q: unknown) => q,
}));

vi.mock('@/i18n', () => ({
  default: { language: 'en', changeLanguage: vi.fn() },
  loadLanguage: vi.fn(() => Promise.resolve(true)),
}));

import { UserPreferencesProvider } from '@/contexts/UserPreferencesContext';
import { ThemeProvider, useAppTheme } from '@/contexts/ThemeContext';

const WALLET = '0xAbCdEf0000000000000000000000000000000001';
const MIRROR_KEY = `dehub.prefs::${WALLET.toLowerCase()}`;

function Probe() {
  const { theme, dimLights, themeHues } = useAppTheme();
  return (
    <>
      <span data-testid="theme">{theme}</span>
      <span data-testid="dim">{dimLights ? 'on' : 'off'}</span>
      <span data-testid="hue">{String(themeHues.cosmic)}</span>
    </>
  );
}

function renderApp() {
  return render(
    <UserPreferencesProvider>
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    </UserPreferencesProvider>,
  );
}

function signIn() {
  authState.walletAddress = WALLET;
  authState.isAuthenticated = true;
}

function signOut() {
  authState.walletAddress = null;
  authState.isAuthenticated = false;
}

describe('appearance reset on sign-out', () => {
  beforeEach(() => {
    localStorage.clear();
    authState.isLoading = false;
    signOut();
    serverPrefs = null;
  });

  it('restores the default system theme on sign-out and brings the saved look back on sign-in', async () => {
    // The wallet has a saved look; the browser is already wearing it.
    serverPrefs = { theme: 'hazy', dimLights: true, themeHues: { cosmic: 200 } };
    localStorage.setItem('dehub.theme', 'hazy');
    localStorage.setItem('dehub.dimLights', '1');
    signIn();

    const { rerender } = renderApp();
    await waitFor(() => expect(screen.getByTestId('theme').textContent).toBe('hazy'));
    expect(screen.getByTestId('dim').textContent).toBe('on');
    expect(screen.getByTestId('hue').textContent).toBe('200');

    // Sign out → stock system look, and the local keys the pre-React inline
    // script in index.html reads are rewritten too.
    signOut();
    rerender(
      <UserPreferencesProvider>
        <ThemeProvider>
          <Probe />
        </ThemeProvider>
      </UserPreferencesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('theme').textContent).toBe('system'));
    expect(screen.getByTestId('dim').textContent).toBe('off');
    expect(screen.getByTestId('hue').textContent).toBe('-1');
    expect(localStorage.getItem('dehub.theme')).toBe('system');
    expect(localStorage.getItem('dehub.dimLights')).toBe('0');

    // The account's own copy is untouched, so the look is not lost.
    expect(JSON.parse(localStorage.getItem(MIRROR_KEY) ?? '{}')).toMatchObject({ theme: 'hazy' });

    // Sign back in → the saved look returns.
    signIn();
    rerender(
      <UserPreferencesProvider>
        <ThemeProvider>
          <Probe />
        </ThemeProvider>
      </UserPreferencesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('theme').textContent).toBe('hazy'));
    expect(screen.getByTestId('dim').textContent).toBe('on');
  });

  it('resets an appearance context that mounts while signed out', async () => {
    localStorage.setItem('dehub.theme', 'war');
    renderApp();
    await waitFor(() => expect(screen.getByTestId('theme').textContent).toBe('system'));
    expect(localStorage.getItem('dehub.theme')).toBe('system');
  });

  it('leaves the look alone while auth is still resolving', async () => {
    localStorage.setItem('dehub.theme', 'hazy');
    authState.isLoading = true;
    renderApp();
    await waitFor(() => expect(screen.getByTestId('theme').textContent).toBe('hazy'));
    expect(localStorage.getItem('dehub.theme')).toBe('hazy');
  });

  it('does not reset non-appearance preferences such as language', async () => {
    localStorage.setItem('user-preferred-language', 'es');
    renderApp();
    await waitFor(() => expect(screen.getByTestId('theme').textContent).toBe('system'));
    expect(localStorage.getItem('user-preferred-language')).toBe('es');
  });
});
