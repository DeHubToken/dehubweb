/**
 * Toast i18n Interceptor
 * ======================
 * Monkey-patches sonner's toast methods to auto-translate messages
 * using the translate-text edge function (same system as TranslatableText).
 *
 * Flow:
 * 1. Show toast immediately with English text
 * 2. If user language ≠ English, translate async via edge function
 * 3. Update toast in-place with translated text
 *
 * Uses an LRU cache to avoid redundant API calls.
 */

import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'user-preferred-language';
const MIN_LENGTH = 1;

// Simple translation cache (same pattern as TranslatableText)
const translationCache = new Map<string, string>();
const MAX_CACHE = 300;

function getUserLang(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || navigator.language?.split('-')[0] || 'en';
  } catch {
    return 'en';
  }
}

async function translateText(text: string, targetLang: string): Promise<string | null> {
  const cacheKey = `${text}::${targetLang}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  try {
    const { data, error } = await supabase.functions.invoke('translate-text', {
      body: { text, targetLang },
    });

    if (error || !data?.translatedText) return null;

    const translated = data.translatedText;

    // Don't cache if identical to source (same language)
    if (translated === text) return null;

    // LRU eviction
    if (translationCache.size >= MAX_CACHE) {
      const firstKey = translationCache.keys().next().value;
      if (firstKey) translationCache.delete(firstKey);
    }
    translationCache.set(cacheKey, translated);

    return translated;
  } catch {
    return null;
  }
}

/** Translate a toast message and update it in-place */
function translateAndUpdate(
  toastId: string | number,
  msg: string,
  method: 'success' | 'error' | 'info' | 'warning' | 'loading' | 'message',
  opts?: Record<string, unknown>
) {
  const lang = getUserLang();
  if (lang === 'en' || msg.length < MIN_LENGTH) return;

  // Translate main message
  translateText(msg, lang).then((translated) => {
    if (!translated) return;

    // Also translate description if present
    const descPromise = typeof opts?.description === 'string'
      ? translateText(opts.description as string, lang)
      : Promise.resolve(null);

    descPromise.then((translatedDesc) => {
      const updateOpts: Record<string, unknown> = {
        ...opts,
        id: toastId,
      };
      if (translatedDesc) {
        updateOpts.description = translatedDesc;
      }

      // Use the original (unpatched) method to update
      (originalMethods as any)[method](translated, updateOpts);
    });
  });
}

// Store original methods before patching
const originalMethods: Record<string, Function> = {};
const methodNames = ['success', 'error', 'info', 'warning', 'loading', 'message'] as const;

// Save originals
for (const method of methodNames) {
  originalMethods[method] = (toast as any)[method];
}

// Counter for generating unique toast IDs
let toastCounter = 0;

// Patch all sonner toast methods
for (const method of methodNames) {
  const original = originalMethods[method];
  (toast as any)[method] = (msg: unknown, opts?: Record<string, unknown>) => {
    if (typeof msg !== 'string') {
      return original(msg, opts);
    }

    // Generate a stable ID so we can update the toast later
    const id = opts?.id ?? `toast-i18n-${++toastCounter}`;
    const finalOpts = { ...opts, id };

    // Show immediately in English
    const result = original(msg, finalOpts);

    // Async translate & update
    translateAndUpdate(id, msg, method, finalOpts);

    return result;
  };
}
