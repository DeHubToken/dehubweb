/**
 * Country selection for /cinema.
 *
 * Streaming rights are per-territory: the same film is a £3.49 rental in the
 * UK, included with a subscription in Germany, and unavailable in Brazil. A
 * single global list would be wrong for almost everyone, so every JustWatch
 * call carries a locale and the user can change it.
 *
 * This is the subset of JustWatch's 140+ locales worth putting in a picker.
 */

export interface CinemaLocale {
  /** JustWatch locale, `xx_YY`. */
  locale: string;
  country: string;
  flag: string;
}

export const CINEMA_LOCALES: CinemaLocale[] = [
  { locale: 'en_US', country: 'United States', flag: '🇺🇸' },
  { locale: 'en_GB', country: 'United Kingdom', flag: '🇬🇧' },
  { locale: 'en_CA', country: 'Canada', flag: '🇨🇦' },
  { locale: 'en_AU', country: 'Australia', flag: '🇦🇺' },
  { locale: 'en_IE', country: 'Ireland', flag: '🇮🇪' },
  { locale: 'en_IN', country: 'India', flag: '🇮🇳' },
  { locale: 'en_ZA', country: 'South Africa', flag: '🇿🇦' },
  { locale: 'en_NZ', country: 'New Zealand', flag: '🇳🇿' },
  { locale: 'de_DE', country: 'Germany', flag: '🇩🇪' },
  { locale: 'de_AT', country: 'Austria', flag: '🇦🇹' },
  { locale: 'de_CH', country: 'Switzerland', flag: '🇨🇭' },
  { locale: 'fr_FR', country: 'France', flag: '🇫🇷' },
  { locale: 'fr_BE', country: 'Belgium', flag: '🇧🇪' },
  { locale: 'es_ES', country: 'Spain', flag: '🇪🇸' },
  { locale: 'es_MX', country: 'Mexico', flag: '🇲🇽' },
  { locale: 'es_AR', country: 'Argentina', flag: '🇦🇷' },
  { locale: 'es_CO', country: 'Colombia', flag: '🇨🇴' },
  { locale: 'it_IT', country: 'Italy', flag: '🇮🇹' },
  { locale: 'pt_BR', country: 'Brazil', flag: '🇧🇷' },
  { locale: 'pt_PT', country: 'Portugal', flag: '🇵🇹' },
  { locale: 'nl_NL', country: 'Netherlands', flag: '🇳🇱' },
  { locale: 'sv_SE', country: 'Sweden', flag: '🇸🇪' },
  { locale: 'da_DK', country: 'Denmark', flag: '🇩🇰' },
  { locale: 'nb_NO', country: 'Norway', flag: '🇳🇴' },
  { locale: 'fi_FI', country: 'Finland', flag: '🇫🇮' },
  { locale: 'pl_PL', country: 'Poland', flag: '🇵🇱' },
  { locale: 'tr_TR', country: 'Turkey', flag: '🇹🇷' },
  { locale: 'ja_JP', country: 'Japan', flag: '🇯🇵' },
  { locale: 'ko_KR', country: 'South Korea', flag: '🇰🇷' },
  { locale: 'en_SG', country: 'Singapore', flag: '🇸🇬' },
  { locale: 'en_PH', country: 'Philippines', flag: '🇵🇭' },
  { locale: 'ar_AE', country: 'United Arab Emirates', flag: '🇦🇪' },
];

export const DEFAULT_LOCALE = 'en_US';

const STORAGE_KEY = 'dehub.cinema.locale';

export function isSupportedLocale(locale: string): boolean {
  return CINEMA_LOCALES.some((l) => l.locale === locale);
}

export function localeLabel(locale: string): CinemaLocale {
  return CINEMA_LOCALES.find((l) => l.locale === locale) ?? CINEMA_LOCALES[0];
}

/**
 * Best guess at the visitor's territory, in order: a previous explicit choice,
 * then the browser's region. Language alone is not enough — `en` tells us
 * nothing about which catalogue applies, so only a region subtag counts, and
 * an unmatched region falls back rather than guessing a neighbour.
 */
export function detectLocale(): string {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isSupportedLocale(stored)) return stored;
  } catch {
    // Private mode / storage disabled — fall through to detection.
  }

  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];

  for (const tag of languages) {
    if (!tag) continue;
    const [lang, region] = tag.replace('_', '-').split('-');
    if (!region) continue;

    const exact = `${lang.toLowerCase()}_${region.toUpperCase()}`;
    if (isSupportedLocale(exact)) return exact;

    // Right country, different language (a French speaker in Canada gets the
    // Canadian catalogue, which is what determines availability and price).
    const byRegion = CINEMA_LOCALES.find((l) => l.locale.endsWith(`_${region.toUpperCase()}`));
    if (byRegion) return byRegion.locale;
  }

  return DEFAULT_LOCALE;
}

export function rememberLocale(locale: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Non-fatal: the picker still works for this session.
  }
}
