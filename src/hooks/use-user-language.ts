import { useTranslation as _useCopy } from 'react-i18next';
/**
 * User Language Detection Hook
 * ============================
 * Detects user's preferred language from browser settings.
 * Caches result in localStorage for consistency.
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import i18n, { loadLanguage } from '@/i18n';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import {
  LANGUAGE_STORAGE_KEY,
  applyResolvedLanguage,
  resolveLanguage,
  subscribeToLanguage,
} from '@/lib/user-language-store';
import { translateCopy as _translateCopy } from '@/i18n/copy';

const STORAGE_KEY = LANGUAGE_STORAGE_KEY;

/**
 * The side effects that go with that language — <html lang> and the i18n
 * bundle. Same reasoning: one app, one run, however many components ask.
 */
let bootstrap: Promise<void> | null = null;

function bootstrapLanguage(): Promise<void> {
  if (bootstrap) return bootstrap;
  bootstrap = (async () => {
    const lang = resolveLanguage();

    // Keep <html lang="..."> in sync for SEO/accessibility audits
    document.documentElement.lang = lang;

    // Always ensure i18n is synced to the correct language.
    // Re-check i18n.language AFTER the async load in case the module-level
    // initializer in i18n/index.ts already called changeLanguage while we awaited.
    if (lang !== 'en' && i18n.language !== lang) {
      const ok = await loadLanguage(lang);
      if (ok && i18n.language !== lang) {
        await i18n.changeLanguage(lang);
      }
    }
  })();
  return bootstrap;
}

export function useUserLanguage() {
  const { t: _copy } = _useCopy();
  // Correct on the very first render — see the store's resolveLanguage.
  const [language, setLanguage] = useState(resolveLanguage);
  const [isLoading, setIsLoading] = useState(true);
  // Persist the language choice to the signed-in account (per-user sync).
  const prefs = useUserPreferences();

  useEffect(() => {
    // Follow a language the preferences bridge adopts after hydration, and pick
    // up one that landed between this render and this subscribe.
    const unsubscribe = subscribeToLanguage(setLanguage);
    setLanguage(resolveLanguage());

    let cancelled = false;
    bootstrapLanguage().finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  const setPreferredLanguage = useCallback(async (lang: string) => {
    const ok = await loadLanguage(lang);
    if (!ok) {
      toast.error(_copy("copy.51af2182291a", { defaultValue: "Could not load language. Please try again." }));
      return;
    }
    localStorage.setItem(STORAGE_KEY, lang);
    applyResolvedLanguage(lang);
    // Persist to the account and await it BEFORE the reload, or the write would
    // be lost when the page tears down.
    if (prefs) {
      await prefs.flushPref('language', lang);
    }
    window.location.reload();
  }, [prefs, _copy]);

  return { language, isLoading, setPreferredLanguage };
}

// Language code to name mapping
export const LANGUAGE_NAMES: Record<string, string> = {
  get en() { return _translateCopy("copy.ba118bf7fc9c", { defaultValue: "English" }); },
  get es() { return _translateCopy("copy.3411059cb8e0", { defaultValue: "Spanish" }); },
  get fr() { return _translateCopy("copy.7458199fe97a", { defaultValue: "French" }); },
  get de() { return _translateCopy("copy.a659b60d246d", { defaultValue: "German" }); },
  get it() { return _translateCopy("copy.fe1d9c7db376", { defaultValue: "Italian" }); },
  get pt() { return _translateCopy("copy.98b01b890687", { defaultValue: "Portuguese" }); },
  get ru() { return _translateCopy("copy.5bcc40adf6e0", { defaultValue: "Russian" }); },
  get zh() { return _translateCopy("copy.8a9779f42128", { defaultValue: "Chinese" }); },
  get hne() { return _translateCopy("copy.86a7786aeebf", { defaultValue: "Chhattisgarhi" }); },
  get cjy() { return _translateCopy("copy.4b2d3cc30bce", { defaultValue: "Chinese, Jinyu" }); },
  get mnp() { return _translateCopy("copy.a5ea74159e67", { defaultValue: "Chinese, Min Bei" }); },
  get ctg() { return _translateCopy("copy.046f0e116ff3", { defaultValue: "Chittagonian" }); },
  get ja() { return _translateCopy("copy.be4ee906d3ef", { defaultValue: "Japanese" }); },
  get jv() { return _translateCopy("copy.1d8b8d4e409f", { defaultValue: "Javanese" }); },
  get ko() { return _translateCopy("copy.04656c6fe003", { defaultValue: "Korean" }); },
  get lo() { return _translateCopy("copy.6d2138c6f2f6", { defaultValue: "Lao" }); },
  get mag() { return _translateCopy("copy.cd2e9f795d51", { defaultValue: "Magahi" }); },
  get ar() { return _translateCopy("copy.bafb66f32cd7", { defaultValue: "Arabic" }); },
  get az() { return _translateCopy("copy.717455722060", { defaultValue: "Azerbaijani" }); },
  get aec() { return _translateCopy("copy.d0a91a881f01", { defaultValue: "Arabic, Sa'idi Spoken" }); },
  get acm() { return _translateCopy("copy.6c3ca9ac1186", { defaultValue: "Arabic, Mesopotamian Spoken" }); },
  get acw() { return _translateCopy("copy.7e93e41a17bd", { defaultValue: "Arabic, Hijazi Spoken" }); },
  get hi() { return _translateCopy("copy.63c2dc51d089", { defaultValue: "Hindi" }); },
  get ta() { return _translateCopy("copy.135d78ac8f56", { defaultValue: "Tamil" }); },
  get te() { return _translateCopy("copy.a4504b3d0ff7", { defaultValue: "Telugu" }); },
  get th() { return _translateCopy("copy.ad705ee19c04", { defaultValue: "Thai" }); },
  get tts() { return _translateCopy("copy.34dc5a6eb9ec", { defaultValue: "Thai, Northeastern" }); },
  get vi() { return _translateCopy("copy.f25499e9df5c", { defaultValue: "Vietnamese" }); },
  get nl() { return _translateCopy("copy.45f16144c18c", { defaultValue: "Dutch" }); },
  get pl() { return _translateCopy("copy.770341d6e89e", { defaultValue: "Polish" }); },
  get tr() { return _translateCopy("copy.6e7aac65db01", { defaultValue: "Turkish" }); },
  get uk() { return _translateCopy("copy.6f424303fa12", { defaultValue: "Ukrainian" }); },
  get ur() { return _translateCopy("copy.2c6ef73fc9e2", { defaultValue: "Urdu" }); },
  get uz() { return _translateCopy("copy.ea2f3df3ff0b", { defaultValue: "Uzbek" }); },
  get cs() { return _translateCopy("copy.8b463ea23a7e", { defaultValue: "Czech" }); },
  get sv() { return _translateCopy("copy.a89a9329d3d4", { defaultValue: "Swedish" }); },
  get da() { return _translateCopy("copy.fe4338ad620c", { defaultValue: "Danish" }); },
  get dcc() { return _translateCopy("copy.02acec26408a", { defaultValue: "Deccan" }); },
  get dyu() { return _translateCopy("copy.31d2d3c8c358", { defaultValue: "Jula" }); },
  get fi() { return _translateCopy("copy.5710b435f90a", { defaultValue: "Finnish" }); },
  get no() { return _translateCopy("copy.71f4cf5c7a23", { defaultValue: "Norwegian" }); },
  get el() { return _translateCopy("copy.5c74e5b8100c", { defaultValue: "Greek" }); },
  get gsw() { return _translateCopy("copy.fa82b76eed4c", { defaultValue: "Swiss German" }); },
  get ka() { return _translateCopy("copy.9ef3f1385ffb", { defaultValue: "Georgian" }); },
  get km() { return _translateCopy("copy.08d72ec6a16a", { defaultValue: "Khmer" }); },
  get kk() { return _translateCopy("copy.601883e0a2f7", { defaultValue: "Kazakh" }); },
  get kn() { return _translateCopy("copy.4829406f52d7", { defaultValue: "Kannada" }); },
  get ku() { return _translateCopy("copy.4ebb3cbb4139", { defaultValue: "Kurdish" }); },
  get he() { return _translateCopy("copy.33e00df2aac3", { defaultValue: "Hebrew" }); },
  get id() { return _translateCopy("copy.4fe1bb67f3b9", { defaultValue: "Indonesian" }); },
  get mr() { return _translateCopy("copy.6bbef3a79c78", { defaultValue: "Marathi" }); },
  get ms() { return _translateCopy("copy.cd43b2d3b020", { defaultValue: "Malay" }); },
  get ro() { return _translateCopy("copy.096b861df653", { defaultValue: "Romanian" }); },
  get hu() { return _translateCopy("copy.58801e6907f0", { defaultValue: "Hungarian" }); },
  get sk() { return _translateCopy("copy.e2922f6751d4", { defaultValue: "Slovak" }); },
  get skr() { return _translateCopy("copy.435723d07a11", { defaultValue: "Saraiki" }); },
  get sdr() { return _translateCopy("copy.ee8422735fdc", { defaultValue: "Sadri" }); },
  get syl() { return _translateCopy("copy.5f80e47aa1f6", { defaultValue: "Sylheti" }); },
  get sr() { return _translateCopy("copy.b4a077dadb30", { defaultValue: "Serbian" }); },
  get bn() { return _translateCopy("copy.e7f4fe2631bb", { defaultValue: "Bengali" }); },
  get bho() { return _translateCopy("copy.fa907a0d0043", { defaultValue: "Bhojpuri" }); },
  get be() { return _translateCopy("copy.70964175569e", { defaultValue: "Belarusian" }); },
  get bg() { return _translateCopy("copy.ecd986094baf", { defaultValue: "Bulgarian" }); },
  get my() { return _translateCopy("copy.2e9fa8e62006", { defaultValue: "Burmese" }); },
  get ne() { return _translateCopy("copy.0112367e107e", { defaultValue: "Nepali" }); },
  get tl() { return _translateCopy("copy.605eac303049", { defaultValue: "Tagalog" }); },
  get pcm() { return _translateCopy("copy.2ab1ce18e71d", { defaultValue: "Nigerian Pidgin" }); },
  get wes() { return _translateCopy("copy.e8d42b7670c2", { defaultValue: "Pidgin, Cameroon" }); },
  get ha() { return _translateCopy("copy.ad9ffa0196ff", { defaultValue: "Hausa" }); },
  get hr() { return _translateCopy("copy.754787c2f88c", { defaultValue: "Croatian" }); },
  get yo() { return _translateCopy("copy.4fbaf98ad285", { defaultValue: "Yoruba" }); },
  get ig() { return _translateCopy("copy.f5d590be06b2", { defaultValue: "Igbo" }); },
  get arz() { return _translateCopy("copy.4c70c9942c1f", { defaultValue: "Egyptian Arabic" }); },
  get ajp() { return _translateCopy("copy.ede30aeb418b", { defaultValue: "Arabic, South Levantine Spoken" }); },
  get ayn() { return _translateCopy("copy.2cede48e942d", { defaultValue: "Arabic, Sanaani Spoken" }); },
  get apd() { return _translateCopy("copy.99780f78a57b", { defaultValue: "Arabic, Sudanese Spoken" }); },
  get ary() { return _translateCopy("copy.4cd59e720ce2", { defaultValue: "Moroccan Arabic" }); },
  get fa() { return _translateCopy("copy.7428909a1062", { defaultValue: "Persian" }); },
  get pbt() { return _translateCopy("copy.2e66efafeee2", { defaultValue: "Pashto, Southern" }); },
  get rkt() { return _translateCopy("copy.b2f5a6c7518a", { defaultValue: "Rangpuri" }); },
  get pa() { return _translateCopy("copy.9e61f8c4fbca", { defaultValue: "Punjabi" }); },
  get om() { return _translateCopy("copy.070bf0e5edc8", { defaultValue: "Oromo" }); },
  get af() { return _translateCopy("copy.6884e4dc7300", { defaultValue: "Afrikaans" }); },
  get si() { return _translateCopy("copy.0354f368e7cd", { defaultValue: "Sinhala" }); },
  get so() { return _translateCopy("copy.07175458d0a9", { defaultValue: "Somali" }); },
  get qu() { return _translateCopy("copy.a57db7b827fd", { defaultValue: "Quechua" }); },
  get am() { return _translateCopy("copy.e1b6cb2bfcfa", { defaultValue: "Amharic" }); },
  get sw() { return _translateCopy("copy.ef13b74e5743", { defaultValue: "Swahili" }); },
  get zu() { return _translateCopy("copy.5cd8645e8311", { defaultValue: "Zulu" }); },
  get yue() { return _translateCopy("copy.ad83a00f609f", { defaultValue: "Cantonese" }); },
  get wuu() { return _translateCopy("copy.856c1e009fcc", { defaultValue: "Wu Chinese" }); },
  get ti() { return _translateCopy("copy.87ba1408b9be", { defaultValue: "Tigrinya" }); },
  get ca() { return _translateCopy("copy.843c489421f4", { defaultValue: "Catalan" }); },
  get lt() { return _translateCopy("copy.8625f6a2065b", { defaultValue: "Lithuanian" }); },
  get et() { return _translateCopy("copy.4d8bdb8972a2", { defaultValue: "Estonian" }); },
  get lv() { return _translateCopy("copy.28fa038bb8bc", { defaultValue: "Latvian" }); },
  get mi() { return _translateCopy("copy.ab9dd2ac725d", { defaultValue: "Maori" }); },
  get gu() { return _translateCopy("copy.aa1324f5df47", { defaultValue: "Gujarati" }); },
  get ml() { return _translateCopy("copy.2247ef59ce64", { defaultValue: "Malayalam" }); },
  get or() { return _translateCopy("copy.5296eefab076", { defaultValue: "Odia" }); },
  get sd() { return _translateCopy("copy.b80021ded1cc", { defaultValue: "Sindhi" }); },
  get sq() { return _translateCopy("copy.9d0367457cdd", { defaultValue: "Albanian" }); },
  get ug() { return _translateCopy("copy.2199d8952160", { defaultValue: "Uyghur" }); },
  get tg() { return _translateCopy("copy.63288751bc8a", { defaultValue: "Tajik" }); },
  get tk() { return _translateCopy("copy.0d3fce2df27f", { defaultValue: "Turkmen" }); },
  get hy() { return _translateCopy("copy.676f73a9f00a", { defaultValue: "Armenian" }); },
  get ky() { return _translateCopy("copy.f2c01dba334f", { defaultValue: "Kyrgyz" }); },
};
