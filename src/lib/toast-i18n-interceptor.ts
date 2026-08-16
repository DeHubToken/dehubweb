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
 *
 * Step 4 has to check `i18n.exists` rather than lean on `defaultValue`. The
 * instance sets `parseMissingKeyHandler: humanizeTranslationKey`, which wins
 * over defaultValue and rebuilds a sentence out of the KEY — and the key was
 * built by stripping every character outside [a-z0-9\s]. So an untranslated
 * toast came back with its punctuation deleted: "Reminder set — you'll be
 * notified when it starts" was shown as "Reminder set youll be notified when
 * it starts".
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
    const { text: translated } = translateToast(msg);
    const translatedOpts = translateDescription(opts);

    return original(translated, translatedOpts);
  };
}
