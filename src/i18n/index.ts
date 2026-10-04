import manifest from './locale-manifest.json';
/**
 * i18n Configuration
 * ==================
 * Only English is bundled. All other languages are lazy-loaded on demand.
 * Syncs with useUserLanguage hook for language preference.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './core-en.json';
import { humanizeTranslationKey } from './missing-key-fallback';
import { fillMissingPluralForms } from './plural-fallback';

const STORAGE_KEY = 'user-preferred-language';

// Read cached language (same key as useUserLanguage hook)
const savedLang = localStorage.getItem(STORAGE_KEY);
const browserLang = navigator.language?.split('-')[0] || 'en';
let defaultLang = savedLang || browserLang;

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  { code: 'dcc', name: 'Deccan', nativeName: 'دکنی' },
  { code: 'dyu', name: 'Jula', nativeName: 'Julakan' },
  { code: 'om', name: 'Oromo', nativeName: 'Afaan Oromoo' },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'acm', name: 'Arabic, Mesopotamian Spoken', nativeName: 'عراقي' },
  { code: 'acw', name: 'Arabic, Hijazi Spoken', nativeName: 'حجازي' },
  { code: 'aec', name: "Arabic, Sa'idi Spoken", nativeName: 'صعيدي' },
  { code: 'ajp', name: 'Arabic, South Levantine Spoken', nativeName: 'شامي' },
  { code: 'ayn', name: 'Arabic, Sanaani Spoken', nativeName: 'صنعاني' },
  { code: 'apd', name: 'Arabic, Sudanese Spoken', nativeName: 'عربي سوداني' },
  { code: 'bho', name: 'Bhojpuri', nativeName: 'भोजपुरी' },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български' },
  { code: 'my', name: 'Burmese', nativeName: 'မြန်မာ' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'cjy', name: 'Chinese, Jinyu', nativeName: '晋语' },
  { code: 'mnp', name: 'Chinese, Min Bei', nativeName: '闽北语' },
  { code: 'ctg', name: 'Chittagonian', nativeName: 'চাটগাঁইয়া' },
  { code: 'hne', name: 'Chhattisgarhi', nativeName: 'छत्तीसगढ़ी' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'arz', name: 'Egyptian Arabic', nativeName: 'مصرى' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'gsw', name: 'Swiss German', nativeName: 'Schwyzerdütsch' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
  { code: 'ig', name: 'Igbo', nativeName: 'Igbo' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'jv', name: 'Javanese', nativeName: 'Basa Jawa' },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақша' },
  { code: 'ku', name: 'Kurdish', nativeName: 'Kurdî' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'lo', name: 'Lao', nativeName: 'ລາວ' },
  { code: 'mag', name: 'Magahi', nativeName: 'मगही' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'mn', name: 'Mongolian', nativeName: 'Монгол' },
  { code: 'mg', name: 'Malagasy', nativeName: 'Malagasy' },
  { code: 'yue', name: 'Cantonese', nativeName: '廣東話' },
  { code: 'wuu', name: 'Wu Chinese', nativeName: '吴语' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
  { code: 'ary', name: 'Moroccan Arabic', nativeName: 'الدارجة' },
  { code: 'km', name: 'Khmer', nativeName: 'ខ្មែរ' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली' },
  { code: 'pcm', name: 'Nigerian Pidgin', nativeName: 'Naijá' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی' },
  { code: 'wes', name: 'Pidgin, Cameroon', nativeName: 'Kamtok' },
  { code: 'pbt', name: 'Pashto, Southern', nativeName: 'پښتو' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'qu', name: 'Quechua', nativeName: 'Runasimi' },
  { code: 'rkt', name: 'Rangpuri', nativeName: 'রংপুরী' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'sdr', name: 'Sadri', nativeName: 'سدری' },
  { code: 'skr', name: 'Saraiki', nativeName: 'سرائیکی' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල' },
  { code: 'so', name: 'Somali', nativeName: 'Soomaali' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
  { code: 'syl', name: 'Sylheti', nativeName: 'ꠍꠤꠟꠐꠤ' },
  { code: 'tl', name: 'Tagalog', nativeName: 'Tagalog' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'tts', name: 'Thai, Northeastern', nativeName: 'อีสาน' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
  { code: 'uz', name: 'Uzbek', nativeName: 'Oʻzbek' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'sa', name: 'Sanskrit', nativeName: 'संस्कृतम्' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu' },
  { code: 'ti', name: 'Tigrinya', nativeName: 'ትግርኛ' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu' },
  { code: 'mi', name: 'Maori', nativeName: 'Māori' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
  { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي' },
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip' },
  { code: 'ug', name: 'Uyghur', nativeName: 'ئۇيغۇرچە' },
  { code: 'tg', name: 'Tajik', nativeName: 'Тоҷикӣ' },
  { code: 'tk', name: 'Turkmen', nativeName: 'Türkmen' },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն' },
  { code: 'ky', name: 'Kyrgyz', nativeName: 'Кыргызча' },
];

// ?hl=<code> is the URL a localised search result lands on: the crawler is
// served that page in that language with an hreflang cluster (see
// CLOUDFLARE_WORKER_SEO.js). Someone arriving on it asked for that language,
// so for this visit it beats the saved preference, and it becomes the saved
// preference so the next page keeps it after the router drops the parameter.
const urlLang = (() => {
  try {
    const raw = (new URLSearchParams(window.location.search).get('hl') || '').toLowerCase();
    return SUPPORTED_LANGUAGES.some((l) => l.code === raw) ? raw : '';
  } catch {
    return '';
  }
})();
if (urlLang) {
  defaultLang = urlLang;
  try {
    localStorage.setItem(STORAGE_KEY, urlLang);
  } catch {
    /* private mode: the visit still gets the language, the next one will not */
  }
}

// Dynamic import map for lazy loading locale files
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Languages written right-to-left. Keep in sync with SUPPORTED_LANGUAGES.
export const RTL_LANGUAGES = new Set([
  'ar', 'acm', 'acw', 'aec', 'ajp', 'ayn', 'apd', 'ary', 'arz', // Arabic + dialects
  'he', 'fa', 'ur', 'pbt', 'sd', 'skr', 'ug', 'dcc', 'sdr',
]);

export function applyDocumentDirection(lang: string): void {
  document.documentElement.dir = RTL_LANGUAGES.has(lang) ? 'rtl' : 'ltr';
}

const packOrigin = '';
const readPackCache = async (key: string) => { try { return localStorage.getItem(`locale-pack:${key}`); } catch { return null; } };
const writePackCache = async (key: string, value: string) => { try { localStorage.setItem(`locale-pack:${key}`, value); } catch {} };

const loadedPacks = new Set<string>([`${manifest.version}:en:core`]);
const retryAfter = new Map<string, number>();
const pendingPacks = new Map<string, Promise<boolean>>();
async function loadPack(lang: string, group: string): Promise<boolean> {
  if (!manifest.languages.includes(lang)) return false;
  const key = `${manifest.version}:${lang}:${group}`;
  if (loadedPacks.has(key)) return true;
  if ((retryAfter.get(key) || 0) > Date.now()) return false;
  if (pendingPacks.has(key)) return pendingPacks.get(key)!;
  const pending = (async () => {
    try {
      const cached = await readPackCache(key);
      let data: Record<string, unknown>;
      if (cached) data = JSON.parse(cached);
      else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(`${packOrigin}/locale-packs/web/${manifest.version}/${lang}/${group}.json`, { signal: controller.signal });
          if (!response.ok) throw new Error('Locale pack unavailable');
          data = await response.json();
        } finally { clearTimeout(timeout); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
        await writePackCache(key, JSON.stringify(data));
      }
      // Mark first: resource events rerender consumers synchronously.
      loadedPacks.add(key);
      i18n.addResourceBundle(lang, 'translation', data, true, true);
      fillMissingPluralForms(i18n, lang);
      return true;
    } catch { retryAfter.set(key, Date.now() + 30_000); return false; }
    finally { pendingPacks.delete(key); }
  })();
  pendingPacks.set(key, pending);
  return pending;
}
const requestedGroups = new Set<string>(['core']);
const groupForKey = (key: string) => (manifest.groups as Record<string, string>)[key.split('.')[0]];
i18n.use({
  type: 'postProcessor', name: 'featurePacks',
  process(value: string, keys: string[]) {
    const group = groupForKey(keys[0] || '');
    if (group) {
      requestedGroups.add(group);
      void loadPack(i18n.language || 'en', group);
      if (i18n.language !== 'en') void loadPack('en', group);
    }
    return value;
  },
});
export async function loadLanguage(lang: string): Promise<boolean> {
  const results = await Promise.all([...requestedGroups].map(group => loadPack(lang, group)));
  return results.every(Boolean);
}
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: 'en', // start with English, then switch after lazy load
  fallbackLng: 'en',
  postProcess: ['featurePacks'],
  react: { bindI18nStore: 'added' },
  parseMissingKeyHandler: humanizeTranslationKey,
  interpolation: { escapeValue: false },
});

// English needs one pass too: governance.proposalCount and postInfo.owner ship
// only an _other, so t(key, { count: 1 }) resolved to nothing and rendered the
// humanised key.
fillMissingPluralForms(i18n, 'en');

// Keep <html dir> in sync so RTL languages (Arabic & dialects, Hebrew,
// Persian, Urdu, ...) actually lay out right-to-left in the app. The docs'
// LanguageContext manages dir independently on /docs routes.
i18n.on('languageChanged', applyDocumentDirection);

// Languages whose locale file is not filled in fall back to Google's translate
// widget rather than to English. Loaded lazily and only when one of those
// languages is actually selected — a viewer on a translated language never
// fetches it, never contacts Google, and never gets its DOM patch.
i18n.on('languageChanged', (lang) => {
  import('./translate-widget-fallback')
    .then((m) => m.syncTranslateWidget(lang))
    .catch(() => undefined);
});

// If user's preferred language isn't English, lazy-load it immediately.
// Guard: only apply startup language if the user hasn't manually changed it in the meantime.
if (defaultLang && defaultLang !== 'en') {
  loadLanguage(defaultLang).then((ok) => {
    if (ok && i18n.language === 'en') {
      i18n.changeLanguage(defaultLang);
    }
  });
}

// Staking / community / auth-toast bundles are merged per-language inside
// loadLanguage() above — no static import, so they stay off the entry chunk.

export default i18n;
