/**
 * i18n Configuration
 * ==================
 * Static translation files for UI labels.
 * Syncs with useUserLanguage hook for language preference.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import pt from './locales/pt.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import ru from './locales/ru.json';
import ar from './locales/ar.json';
import hi from './locales/hi.json';
import tr from './locales/tr.json';
import ro from './locales/ro.json';
import bn from './locales/bn.json';
import id from './locales/id.json';
import vi from './locales/vi.json';
import th from './locales/th.json';
import it from './locales/it.json';
import nl from './locales/nl.json';
import pl from './locales/pl.json';
import uk from './locales/uk.json';
import tl from './locales/tl.json';
import ms from './locales/ms.json';
import pcm from './locales/pcm.json';
import ha from './locales/ha.json';
import yo from './locales/yo.json';
import ig from './locales/ig.json';
import arz from './locales/arz.json';
import ary from './locales/ary.json';
import fa from './locales/fa.json';
import af from './locales/af.json';
import qu from './locales/qu.json';
import am from './locales/am.json';

const STORAGE_KEY = 'user-preferred-language';

// Read cached language (same key as useUserLanguage hook)
const savedLang = localStorage.getItem(STORAGE_KEY);
const browserLang = navigator.language?.split('-')[0] || 'en';
const defaultLang = savedLang || browserLang;

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'tl', name: 'Tagalog', nativeName: 'Tagalog' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
  { code: 'pcm', name: 'Nigerian Pidgin', nativeName: 'Naijá' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá' },
  { code: 'ig', name: 'Igbo', nativeName: 'Igbo' },
  { code: 'arz', name: 'Egyptian Arabic', nativeName: 'مصرى' },
  { code: 'ary', name: 'Moroccan Arabic', nativeName: 'الدارجة' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی' },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans' },
  { code: 'qu', name: 'Quechua', nativeName: 'Runasimi' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ' },
];

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
    de: { translation: de },
    pt: { translation: pt },
    zh: { translation: zh },
    ja: { translation: ja },
    ko: { translation: ko },
    ru: { translation: ru },
    ar: { translation: ar },
    hi: { translation: hi },
    tr: { translation: tr },
    ro: { translation: ro },
    bn: { translation: bn },
    id: { translation: id },
    vi: { translation: vi },
    th: { translation: th },
    it: { translation: it },
    nl: { translation: nl },
    pl: { translation: pl },
    uk: { translation: uk },
    tl: { translation: tl },
    ms: { translation: ms },
    pcm: { translation: pcm },
    ha: { translation: ha },
    yo: { translation: yo },
    ig: { translation: ig },
    arz: { translation: arz },
    ary: { translation: ary },
    fa: { translation: fa },
    af: { translation: af },
    qu: { translation: qu },
    am: { translation: am },
  },
  lng: defaultLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
