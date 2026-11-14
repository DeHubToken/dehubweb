/**
 * Toast i18n Interceptor
 * ======================
 * Monkey-patches sonner's toast methods to auto-translate messages
 * using the same static i18n system as the rest of the UI.
 *
 * Flow:
 * 1. Normalize English toast string → i18n key (e.g. "Saved to bookmarks" → "toasts.saved_to_bookmarks")
 * 2. Look up translation via i18n.t() — synchronous, instant, no API calls
 * 3. Show translated toast immediately (no English flash)
 * 4. Falls back to original English if key not found in locale file
 * 5. Errors and warnings with no entry — usually a server's or a provider's
 *    own English ("Insufficient balance", "X requires a payment method") —
 *    are machine-translated for readers on another language: shown at once as
 *    written, then replaced in place with the translation when it lands
 *    (translateLiveToast). Same translate-text function posts use, private
 *    mode, cached per text and language.
 *
 * Step 4 checks `i18n.exists` rather than leaning on `defaultValue`. The
 * instance sets `parseMissingKeyHandler: humanizeTranslationKey`; that handler
 * now returns the caller's default when there is one, but a toast key is built
 * by stripping every character outside [a-z0-9\s], so an explicit check keeps
 * the original punctuation guaranteed rather than dependent on the handler:
 * "Reminder set — you'll be notified when it starts" must not come back as
 * "Reminder set youll be notified when it starts".
 */

import { toast } from 'sonner';
import i18n from '@/i18n';

/**
 * Normalize an English toast string into a flat i18n key.
 */
function normalizeToKey(msg: string): string {
  return msg
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

/**
 * Translate a toast message using the static i18n system.
 */
function translateToast(msg: string): { text: string; wasTranslated: boolean } {
  const key = `toasts.${normalizeToKey(msg)}`;
  // No entry for this toast: show exactly what the caller wrote. Going through
  // t() here would hand the string to parseMissingKeyHandler and lose its
  // punctuation (see the header note).
  if (!i18n.exists(key)) return { text: msg, wasTranslated: false };
  const translated = i18n.t(key, { defaultValue: msg });
  return { text: translated, wasTranslated: translated !== msg };
}

/**
 * Translate a toast description if it's a string.
 */
function translateDescription(opts?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!opts || typeof opts.description !== 'string') return opts;
  const { text } = translateToast(opts.description as string);
  return { ...opts, description: text };
}

type ToastFn = (msg: unknown, opts?: Record<string, unknown>) => string | number;

/** Error toasts that may carry a server's own English get translated live. */
const LIVE_METHODS = new Set(['error', 'warning']);
const liveCache = new Map<string, Promise<string | null>>();

/** The reader's language, or null when it is English (nothing to do). */
function readerLanguage(): string | null {
  const lang = String(i18n.language || 'en').split(/[-_]/)[0].toLowerCase();
  return lang && lang !== 'en' ? lang : null;
}

/** Whether `text` is worth a translation call: some real words, not a code or a number. */
export function needsLiveTranslation(text: string): boolean {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  return letters >= 4 && text.length <= 500;
}

/** The text in `lang`, or null when it is already in it or the call fails. */
function translateText(text: string, lang: string): Promise<string | null> {
  const key = `${lang}\u0000${text}`;
  const cached = liveCache.get(key);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      // Not `public`: an error can quote what the reader typed, so it never
      // goes to a model tier that keeps what it is sent.
      const { data, error } = await supabase.functions.invoke('translate-text', { body: { text, targetLang: lang } });
      if (error || !data || data.sameLanguage) return null;
      const out = typeof data.translatedText === 'string' ? data.translatedText.trim() : '';
      return out && out !== text ? out : null;
    } catch {
      return null;
    }
  })();
  liveCache.set(key, pending);
  if (liveCache.size > 300) liveCache.delete(liveCache.keys().next().value as string);
  // A failed call is not remembered, so the next toast can try again.
  void pending.then((out) => { if (out === null) liveCache.delete(key); });
  return pending;
}

/**
 * Swaps a shown toast's untranslated text for the reader's language once the
 * translation arrives — only while the toast is still on screen, so a
 * dismissed one is never brought back.
 */
function translateLiveToast(
  original: ToastFn,
  id: string | number,
  msg: string,
  msgTranslated: boolean,
  opts: Record<string, unknown> | undefined,
) {
  const lang = readerLanguage();
  if (!lang) return;
  const description = typeof opts?.description === 'string' ? (opts.description as string) : null;
  const msgJob = !msgTranslated && needsLiveTranslation(msg) ? translateText(msg, lang) : Promise.resolve(null);
  const descJob = description && needsLiveTranslation(description) ? translateText(description, lang) : Promise.resolve(null);
  void Promise.all([msgJob, descJob]).then(([text, desc]) => {
    if (!text && !desc) return;
    if (i18n.language?.split(/[-_]/)[0].toLowerCase() !== lang) return;
    const showing = (toast as unknown as { getToasts?: () => { id: string | number }[] }).getToasts?.();
    if (!showing?.some((t) => t.id === id)) return;
    original(text || msg, { ...(opts || {}), ...(desc ? { description: desc } : {}), id });
  });
}

// Store original methods before patching
const originalMethods: Record<string, Function> = {};
const methodNames = ['success', 'error', 'info', 'warning', 'loading', 'message'] as const;

// Save originals
for (const method of methodNames) {
  originalMethods[method] = (toast as any)[method];
}

// Patch all sonner toast methods
for (const method of methodNames) {
  const original = originalMethods[method];
  (toast as any)[method] = (msg: unknown, opts?: Record<string, unknown>) => {
    if (typeof msg !== 'string') {
      return original(msg, opts);
    }

    // Translate immediately — synchronous, no flash
    const { text: translated, wasTranslated } = translateToast(msg);
    const translatedOpts = translateDescription(opts);

    const id = original(translated, translatedOpts);
    if (LIVE_METHODS.has(method) && readerLanguage()) {
      translateLiveToast(original as ToastFn, id, translated, wasTranslated, translatedOpts);
    }
    return id;
  };
}
