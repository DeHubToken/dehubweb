/**
 * User Language Detection Hook
 * ============================
 * Detects user's preferred language from browser settings.
 * Caches result in localStorage for consistency.
 */

import { useState, useEffect, useCallback } from 'react';
import i18n from '@/i18n';

const STORAGE_KEY = 'user-preferred-language';

export function useUserLanguage() {
  const [language, setLanguage] = useState<string>('en');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check localStorage first
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      setLanguage(cached);
      setIsLoading(false);
      return;
    }

    // Use browser language
    const browserLang = navigator.language?.split('-')[0] || 'en';
    setLanguage(browserLang);
    localStorage.setItem(STORAGE_KEY, browserLang);
    setIsLoading(false);
  }, []);

  const setPreferredLanguage = useCallback((lang: string) => {
    setLanguage(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    // Sync with i18next
    i18n.changeLanguage(lang);
  }, []);

  return { language, isLoading, setPreferredLanguage };
}

// Language code to name mapping
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  hi: 'Hindi',
  th: 'Thai',
  vi: 'Vietnamese',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  uk: 'Ukrainian',
  cs: 'Czech',
  sv: 'Swedish',
  da: 'Danish',
  fi: 'Finnish',
  no: 'Norwegian',
  el: 'Greek',
  he: 'Hebrew',
  id: 'Indonesian',
  ms: 'Malay',
  ro: 'Romanian',
  hu: 'Hungarian',
  sk: 'Slovak',
  bn: 'Bengali',
  tl: 'Tagalog',
};
