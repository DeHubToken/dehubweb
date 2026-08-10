/**
 * Language names for AI prompts
 * =============================
 * Every locale code the apps' language pickers can produce, mapped to the name
 * a model actually understands.
 *
 * This map exists because a prompt that says "Translate to acm" does not do
 * what anyone hoped: the model guesses what the code means, and the guesses go
 * to production. The translate-text cache had Spanish stored as Mesopotamian
 * Arabic, Kabyle stored as Sanaani Arabic, and English apologies stored as
 * Sudanese Arabic — each one written permanently and served to every reader of
 * that language. A model given "Arabic, Mesopotamian Spoken" gets all of them
 * right.
 *
 * translate-image learned this first and grew the full map inline; this module
 * is that map, shared, so translate-text and translate-transcript stop
 * re-learning it one language at a time. (translate-image still carries its own
 * identical copy — switching it over is deliberately not bundled into other
 * fixes, since each function redeploys separately.)
 *
 * If a picker gains a locale that is missing here, the paid tiers REFUSE rather
 * than guess — an untranslated post is recoverable, a wrong-language cache row
 * is served until somebody deletes it by hand.
 */

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  hi: 'Hindi',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  vi: 'Vietnamese',
  th: 'Thai',
  id: 'Indonesian',
  uk: 'Ukrainian',
  sv: 'Swedish',
  da: 'Danish',
  fi: 'Finnish',
  no: 'Norwegian',
  cs: 'Czech',
  el: 'Greek',
  he: 'Hebrew',
  ro: 'Romanian',
  hu: 'Hungarian',
  sk: 'Slovak',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sr: 'Serbian',
  sl: 'Slovenian',
  lt: 'Lithuanian',
  lv: 'Latvian',
  et: 'Estonian',
  ms: 'Malay',
  tl: 'Filipino',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  mr: 'Marathi',
  gu: 'Gujarati',
  kn: 'Kannada',
  ml: 'Malayalam',
  pa: 'Punjabi',
  ur: 'Urdu',
  fa: 'Persian',
  sw: 'Swahili',
  af: 'Afrikaans',
  ca: 'Catalan',
  eu: 'Basque',
  gl: 'Galician',
  cy: 'Welsh',
  is: 'Icelandic',
  ga: 'Irish',
  mt: 'Maltese',
  sq: 'Albanian',
  mk: 'Macedonian',
  bs: 'Bosnian',
  lb: 'Luxembourgish',
  ka: 'Georgian',
  hy: 'Armenian',
  az: 'Azerbaijani',
  kk: 'Kazakh',
  uz: 'Uzbek',
  mn: 'Mongolian',
  ne: 'Nepali',
  si: 'Sinhala',
  km: 'Khmer',
  lo: 'Lao',
  my: 'Burmese',
  am: 'Amharic',
  yo: 'Yoruba',
  ig: 'Igbo',
  zu: 'Zulu',
  xh: 'Xhosa',
  arz: 'Egyptian Arabic',
  ary: 'Moroccan Arabic (Darija)',
  acm: 'Arabic, Mesopotamian Spoken',
  acw: 'Arabic, Hijazi Spoken',
  aec: "Arabic, Sa'idi Spoken",
  ajp: 'Arabic, South Levantine Spoken',
  ayn: 'Arabic, Sanaani Spoken',
  apd: 'Arabic, Sudanese Spoken',
  be: 'Belarusian',
  bho: 'Bhojpuri',
  cjy: 'Chinese, Jinyu',
  mnp: 'Chinese, Min Bei',
  yue: 'Cantonese',
  wuu: 'Wu Chinese',
  ctg: 'Chittagonian',
  hne: 'Chhattisgarhi',
  dcc: 'Deccan',
  dyu: 'Jula',
  gsw: 'Swiss German',
  ha: 'Hausa',
  jv: 'Javanese',
  ku: 'Kurdish',
  ky: 'Kyrgyz',
  mag: 'Magahi',
  mi: 'Maori',
  om: 'Oromo',
  or: 'Odia',
  pbt: 'Pashto, Southern',
  pcm: 'Nigerian Pidgin',
  qu: 'Quechua',
  rkt: 'Rangpuri',
  sd: 'Sindhi',
  sdr: 'Sadri',
  skr: 'Saraiki',
  so: 'Somali',
  syl: 'Sylheti',
  tg: 'Tajik',
  ti: 'Tigrinya',
  tk: 'Turkmen',
  tts: 'Thai, Northeastern',
  ug: 'Uyghur',
  wes: 'Pidgin, Cameroon',
};

/**
 * Resolve a picker code to a promptable name. 'pt-BR' and 'PT' both resolve to
 * Portuguese; an unknown code resolves to null, and the caller must treat null
 * as "do not ask a model", not as an excuse to pass the code through raw.
 */
export function languageNameFor(code: string | undefined): string | null {
  if (!code) return null;
  const lower = code.toLowerCase();
  return LANGUAGE_NAMES[lower] ?? LANGUAGE_NAMES[lower.split(/[-_]/)[0]] ?? null;
}
