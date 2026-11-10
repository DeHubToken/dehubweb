import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

const updateProfile = vi.fn(() => Promise.resolve({}));
vi.mock('@/lib/api/dehub/users', () => ({ updateProfile: (...a: unknown[]) => updateProfile(...(a as [])) }));

let user: { address: string; preferredLanguage?: string } | null = null;
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user, isAuthenticated: !!user }) }));

const listeners = new Set<() => void>();
const i18n = {
  language: 'en',
  on: (_: string, fn: () => void) => listeners.add(fn),
  off: (_: string, fn: () => void) => listeners.delete(fn),
};
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n }) }));

import { AccountLanguageSync } from '@/components/app/AccountLanguageSync';

function switchTo(lang: string) {
  i18n.language = lang;
  act(() => listeners.forEach((fn) => fn()));
}

describe('AccountLanguageSync (web)', () => {
  beforeEach(() => {
    updateProfile.mockClear();
    listeners.clear();
    i18n.language = 'en';
  });

  it('does not overwrite the language the phone saved just by signing in on the web', () => {
    user = { address: '0xabc', preferredLanguage: 'tr' };
    render(<AccountLanguageSync />);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('saves a language picked on the web', () => {
    user = { address: '0xabc', preferredLanguage: 'tr' };
    render(<AccountLanguageSync />);
    switchTo('de');
    expect(updateProfile).toHaveBeenCalledWith({ preferredLanguage: 'de' });
  });

  it('fills the language when the account has none yet', () => {
    user = { address: '0xabc' };
    render(<AccountLanguageSync />);
    expect(updateProfile).toHaveBeenCalledWith({ preferredLanguage: 'en' });
  });
});
