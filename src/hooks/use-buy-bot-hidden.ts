/**
 * useBuyBotHidden Hook
 * Persists user preference to hide buy bot alerts via localStorage.
 */
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'dehub_hide_buy_bot';

export function useBuyBotHidden() {
  const [isHidden, setIsHidden] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const hide = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsHidden(true);
  }, []);

  const show = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setIsHidden(false);
  }, []);

  return { isHidden, hide, show };
}
