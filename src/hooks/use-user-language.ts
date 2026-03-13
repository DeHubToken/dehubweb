/**
 * User Language Detection Hook
 * ============================
 * Detects user's preferred language from browser settings.
 * Caches result in localStorage for consistency.
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import i18n, { loadLanguage } from '@/i18n';

const STORAGE_KEY = 'user-preferred-language';

export function useUserLanguage() {
  const [language, setLanguage] = useState<string>('en');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initLanguage = async () => {
      // Check localStorage first
      const cached = localStorage.getItem(STORAGE_KEY);
      const lang = cached || navigator.language?.split('-')[0] || 'en';
      
      if (!cached) {
        localStorage.setItem(STORAGE_KEY, lang);
      }
      
      setLanguage(lang);
      
      // Always ensure i18n is synced to the correct language
      if (lang !== 'en' && i18n.language !== lang) {
        const ok = await loadLanguage(lang);
        if (ok) {
          await i18n.changeLanguage(lang);
        }
      }
      
      setIsLoading(false);
    };
    
    initLanguage();
  }, []);

  const setPreferredLanguage = useCallback(async (lang: string) => {
    const ok = await loadLanguage(lang);
    if (!ok) {
      toast.error('Could not load language. Please try again.');
      return;
    }
    setLanguage(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    await i18n.changeLanguage(lang);
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
  hne: 'Chhattisgarhi',
  cjy: 'Chinese, Jinyu',
  mnp: 'Chinese, Min Bei',
  ctg: 'Chittagonian',
  ja: 'Japanese',
  jv: 'Javanese',
  ko: 'Korean',
  lo: 'Lao',
  mag: 'Magahi',
  ar: 'Arabic',
  az: 'Azerbaijani',
  aec: "Arabic, Sa'idi Spoken",
  acm: 'Arabic, Mesopotamian Spoken',
  acw: 'Arabic, Hijazi Spoken',
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
  th: 'Thai',
  tts: 'Thai, Northeastern',
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
  dcc: 'Deccan',
  dyu: 'Jula',
  fi: 'Finnish',
  no: 'Norwegian',
  el: 'Greek',
  gsw: 'Swiss German',
  ka: 'Georgian',
  km: 'Khmer',
  kk: 'Kazakh',
  kn: 'Kannada',
  ku: 'Kurdish',
  he: 'Hebrew',
  id: 'Indonesian',
  mr: 'Marathi',
  ms: 'Malay',
  ro: 'Romanian',
  hu: 'Hungarian',
  sk: 'Slovak',
  skr: 'Saraiki',
  sdr: 'Sadri',
  syl: 'Sylheti',
  sr: 'Serbian',
  bn: 'Bengali',
  bho: 'Bhojpuri',
  be: 'Belarusian',
  bg: 'Bulgarian',
  my: 'Burmese',
  ne: 'Nepali',
  tl: 'Tagalog',
  pcm: 'Nigerian Pidgin',
  wes: 'Pidgin, Cameroon',
  ha: 'Hausa',
  hr: 'Croatian',
  yo: 'Yoruba',
  ig: 'Igbo',
  arz: 'Egyptian Arabic',
  ajp: 'Arabic, South Levantine Spoken',
  ayn: 'Arabic, Sanaani Spoken',
  apd: 'Arabic, Sudanese Spoken',
  ary: 'Moroccan Arabic',
  fa: 'Persian',
  pbt: 'Pashto, Southern',
  rkt: 'Rangpuri',
  pa: 'Punjabi',
  om: 'Oromo',
  af: 'Afrikaans',
  si: 'Sinhala',
  so: 'Somali',
  qu: 'Quechua',
  am: 'Amharic',
  sw: 'Swahili',
  zu: 'Zulu',
  yue: 'Cantonese',
  wuu: 'Wu Chinese',
  ti: 'Tigrinya',
  ca: 'Catalan',
  lt: 'Lithuanian',
  et: 'Estonian',
  lv: 'Latvian',
  mi: 'Maori',
  gu: 'Gujarati',
  ml: 'Malayalam',
  or: 'Odia',
  sd: 'Sindhi',
  sq: 'Albanian',
  ug: 'Uyghur',
  tg: 'Tajik',
  tk: 'Turkmen',
  hy: 'Armenian',
  ky: 'Kyrgyz',
};
