/**
 * AccountLanguageSync — tells the account which language this reader uses.
 *
 * Renders nothing. Pushes are written on the server, which has no device to
 * ask, so it writes them in the account's `preferredLanguage`. This keeps that
 * field on whatever language the app is showing: once on sign-in when the two
 * differ, and again whenever the reader picks another language. The app
 * (dehub-mobile) does the same, so the last language chosen on any device is
 * the one pushes arrive in.
 *
 * @module components/app/AccountLanguageSync
 */

import { useEffect, useRef, useSyncExternalStore, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { updateProfile } from '@/lib/api/dehub/users';

export function AccountLanguageSync() {
  const { i18n } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const subscribe = useCallback((changed: () => void) => {
    i18n.on('languageChanged', changed);
    return () => { i18n.off('languageChanged', changed); };
  }, [i18n]);
  const language = useSyncExternalStore(subscribe, () => i18n.language || 'en', () => 'en');
  const address = user?.address?.toLowerCase();
  const saved = (user as { preferredLanguage?: string } | null)?.preferredLanguage;
  // What this tab last sent, per account, so a stale `user` does not resend it.
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const code = language.toLowerCase().split('-')[0];
    if (!isAuthenticated || !address || !/^[a-z]{2,3}$/.test(code)) return;
    const key = `${address}:${code}`;
    if (saved === code || sent.current === key) return;
    sent.current = key;
    updateProfile({ preferredLanguage: code }).catch(() => {
      // Pushes stay in the last saved language; try again on the next change.
      if (sent.current === key) sent.current = null;
    });
  }, [isAuthenticated, address, saved, language]);

  return null;
}
