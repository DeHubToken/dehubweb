/**
 * useBuyBotHidden Hook
 * Persists user preference to hide buy bot alerts via localStorage.
 */
import { useState, useCallback } from 'react';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';

const STORAGE_KEY = 'dehub_hide_buy_bot';

export function useBuyBotHidden() {
  const [isHidden, setIsHidden] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  // Persist the choice to the signed-in account (per-user sync).
  const prefs = useUserPreferences();

  const hide = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsHidden(true);
    prefs?.setPref('buyBotHidden', true);
  }, [prefs]);

  const show = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setIsHidden(false);
    prefs?.setPref('buyBotHidden', false);
  }, [prefs]);

  return { isHidden, hide, show };
}
