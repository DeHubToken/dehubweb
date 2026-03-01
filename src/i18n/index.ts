/**
 * i18n Configuration
 * ==================
 * Only English is bundled. All other languages are lazy-loaded on demand.
 * Syncs with useUserLanguage hook for language preference.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

const STORAGE_KEY = 'user-preferred-language';

// Read cached language (same key as useUserLanguage hook)
const savedLang = localStorage.getItem(STORAGE_KEY);
const browserLang = navigator.language?.split('-')[0] || 'en';
const defaultLang = savedLang || browserLang;

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'om', name: 'Oromo', nativeName: 'Afaan Oromoo' },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'arz', name: 'Egyptian Arabic', nativeName: 'مصرى' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'gsw', name: 'Swiss German', nativeName: 'Schwyzerdütsch' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski' },
  { code: 'ig', name: 'Igbo', nativeName: 'Igbo' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული' },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақша' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
  { code: 'ary', name: 'Moroccan Arabic', nativeName: 'الدارجة' },
  { code: 'pcm', name: 'Nigerian Pidgin', nativeName: 'Naijá' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'qu', name: 'Quechua', nativeName: 'Runasimi' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
  { code: 'tl', name: 'Tagalog', nativeName: 'Tagalog' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'uz', name: 'Uzbek', nativeName: 'Oʻzbek' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'sa', name: 'Sanskrit', nativeName: 'संस्कृतम्' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu' },
];

// Dynamic import map for lazy loading locale files
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const localeLoaders: Record<string, () => Promise<{ default: any }>> = {
  es: () => import('./locales/es.json'),
  fr: () => import('./locales/fr.json'),
  de: () => import('./locales/de.json'),
  pt: () => import('./locales/pt.json'),
  zh: () => import('./locales/zh.json'),
  ja: () => import('./locales/ja.json'),
  ko: () => import('./locales/ko.json'),
  ru: () => import('./locales/ru.json'),
  ar: () => import('./locales/ar.json'),
  hi: () => import('./locales/hi.json'),
  tr: () => import('./locales/tr.json'),
  ro: () => import('./locales/ro.json'),
  bn: () => import('./locales/bn.json'),
  id: () => import('./locales/id.json'),
  vi: () => import('./locales/vi.json'),
  th: () => import('./locales/th.json'),
  it: () => import('./locales/it.json'),
  nl: () => import('./locales/nl.json'),
  pl: () => import('./locales/pl.json'),
  uk: () => import('./locales/uk.json'),
  uz: () => import('./locales/uz.json'),
  tl: () => import('./locales/tl.json'),
  ms: () => import('./locales/ms.json'),
  pcm: () => import('./locales/pcm.json'),
  ha: () => import('./locales/ha.json'),
  hr: () => import('./locales/hr.json'),
  yo: () => import('./locales/yo.json'),
  ig: () => import('./locales/ig.json'),
  arz: () => import('./locales/arz.json'),
  ary: () => import('./locales/ary.json'),
  fa: () => import('./locales/fa.json'),
  af: () => import('./locales/af.json'),
  gsw: () => import('./locales/gsw.json'),
  el: () => import('./locales/el.json'),
  ka: () => import('./locales/ka.json'),
  kk: () => import('./locales/kk.json'),
  qu: () => import('./locales/qu.json'),
  am: () => import('./locales/am.json'),
  sa: () => import('./locales/sa.json'),
  om: () => import('./locales/om.json'),
  sw: () => import('./locales/sw.json'),
  zu: () => import('./locales/zu.json'),
};

/**
 * Lazy-load a locale's translations. Returns immediately if already loaded.
 */
export async function loadLanguage(lang: string): Promise<void> {
  if (lang === 'en') return; // already bundled
  if (i18n.hasResourceBundle(lang, 'translation')) return; // already loaded
  const loader = localeLoaders[lang];
  if (!loader) return; // unsupported language, will fall back to en
  try {
    const module = await loader();
    i18n.addResourceBundle(lang, 'translation', module.default, true, true);
  } catch (err) {
    console.warn(`[i18n] Failed to load locale "${lang}", falling back to English`, err);
  }
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: 'en', // start with English, then switch after lazy load
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// If user's preferred language isn't English, lazy-load it immediately
if (defaultLang && defaultLang !== 'en') {
  loadLanguage(defaultLang).then(() => {
    i18n.changeLanguage(defaultLang);
  });
}

export default i18n;
