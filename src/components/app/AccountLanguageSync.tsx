/**
 * AccountLanguageSync — tells the account which language this reader uses.
 *
 * Renders nothing. Pushes are written on the server, which has no device to
 * ask, so it writes them in the account's `preferredLanguage`. Pushes land on
 * the phone, so the phone app sets that field on sign-in. The web only fills
 * it when the account has none yet, or when the reader picks another language
 * here. Writing the browser's language on every sign-in flipped a Turkish
 * phone's pushes to English each time the same account opened the web.
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
  // The language this tab opened in. Only a change from it is a pick.
  const opened = useRef(language.toLowerCase().split('-')[0]);

  useEffect(() => {
    const code = language.toLowerCase().split('-')[0];
    if (!isAuthenticated || !address || !/^[a-z]{2,3}$/.test(code)) return;
    const key = `${address}:${code}`;
    if (saved === code || sent.current === key) return;
    if (saved && code === opened.current) return;
    sent.current = key;
    updateProfile({ preferredLanguage: code }).catch(() => {
      // Pushes stay in the last saved language; try again on the next change.
      if (sent.current === key) sent.current = null;
    });
  }, [isAuthenticated, address, saved, language]);

  return null;
}
