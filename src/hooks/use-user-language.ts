/**
 * User Language Detection Hook
 * ============================
 * Detects user's preferred language from browser settings.
 * Caches result in localStorage for consistency.
 */

import { useState, useEffect, useCallback } from 'react';
import i18n, { loadLanguage } from '@/i18n';

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

  const setPreferredLanguage = useCallback(async (lang: string) => {
    setLanguage(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    // Lazy-load locale then switch
    await loadLanguage(lang);
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
  cjy: 'Chinese, Jinyu',
  ja: 'Japanese',
  ko: 'Korean',
  lo: 'Lao',
  mag: 'Magahi',
  ar: 'Arabic',
  aec: "Arabic, Sa'idi Spoken",
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
  th: 'Thai',
  vi: 'Vietnamese',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  uk: 'Ukrainian',
  ur: 'Urdu',
  uz: 'Uzbek',
  cs: 'Czech',
  sv: 'Swedish',
  da: 'Danish',
  fi: 'Finnish',
  no: 'Norwegian',
  el: 'Greek',
  gsw: 'Swiss German',
  ka: 'Georgian',
  km: 'Khmer',
  kk: 'Kazakh',
  he: 'Hebrew',
  id: 'Indonesian',
  mr: 'Marathi',
  ms: 'Malay',
  ro: 'Romanian',
  hu: 'Hungarian',
  sk: 'Slovak',
  skr: 'Saraiki',
  sr: 'Serbian',
  bn: 'Bengali',
  be: 'Belarusian',
  bg: 'Bulgarian',
  my: 'Burmese',
  ne: 'Nepali',
  tl: 'Tagalog',
  pcm: 'Nigerian Pidgin',
  ha: 'Hausa',
  hr: 'Croatian',
  yo: 'Yoruba',
  ig: 'Igbo',
  arz: 'Egyptian Arabic',
  ary: 'Moroccan Arabic',
  fa: 'Persian',
  pa: 'Punjabi',
  om: 'Oromo',
  af: 'Afrikaans',
  si: 'Sinhala',
  qu: 'Quechua',
  am: 'Amharic',
  sw: 'Swahili',
  zu: 'Zulu',
};
