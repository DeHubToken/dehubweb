import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { en } from '@/i18n/en';
import { ar } from '@/i18n/ar';
import { zh } from '@/i18n/zh';
import { zh_tw } from '@/i18n/zh_tw';
import { tr } from '@/i18n/tr';
import { es } from '@/i18n/es';
import { de } from '@/i18n/de';
import { fr } from '@/i18n/fr';
import { bn } from '@/i18n/bn';
import { ru } from '@/i18n/ru';
import { pt } from '@/i18n/pt';
import { hi } from '@/i18n/hi';
import { ja } from '@/i18n/ja';
import { ko } from '@/i18n/ko';
import { id } from '@/i18n/id';
import { it } from '@/i18n/it';
import { nl } from '@/i18n/nl';
import { pl } from '@/i18n/pl';
import { vi } from '@/i18n/vi';
import { th } from '@/i18n/th';
import { uk } from '@/i18n/uk';
import { sw } from '@/i18n/sw';
import { ms } from '@/i18n/ms';
import { fa } from '@/i18n/fa';
import { ta } from '@/i18n/ta';
import { ur } from '@/i18n/ur';
import { tl } from '@/i18n/tl';
import { ro } from '@/i18n/ro';
import { cs } from '@/i18n/cs';
import { el } from '@/i18n/el';
import { hu } from '@/i18n/hu';
import { gsw } from '@/i18n/gsw';
import { hr } from '@/i18n/hr';
import { sv } from '@/i18n/sv';
import { no } from '@/i18n/no';
import { da } from '@/i18n/da';
import { fi } from '@/i18n/fi';
import { he } from '@/i18n/he';
import { zu } from '@/i18n/zu';
import { qu } from '@/i18n/qu';
import { ht } from '@/i18n/ht';
import { yo } from '@/i18n/yo';
import { am } from '@/i18n/am';
import { ig } from '@/i18n/ig';
import { ha } from '@/i18n/ha';
import { ka } from '@/i18n/ka';
import { uz } from '@/i18n/uz';
import { kk } from '@/i18n/kk';
import { om } from '@/i18n/om';
import { my } from '@/i18n/my';
import { si } from '@/i18n/si';
import { be } from '@/i18n/be';
import { km } from '@/i18n/km';
import { ne } from '@/i18n/ne';
import { pa } from '@/i18n/pa';
import { te } from '@/i18n/te';
import { mr } from '@/i18n/mr';
import { sr } from '@/i18n/sr';
import { bg } from '@/i18n/bg';
import { sk } from '@/i18n/sk';
import { lo } from '@/i18n/lo';
import { cjy } from '@/i18n/cjy';
import { aec } from '@/i18n/aec';
import { mag } from '@/i18n/mag';
import { skr } from '@/i18n/skr';
import { hne } from '@/i18n/hne';
import { acm } from '@/i18n/acm';
import { tts } from '@/i18n/tts';
import { acw } from '@/i18n/acw';
import { ctg } from '@/i18n/ctg';
import { dcc } from '@/i18n/dcc';
import { dyu } from '@/i18n/dyu';
import { sck } from '@/i18n/sck';
import { wes } from '@/i18n/wes';
import { syl } from '@/i18n/syl';
import { ajp } from '@/i18n/ajp';
import { ayn } from '@/i18n/ayn';
import { mnp } from '@/i18n/mnp';
import { pbt } from '@/i18n/pbt';
import { rkt } from '@/i18n/rkt';
import { mn } from '@/i18n/mn';
import { bo } from '@/i18n/bo';
import { lv } from '@/i18n/lv';
import { et } from '@/i18n/et';
import { lt } from '@/i18n/lt';
import { mi } from '@/i18n/mi';
import { ca } from '@/i18n/ca';
import { az } from '@/i18n/az';
import { ku } from '@/i18n/ku';
import { jv } from '@/i18n/jv';
import { so } from '@/i18n/so';
import { af } from '@/i18n/af';
import { kn } from '@/i18n/kn';
import { yue } from '@/i18n/yue';
import { wuu } from '@/i18n/wuu';
import { ti } from '@/i18n/ti';
import { bho } from '@/i18n/bho';
import { arz } from '@/i18n/arz';
import { apd } from '@/i18n/apd';
import { ary } from '@/i18n/ary';
import { pcm } from '@/i18n/pcm';
import { ceb } from '@/i18n/ceb';
import { ml } from '@/i18n/ml';
import { sd } from '@/i18n/sd';

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

const translationMap: Record<Language, Translations | PartialTranslations> = { en, ar, zh, zh_tw, tr, es, de, fr, bn, ru, pt, hi, ja, ko, id, it, nl, pl, vi, th, uk, sw, ms, fa, ta, ur, tl, ro, cs, el, hu, gsw, hr, sv, no, da, fi, he, zu, qu, ht, yo, am, ig, ha, ka, uz, kk, om, my, si, be, km, ne, pa, te, mr, sr, bg, sk, lo, cjy, aec, mag, skr, hne, acm, tts, acw, ctg, dcc, dyu, sck, wes, syl, ajp, ayn, mnp, pbt, rkt, mn, bo, lv, et, lt, mi, ca, az, ku, jv, so, af, kn, yue, wuu, ti, bho, arz, apd, ary, pcm, ceb, ml, sd };

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

  const dir = languages.find(l => l.code === language)?.dir || 'ltr';

  useEffect(() => {
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', language);
  }, [language, dir]);

  const t = useCallback((key: string): any => {
    const translations = translationMap[language];
    const keys = key.split('.');
    let value: any = translations;
    for (const k of keys) {
      value = value?.[k];
    }
    if (typeof value === 'string' || Array.isArray(value)) return value;
    
    // Fallback to English
    let fallback: any = translationMap.en;
    for (const k of keys) {
      fallback = fallback?.[k];
    }
    if (typeof fallback === 'string' || Array.isArray(fallback)) return fallback;
    return key;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, dir }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
};
