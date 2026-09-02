/**
 * Machine-translation fallback for the languages whose locale files are not
 * filled in.
 *
 * The app ships real translations for the languages worth translating properly;
 * everything else falls back to English, which is honest but not useful to
 * someone who does not read English. Google's website translate widget covers
 * that tail at no cost and with no API key — the same thing the admin panel
 * uses.
 *
 * It is deliberately NOT loaded for everyone:
 *
 *   - A viewer on a file-translated language never loads it, never sends a
 *     request to Google, and never gets the DOM patch below. Most viewers are
 *     in that group, so for them nothing about the app changes.
 *   - A viewer on a tail language gets the widget instead of English.
 *   - A tail language Google does not support gets nothing, and falls back to
 *     English as before. Half of the tail is in this group: Google has no
 *     Chittagonian, Sylheti, Min Bei or Jinyu, and no codes for the Arabic and
 *     Chinese dialects, which are mapped to their parent language instead.
 *
 * The widget is a rendering trick, not a translation of the app: it rewrites
 * text nodes in the browser after load. Search engines see English, so this
 * is a fallback for readers, never a substitute for filling a locale file.
 */

import { WIDGET_FALLBACK_LOCALES } from './widget-fallback-locales';

const COOKIE = 'googtrans';
const SCRIPT_ID = 'google-translate-script';
const HOST_ID = 'google_translate_element';

/**
 * Our locale code → Google's, which is not ISO in several places (`iw` for
 * Hebrew, `jw` for Javanese, `fil` for Filipino, `zh-CN`).
 *
 * Every locale in the fallback list has an entry. Where Google has no code for
 * a language, it maps to the nearest one Google does have rather than to
 * English: a Sa'idi speaker reading Modern Standard Arabic, or a Chittagonian
 * speaker reading Bengali, is far better served than either reading English.
 */
const GOOGLE_CODE: Record<string, string> = {
  am: 'am', ay: 'ay', bho: 'bho', ceb: 'ceb', gu: 'gu', ha: 'ha', ht: 'ht',
  ig: 'ig', jv: 'jw', ka: 'ka', kk: 'kk', km: 'km', kn: 'kn', ku: 'ku',
  ky: 'ky', lo: 'lo', lt: 'lt', lv: 'lv', mg: 'mg', mi: 'mi', mk: 'mk',
  ml: 'ml', mn: 'mn', mr: 'mr', my: 'my', ne: 'ne', no: 'no', om: 'om',
  or: 'or', pa: 'pa', ps: 'ps', qu: 'qu', sa: 'sa', sd: 'sd', si: 'si',
  sk: 'sk', so: 'so', sq: 'sq', sr: 'sr', tg: 'tg', ti: 'ti', tk: 'tk',
  ug: 'ug', uz: 'uz', yo: 'yo', zu: 'zu', af: 'af', az: 'az', be: 'be',
  bg: 'bg', ca: 'ca', et: 'et', hr: 'hr', hy: 'hy', he: 'iw', tl: 'fil',
  dyu: 'dyu', yue: 'yue', th: 'th',

  // Arabic dialects → Modern Standard Arabic. Google has one Arabic, not seven.
  acm: 'ar', acw: 'ar', aec: 'ar', ajp: 'ar', ayn: 'ar', apd: 'ar',
  arz: 'ar', ary: 'ar',

  // Chinese varieties → Mandarin, in the script each is written with.
  cjy: 'zh-CN', mnp: 'zh-CN', wuu: 'zh-CN', zh_tw: 'zh-TW',

  // Indo-Aryan lects → their nearest literary language. Script decides where
  // linguistic distance is close either way: Saraiki and Deccani are written in
  // the Arabic script, so Urdu suits them better than Devanagari Hindi does.
  hne: 'hi', mag: 'mai', rkt: 'bn', syl: 'bn', ctg: 'bn',
  skr: 'ur', dcc: 'ur', pbt: 'ps',

  // Sadri is Indo-Aryan, but this app lists it in Arabic script and lays it out
  // RTL, so Urdu keeps script and direction consistent with the shell around it.
  sdr: 'ur',

  // West African English-lexified creoles → Krio, their closest relative with
  // Google support. English is the lexifier but reads as no translation at all.
  pcm: 'kri', wes: 'kri',

  // Isan is a Lao variety written in Thai script; Thai matches what renders.
  tts: 'th',

  gsw: 'de',
};

function readCookieTarget(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)googtrans=([^;]*)/);
  if (!match) return null;
  return decodeURIComponent(match[1]).split('/')[2] || null;
}

function writeCookie(value: string | null) {
  const base = `${COOKIE}=${value ?? ''};path=/`;
  document.cookie = value ? base : `${base};expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/**
 * React and Google both own the same text nodes, and Google wins the race: it
 * replaces a text node with its own <font> wrapper, React then tries to remove
 * the node it still holds a handle on, throws NotFoundError, and blanks the
 * page. Swallowing exactly that case leaves React's tree intact — the node it
 * wanted gone is already gone.
 *
 * This patches Node.prototype, so it is applied ONLY once the widget is
 * actually being loaded, never for a viewer on a file-translated language.
 */
function guardDomAgainstTranslator() {
  const proto = Node.prototype as unknown as {
    removeChild: <T extends Node>(child: T) => T;
    insertBefore: <T extends Node>(node: T, ref: Node | null) => T;
    __translateGuarded?: boolean;
  };
  if (proto.__translateGuarded) return;
  proto.__translateGuarded = true;

  const { removeChild, insertBefore } = proto;

  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };

  proto.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return this.appendChild(node) as T;
    return insertBefore.call(this, node, ref) as T;
  };
}

/**
 * Wallet addresses, transaction hashes, token amounts and contract ids must
 * survive verbatim — a translated address is a wrong address, and this app is
 * full of them. Google skips anything under `.notranslate`, so every monospace
 * wrapper is tagged, including the ones React mounts later.
 */
function protectVerbatimText() {
  const SELECTOR = '.font-mono, code, pre, [data-address], [data-tx-hash]';
  const tag = (root: ParentNode) => {
    root.querySelectorAll?.(SELECTOR).forEach((el) => el.classList.add('notranslate'));
  };

  tag(document);
  new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches(SELECTOR)) node.classList.add('notranslate');
        tag(node);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
}

function loadWidget() {
  if (document.getElementById(SCRIPT_ID)) return;

  guardDomAgainstTranslator();
  protectVerbatimText();

  if (!document.getElementById(HOST_ID)) {
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.display = 'none';
    document.body.appendChild(host);
  }

  (window as unknown as { googleTranslateElementInit: () => void }).googleTranslateElementInit =
    () => {
      const g = (window as unknown as {
        google?: { translate?: { TranslateElement?: new (o: unknown, el: string) => void } };
      }).google;
      if (!g?.translate?.TranslateElement) return;
      new g.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, HOST_ID);
    };

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  script.async = true;
  document.body.appendChild(script);
}

/**
 * Called on every language change. Returns true when the widget is handling
 * this language, so callers can tell a machine-translated page from a real one.
 *
 * Turning the widget OFF needs a reload: Google has already rewritten the DOM,
 * and clearing the cookie alone leaves the page in the old language. Turning it
 * ON does not, because the script translates whatever is on screen when it
 * arrives.
 */
export function syncTranslateWidget(lang: string): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  const needsWidget = WIDGET_FALLBACK_LOCALES.includes(lang);
  const target = needsWidget ? GOOGLE_CODE[lang] : undefined;
  const current = readCookieTarget();

  if (!target) {
    // Either the locale has real translations, or Google cannot help with it.
    if (current) {
      writeCookie(null);
      window.location.reload();
    }
    return false;
  }

  if (current === target) return true;

  writeCookie(`/en/${target}`);
  if (current) {
    // Switching between two machine-translated languages: Google only reads
    // the cookie at load, so the swap needs a reload to take effect.
    window.location.reload();
    return true;
  }
  loadWidget();
  return true;
}
