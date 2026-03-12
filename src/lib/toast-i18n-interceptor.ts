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
 */

import { toast } from 'sonner';
import i18n from '@/i18n';

/**
 * Normalize an English toast string into a flat i18n key.
 * "Saved to bookmarks" → "saved_to_bookmarks"
 * "Failed to send message!" → "failed_to_send_message"
 */
function normalizeToKey(msg: string): string {
  return msg
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // strip punctuation
    .trim()
    .replace(/\s+/g, '_');       // spaces → underscores
}

/**
 * Translate a toast message using the static i18n system.
 * Returns translated string, or original if no translation found.
 */
function translateToast(msg: string): string {
  const key = `toasts.${normalizeToKey(msg)}`;
  const translated = i18n.t(key, { defaultValue: msg });
  return translated;
}

/**
 * Translate a toast description if it's a string.
 */
function translateDescription(opts?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!opts || typeof opts.description !== 'string') return opts;
  return {
    ...opts,
    description: translateToast(opts.description as string),
  };
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
    const translated = translateToast(msg);
    const translatedOpts = translateDescription(opts);

    return original(translated, translatedOpts);
  };
}
