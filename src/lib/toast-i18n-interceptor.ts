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
 * 5. For untranslated toasts in non-English locales, adds a 🌐 Translate button
 */

import { toast } from 'sonner';
import i18n from '@/i18n';
import { supabase } from '@/integrations/supabase/client';
import { createElement } from 'react';
import { Languages } from 'lucide-react';

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
 * Returns { text, wasTranslated }.
 */
function translateToast(msg: string): { text: string; wasTranslated: boolean } {
  const key = `toasts.${normalizeToKey(msg)}`;
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

/**
 * Get the user's preferred language from localStorage.
 */
function getUserLang(): string {
  return localStorage.getItem('user-preferred-language') || navigator.language?.split('-')[0] || 'en';
}

/**
 * On-demand translate via edge function, then re-show the toast.
 */
async function onDemandTranslate(
  originalMsg: string,
  originalOpts: Record<string, unknown> | undefined,
  method: string,
  toastId: string | number
) {
  const targetLang = getUserLang();

  // Show loading state
  toast.loading('…', { id: toastId });

  try {
    const { data, error } = await supabase.functions.invoke('translate-text', {
      body: { text: originalMsg, targetLang },
    });

    if (error || !data?.translatedText) {
      // Re-show original on failure
      (originalMethods[method] as Function)(originalMsg, { ...originalOpts, id: toastId });
      return;
    }

    // Show translated toast without the translate button
    const translatedDesc = originalOpts?.description && typeof originalOpts.description === 'string'
      ? (await supabase.functions.invoke('translate-text', {
          body: { text: originalOpts.description, targetLang },
        })).data?.translatedText || originalOpts.description
      : originalOpts?.description;

    (originalMethods[method] as Function)(data.translatedText, {
      ...originalOpts,
      ...(translatedDesc !== undefined ? { description: translatedDesc } : {}),
      id: toastId,
      duration: 4000,
    });
  } catch {
    (originalMethods[method] as Function)(originalMsg, { ...originalOpts, id: toastId });
  }
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

    const userLang = getUserLang();
    const needsTranslateButton = !wasTranslated && userLang !== 'en' && msg.length >= 2;

    if (needsTranslateButton) {
      // Generate a stable toast ID so we can replace it
      const toastId = opts?.id || `toast-translate-${Date.now()}`;
      return original(translated, {
        ...translatedOpts,
        id: toastId,
        action: {
          label: createElement(Languages, { className: 'w-3.5 h-3.5' }),
          onClick: () => onDemandTranslate(msg, opts, method, toastId as string | number),
        },
      });
    }

    return original(translated, translatedOpts);
  };
}
