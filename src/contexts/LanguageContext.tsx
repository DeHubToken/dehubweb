import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
// English stays static — it's the default and the fallback for missing keys.
// Every OTHER locale is loaded on demand (see localeLoaders below): the 104
// static imports that used to live here made the DocsSurface chunk ~4.3 MB
// raw / 1.7 MB gz, downloaded by every organic /guides/* visitor.
import { en } from '@/i18n/en';

export type Language = 'en' | 'ar' | 'zh' | 'zh_tw' | 'tr' | 'es' | 'de' | 'fr' | 'bn' | 'ru' | 'pt' | 'hi' | 'ja' | 'ko' | 'id' | 'it' | 'nl' | 'pl' | 'vi' | 'th' | 'uk' | 'sw' | 'ms' | 'fa' | 'ta' | 'ur' | 'tl' | 'ro' | 'cs' | 'el' | 'hu' | 'gsw' | 'hr' | 'sv' | 'no' | 'da' | 'fi' | 'he' | 'zu' | 'qu' | 'ht' | 'yo' | 'am' | 'ig' | 'ha' | 'ka' | 'uz' | 'kk' | 'om' | 'my' | 'si' | 'be' | 'km' | 'ne' | 'pa' | 'te' | 'mr' | 'sr' | 'bg' | 'sk' | 'lo' | 'cjy' | 'aec' | 'mag' | 'skr' | 'hne' | 'acm' | 'tts' | 'acw' | 'ctg' | 'dcc' | 'dyu' | 'sck' | 'wes' | 'syl' | 'ajp' | 'ayn' | 'mnp' | 'pbt' | 'rkt' | 'mn' | 'bo' | 'lv' | 'et' | 'lt' | 'mi' | 'ca' | 'az' | 'ku' | 'jv' | 'so' | 'af' | 'kn' | 'yue' | 'wuu' | 'ti' | 'bho' | 'arz' | 'apd' | 'ary' | 'pcm' | 'ceb' | 'ml' | 'sd';

export interface LanguageOption {
  code: Language;
  label: string;
  nativeLabel: string;
  dir: 'ltr' | 'rtl';
}

export const languages: LanguageOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', dir: 'ltr' },
  { code: 'am', label: 'Amharic', nativeLabel: 'አማርኛ', dir: 'ltr' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', dir: 'rtl' },
  { code: 'aec', label: "Arabic (Sa'idi)", nativeLabel: 'عربي صعيدي', dir: 'rtl' },
  { code: 'acw', label: 'Arabic (Hijazi)', nativeLabel: 'عربي حجازي', dir: 'rtl' },
  { code: 'acm', label: 'Arabic (Mesopotamian)', nativeLabel: 'عربي عراقي', dir: 'rtl' },
  { code: 'ajp', label: 'Arabic (South Levantine)', nativeLabel: 'عربي شامي', dir: 'rtl' },
  { code: 'ayn', label: 'Arabic (Sanaani)', nativeLabel: 'عربي صنعاني', dir: 'rtl' },
  { code: 'be', label: 'Belarusian', nativeLabel: 'Беларуская', dir: 'ltr' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা', dir: 'ltr' },
  { code: 'bg', label: 'Bulgarian', nativeLabel: 'Български', dir: 'ltr' },
  { code: 'ca', label: 'Catalan', nativeLabel: 'Català', dir: 'ltr' },
  { code: 'zh', label: 'Chinese (Simplified)', nativeLabel: '简体中文', dir: 'ltr' },
  { code: 'cjy', label: 'Chinese (Jinyu)', nativeLabel: '晋语', dir: 'ltr' },
  { code: 'mnp', label: 'Chinese (Min Bei)', nativeLabel: '闽北语', dir: 'ltr' },
  { code: 'ctg', label: 'Chittagonian', nativeLabel: 'চাঁটগাঁইয়া', dir: 'ltr' },
  { code: 'zh_tw', label: 'Chinese (Traditional)', nativeLabel: '繁體中文', dir: 'ltr' },
  { code: 'hr', label: 'Croatian', nativeLabel: 'Hrvatski', dir: 'ltr' },
  { code: 'hne', label: 'Chhattisgarhi', nativeLabel: 'छत्तीसगढ़ी', dir: 'ltr' },
  { code: 'dcc', label: 'Deccan', nativeLabel: 'दक्कनी', dir: 'ltr' },
  { code: 'cs', label: 'Czech', nativeLabel: 'Čeština', dir: 'ltr' },
  { code: 'da', label: 'Danish', nativeLabel: 'Dansk', dir: 'ltr' },
  { code: 'dyu', label: 'Jula', nativeLabel: 'Julakan', dir: 'ltr' },
  { code: 'nl', label: 'Dutch', nativeLabel: 'Nederlands', dir: 'ltr' },
  { code: 'et', label: 'Estonian', nativeLabel: 'Eesti', dir: 'ltr' },
  { code: 'tl', label: 'Filipino', nativeLabel: 'Filipino', dir: 'ltr' },
  { code: 'fi', label: 'Finnish', nativeLabel: 'Suomi', dir: 'ltr' },
  { code: 'fr', label: 'French', nativeLabel: 'Français', dir: 'ltr' },
  { code: 'ka', label: 'Georgian', nativeLabel: 'ქართული', dir: 'ltr' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch', dir: 'ltr' },
  { code: 'el', label: 'Greek', nativeLabel: 'Ελληνικά', dir: 'ltr' },
  { code: 'ht', label: 'Haitian Creole', nativeLabel: 'Kreyòl Ayisyen', dir: 'ltr' },
  { code: 'ha', label: 'Hausa', nativeLabel: 'Hausa', dir: 'ltr' },
  { code: 'he', label: 'Hebrew', nativeLabel: 'עברית', dir: 'rtl' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', dir: 'ltr' },
  { code: 'hu', label: 'Hungarian', nativeLabel: 'Magyar', dir: 'ltr' },
  { code: 'ig', label: 'Igbo', nativeLabel: 'Igbo', dir: 'ltr' },
  { code: 'id', label: 'Indonesian', nativeLabel: 'Bahasa Indonesia', dir: 'ltr' },
  { code: 'kk', label: 'Kazakh', nativeLabel: 'Қазақша', dir: 'ltr' },
  { code: 'km', label: 'Khmer', nativeLabel: 'ខ្មែរ', dir: 'ltr' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano', dir: 'ltr' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語', dir: 'ltr' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어', dir: 'ltr' },
  { code: 'lo', label: 'Lao', nativeLabel: 'ລາວ', dir: 'ltr' },
  { code: 'lv', label: 'Latvian', nativeLabel: 'Latviešu', dir: 'ltr' },
  { code: 'lt', label: 'Lithuanian', nativeLabel: 'Lietuvių', dir: 'ltr' },
  { code: 'mag', label: 'Magahi', nativeLabel: 'मगही', dir: 'ltr' },
  { code: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം', dir: 'ltr' },
  { code: 'ms', label: 'Malay', nativeLabel: 'Bahasa Melayu', dir: 'ltr' },
  { code: 'mi', label: 'Māori', nativeLabel: 'Te Reo Māori', dir: 'ltr' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी', dir: 'ltr' },
  { code: 'my', label: 'Burmese', nativeLabel: 'မြန်မာဘာသာ', dir: 'ltr' },
  { code: 'no', label: 'Norwegian', nativeLabel: 'Norsk', dir: 'ltr' },
  { code: 'ne', label: 'Nepali', nativeLabel: 'नेपाली', dir: 'ltr' },
  { code: 'om', label: 'Oromo', nativeLabel: 'Afaan Oromoo', dir: 'ltr' },
  { code: 'pa', label: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ', dir: 'ltr' },
  { code: 'fa', label: 'Persian', nativeLabel: 'فارسی', dir: 'rtl' },
  { code: 'pbt', label: 'Pashto (Southern)', nativeLabel: 'پښتو', dir: 'rtl' },
  { code: 'wes', label: 'Pidgin (Cameroon)', nativeLabel: 'Kamtok', dir: 'ltr' },
  { code: 'pl', label: 'Polish', nativeLabel: 'Polski', dir: 'ltr' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português', dir: 'ltr' },
  { code: 'qu', label: 'Quechua', nativeLabel: 'Runasimi', dir: 'ltr' },
  { code: 'mn', label: 'Mongolian', nativeLabel: 'Монгол', dir: 'ltr' },
  { code: 'rkt', label: 'Rangpuri', nativeLabel: 'রংপুরী', dir: 'ltr' },
  { code: 'ro', label: 'Romanian', nativeLabel: 'Română', dir: 'ltr' },
  { code: 'skr', label: 'Saraiki', nativeLabel: 'سرائیکی', dir: 'rtl' },
  { code: 'sck', label: 'Sadri', nativeLabel: 'सदरी', dir: 'ltr' },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский', dir: 'ltr' },
  { code: 'sd', label: 'Sindhi', nativeLabel: 'سنڌي', dir: 'rtl' },
  { code: 'si', label: 'Sinhala', nativeLabel: 'සිංහල', dir: 'ltr' },
  { code: 'sk', label: 'Slovak', nativeLabel: 'Slovenčina', dir: 'ltr' },
  { code: 'sr', label: 'Serbian', nativeLabel: 'Српски', dir: 'ltr' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español', dir: 'ltr' },
  { code: 'sw', label: 'Swahili', nativeLabel: 'Kiswahili', dir: 'ltr' },
  { code: 'sv', label: 'Swedish', nativeLabel: 'Svenska', dir: 'ltr' },
  { code: 'syl', label: 'Sylheti', nativeLabel: 'ꠍꠤꠟꠐꠤ', dir: 'ltr' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు', dir: 'ltr' },
  { code: 'bo', label: 'Tibetan', nativeLabel: 'བོད་སྐད', dir: 'ltr' },
  { code: 'gsw', label: 'Swiss German', nativeLabel: 'Schwiizerdütsch', dir: 'ltr' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்', dir: 'ltr' },
  { code: 'th', label: 'Thai', nativeLabel: 'ไทย', dir: 'ltr' },
  { code: 'tts', label: 'Thai (Northeastern)', nativeLabel: 'อีสาน', dir: 'ltr' },
  { code: 'tr', label: 'Turkish', nativeLabel: 'Türkçe', dir: 'ltr' },
  { code: 'uk', label: 'Ukrainian', nativeLabel: 'Українська', dir: 'ltr' },
  { code: 'ur', label: 'Urdu', nativeLabel: 'اردو', dir: 'rtl' },
  { code: 'uz', label: 'Uzbek', nativeLabel: "O'zbekcha", dir: 'ltr' },
  { code: 'vi', label: 'Vietnamese', nativeLabel: 'Tiếng Việt', dir: 'ltr' },
  { code: 'yo', label: 'Yoruba', nativeLabel: 'Yorùbá', dir: 'ltr' },
  { code: 'zu', label: 'Zulu', nativeLabel: 'isiZulu', dir: 'ltr' },
  { code: 'af', label: 'Afrikaans', nativeLabel: 'Afrikaans', dir: 'ltr' },
  { code: 'az', label: 'Azerbaijani', nativeLabel: 'Azərbaycan', dir: 'ltr' },
  { code: 'arz', label: 'Arabic (Egyptian)', nativeLabel: 'عربي مصري', dir: 'rtl' },
  { code: 'apd', label: 'Arabic (Sudanese)', nativeLabel: 'عربي سوداني', dir: 'rtl' },
  { code: 'ary', label: 'Arabic (Moroccan)', nativeLabel: 'الدارجة', dir: 'rtl' },
  { code: 'bho', label: 'Bhojpuri', nativeLabel: 'भोजपुरी', dir: 'ltr' },
  { code: 'ceb', label: 'Cebuano', nativeLabel: 'Sinugbuanon', dir: 'ltr' },
  { code: 'jv', label: 'Javanese', nativeLabel: 'Basa Jawa', dir: 'ltr' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ', dir: 'ltr' },
  { code: 'ku', label: 'Kurdish', nativeLabel: 'Kurdî', dir: 'ltr' },
  { code: 'pcm', label: 'Nigerian Pidgin', nativeLabel: 'Naijá', dir: 'ltr' },
  { code: 'so', label: 'Somali', nativeLabel: 'Soomaali', dir: 'ltr' },
  { code: 'ti', label: 'Tigrinya', nativeLabel: 'ትግርኛ', dir: 'ltr' },
  { code: 'yue', label: 'Cantonese', nativeLabel: '粵語', dir: 'ltr' },
  { code: 'wuu', label: 'Wu Chinese', nativeLabel: '吳語', dir: 'ltr' },
];

type Translations = typeof en;
type PartialTranslations = { [K in keyof Translations]?: Partial<Translations[K]> };
type LocaleModule = Translations | PartialTranslations;

// Per-locale lazy chunks. Each entry's import specifier matches the module's
// own export name (every locale file exports its code, e.g. `export const ar`).
const localeLoaders: Record<Exclude<Language, 'en'>, () => Promise<LocaleModule>> = {
  ar: () => import('@/i18n/ar').then(m => m.ar),
  zh: () => import('@/i18n/zh').then(m => m.zh),
  zh_tw: () => import('@/i18n/zh_tw').then(m => m.zh_tw),
  tr: () => import('@/i18n/tr').then(m => m.tr),
  es: () => import('@/i18n/es').then(m => m.es),
  de: () => import('@/i18n/de').then(m => m.de),
  fr: () => import('@/i18n/fr').then(m => m.fr),
  bn: () => import('@/i18n/bn').then(m => m.bn),
  ru: () => import('@/i18n/ru').then(m => m.ru),
  pt: () => import('@/i18n/pt').then(m => m.pt),
  hi: () => import('@/i18n/hi').then(m => m.hi),
  ja: () => import('@/i18n/ja').then(m => m.ja),
  ko: () => import('@/i18n/ko').then(m => m.ko),
  id: () => import('@/i18n/id').then(m => m.id),
  it: () => import('@/i18n/it').then(m => m.it),
  nl: () => import('@/i18n/nl').then(m => m.nl),
  pl: () => import('@/i18n/pl').then(m => m.pl),
  vi: () => import('@/i18n/vi').then(m => m.vi),
  th: () => import('@/i18n/th').then(m => m.th),
  uk: () => import('@/i18n/uk').then(m => m.uk),
  sw: () => import('@/i18n/sw').then(m => m.sw),
  ms: () => import('@/i18n/ms').then(m => m.ms),
  fa: () => import('@/i18n/fa').then(m => m.fa),
  ta: () => import('@/i18n/ta').then(m => m.ta),
  ur: () => import('@/i18n/ur').then(m => m.ur),
  tl: () => import('@/i18n/tl').then(m => m.tl),
  ro: () => import('@/i18n/ro').then(m => m.ro),
  cs: () => import('@/i18n/cs').then(m => m.cs),
  el: () => import('@/i18n/el').then(m => m.el),
  hu: () => import('@/i18n/hu').then(m => m.hu),
  gsw: () => import('@/i18n/gsw').then(m => m.gsw),
  hr: () => import('@/i18n/hr').then(m => m.hr),
  sv: () => import('@/i18n/sv').then(m => m.sv),
  no: () => import('@/i18n/no').then(m => m.no),
  da: () => import('@/i18n/da').then(m => m.da),
  fi: () => import('@/i18n/fi').then(m => m.fi),
  he: () => import('@/i18n/he').then(m => m.he),
  zu: () => import('@/i18n/zu').then(m => m.zu),
  qu: () => import('@/i18n/qu').then(m => m.qu),
  ht: () => import('@/i18n/ht').then(m => m.ht),
  yo: () => import('@/i18n/yo').then(m => m.yo),
  am: () => import('@/i18n/am').then(m => m.am),
  ig: () => import('@/i18n/ig').then(m => m.ig),
  ha: () => import('@/i18n/ha').then(m => m.ha),
  ka: () => import('@/i18n/ka').then(m => m.ka),
  uz: () => import('@/i18n/uz').then(m => m.uz),
  kk: () => import('@/i18n/kk').then(m => m.kk),
  om: () => import('@/i18n/om').then(m => m.om),
  my: () => import('@/i18n/my').then(m => m.my),
  si: () => import('@/i18n/si').then(m => m.si),
  be: () => import('@/i18n/be').then(m => m.be),
  km: () => import('@/i18n/km').then(m => m.km),
  ne: () => import('@/i18n/ne').then(m => m.ne),
  pa: () => import('@/i18n/pa').then(m => m.pa),
  te: () => import('@/i18n/te').then(m => m.te),
  mr: () => import('@/i18n/mr').then(m => m.mr),
  sr: () => import('@/i18n/sr').then(m => m.sr),
  bg: () => import('@/i18n/bg').then(m => m.bg),
  sk: () => import('@/i18n/sk').then(m => m.sk),
  lo: () => import('@/i18n/lo').then(m => m.lo),
  cjy: () => import('@/i18n/cjy').then(m => m.cjy),
  aec: () => import('@/i18n/aec').then(m => m.aec),
  mag: () => import('@/i18n/mag').then(m => m.mag),
  skr: () => import('@/i18n/skr').then(m => m.skr),
  hne: () => import('@/i18n/hne').then(m => m.hne),
  acm: () => import('@/i18n/acm').then(m => m.acm),
  tts: () => import('@/i18n/tts').then(m => m.tts),
  acw: () => import('@/i18n/acw').then(m => m.acw),
  ctg: () => import('@/i18n/ctg').then(m => m.ctg),
  dcc: () => import('@/i18n/dcc').then(m => m.dcc),
  dyu: () => import('@/i18n/dyu').then(m => m.dyu),
  sck: () => import('@/i18n/sck').then(m => m.sck),
  wes: () => import('@/i18n/wes').then(m => m.wes),
  syl: () => import('@/i18n/syl').then(m => m.syl),
  ajp: () => import('@/i18n/ajp').then(m => m.ajp),
  ayn: () => import('@/i18n/ayn').then(m => m.ayn),
  mnp: () => import('@/i18n/mnp').then(m => m.mnp),
  pbt: () => import('@/i18n/pbt').then(m => m.pbt),
  rkt: () => import('@/i18n/rkt').then(m => m.rkt),
  mn: () => import('@/i18n/mn').then(m => m.mn),
  bo: () => import('@/i18n/bo').then(m => m.bo),
  lv: () => import('@/i18n/lv').then(m => m.lv),
  et: () => import('@/i18n/et').then(m => m.et),
  lt: () => import('@/i18n/lt').then(m => m.lt),
  mi: () => import('@/i18n/mi').then(m => m.mi),
  ca: () => import('@/i18n/ca').then(m => m.ca),
  az: () => import('@/i18n/az').then(m => m.az),
  ku: () => import('@/i18n/ku').then(m => m.ku),
  jv: () => import('@/i18n/jv').then(m => m.jv),
  so: () => import('@/i18n/so').then(m => m.so),
  af: () => import('@/i18n/af').then(m => m.af),
  kn: () => import('@/i18n/kn').then(m => m.kn),
  yue: () => import('@/i18n/yue').then(m => m.yue),
  wuu: () => import('@/i18n/wuu').then(m => m.wuu),
  ti: () => import('@/i18n/ti').then(m => m.ti),
  bho: () => import('@/i18n/bho').then(m => m.bho),
  arz: () => import('@/i18n/arz').then(m => m.arz),
  apd: () => import('@/i18n/apd').then(m => m.apd),
  ary: () => import('@/i18n/ary').then(m => m.ary),
  pcm: () => import('@/i18n/pcm').then(m => m.pcm),
  ceb: () => import('@/i18n/ceb').then(m => m.ceb),
  ml: () => import('@/i18n/ml').then(m => m.ml),
  sd: () => import('@/i18n/sd').then(m => m.sd),
};

// Already-loaded locales, so switching back is synchronous (no English flash).
const loadedLocales = new Map<Language, LocaleModule>([['en', en]]);

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  dir: 'ltr' | 'rtl';
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('docs-language');
    return (saved as Language) || 'en';
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('docs-language', lang);
  }, []);

  // Active locale object. English (or a previously loaded locale) is available
  // synchronously; a fresh locale loads async and English shows until it lands.
  const [translations, setTranslations] = useState<LocaleModule>(
    () => loadedLocales.get(language) ?? en
  );
  useEffect(() => {
    const cached = loadedLocales.get(language);
    if (cached) {
      setTranslations(cached);
      return;
    }
    let cancelled = false;
    localeLoaders[language as Exclude<Language, 'en'>]?.()
      .then(mod => {
        loadedLocales.set(language, mod);
        if (!cancelled) setTranslations(mod);
      })
      .catch(() => { /* keep English fallback on a failed chunk load */ });
    return () => { cancelled = true; };
  }, [language]);

  const dir = languages.find(l => l.code === language)?.dir || 'ltr';

  useEffect(() => {
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', language);
  }, [language, dir]);

  const t = useCallback((key: string): any => {
    const keys = key.split('.');
    let value: any = translations;
    for (const k of keys) {
      value = value?.[k];
    }
    if (typeof value === 'string' || Array.isArray(value)) return value;

    // Fallback to English
    let fallback: any = en;
    for (const k of keys) {
      fallback = fallback?.[k];
    }
    if (typeof fallback === 'string' || Array.isArray(fallback)) return fallback;
    return key;
  }, [translations]);

  const value = useMemo(
    () => ({ language, setLanguage, t, dir }),
    [language, setLanguage, t, dir]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
};
