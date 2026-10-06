/**
 * GENERATED — do not hand-edit. Refresh with:
 *
 *   node scripts/i18n-fanout.mjs --emit-fallback-list
 *
 * The locales whose translation files are NOT filled in, and which therefore
 * fall back to Google's translate widget at view time rather than to English.
 * The fan-out workflow regenerates this after every run, so a locale drops off
 * the list the moment its file is actually translated.
 *
 * Every locale here maps to a real language in GOOGLE_CODE — none is left on
 * English. Where Google has no code for one, it goes to the nearest language it
 * does have: the Arabic dialects to Modern Standard Arabic, Chittagonian and
 * Sylheti to Bengali, Jinyu and Min Bei to Mandarin, the West African pidgins
 * to Krio.
 */
export const WIDGET_FALLBACK_LOCALES: readonly string[] = [
  'acm', 'acw', 'aec', 'ajp', 'apd', 'ayn', 'ctg', 'dcc', 'ku', 'mnp',
  'pcm', 'rkt', 'sdr', 'skr', 'syl', 'wes', 'wuu',
];
