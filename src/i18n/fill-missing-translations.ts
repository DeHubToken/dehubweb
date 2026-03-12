/**
 * Fill Missing Translations
 * =========================
 * At boot, compares loaded locale against English master keys.
 * 1. Injects English fallbacks immediately (no blank strings)
 * 2. Checks localStorage cache for previous AI translations
 * 3. If still missing, queues background AI translation via edge function
 * 4. Caches results in localStorage for future visits
 */

import i18n from 'i18next';
import en from './locales/en.json';

const CACHE_PREFIX = 'i18n-translated-';
const CACHE_VERSION = 'v1';

/**
 * Flatten a nested object into dot-separated key paths.
 * e.g. { a: { b: "x" } } → { "a.b": "x" }
 */
function flattenKeys(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flattenKeys(val as Record<string, unknown>, fullKey));
    } else if (typeof val === 'string') {
      result[fullKey] = val;
    }
  }
  return result;
}

/**
 * Unflatten dot-separated keys back into a nested object.
 * e.g. { "a.b": "x" } → { a: { b: "x" } }
 */
function unflattenKeys(flat: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
  }
  return result;
}

/**
 * Get cached translations from localStorage.
 */
function getCachedTranslations(lang: string): Record<string, string> | null {
  try {
    const key = `${CACHE_PREFIX}${CACHE_VERSION}-${lang}`;
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

/**
 * Save translations to localStorage cache.
 */
function setCachedTranslations(lang: string, translations: Record<string, string>): void {
  try {
    const key = `${CACHE_PREFIX}${CACHE_VERSION}-${lang}`;
    // Merge with existing cache
    const existing = getCachedTranslations(lang) || {};
    const merged = { ...existing, ...translations };
    localStorage.setItem(key, JSON.stringify(merged));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/**
 * Request batch translation from edge function.
 * Sends English key-value pairs, receives translated pairs.
 */
async function requestBatchTranslation(
  missingKeys: Record<string, string>,
  targetLang: string
): Promise<Record<string, string>> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return {};

  // Limit batch size to avoid huge payloads
  const entries = Object.entries(missingKeys);
  const BATCH_SIZE = 80;
  const allTranslated: Record<string, string> = {};

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = Object.fromEntries(entries.slice(i, i + BATCH_SIZE));
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/translate-locale-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: batch, targetLang }),
      });

      if (!resp.ok) {
        console.warn(`[i18n] Batch translation failed (${resp.status}) for ${targetLang}`);
        continue;
      }

      const data = await resp.json();
      if (data.translations) {
        Object.assign(allTranslated, data.translations);
      }
    } catch (err) {
      console.warn('[i18n] Batch translation request failed:', err);
    }
  }

  return allTranslated;
}

/**
 * Main entry: fill missing translations for a loaded locale.
 * Call this AFTER the locale JSON has been added to i18n.
 */
export async function fillMissingTranslations(lang: string): Promise<void> {
  if (lang === 'en') return;

  const enFlat = flattenKeys(en as Record<string, unknown>);
  const loadedBundle = i18n.getResourceBundle(lang, 'translation') || {};
  const loadedFlat = flattenKeys(loadedBundle as Record<string, unknown>);

  // Find keys present in English but missing in the loaded locale
  const missingFlat: Record<string, string> = {};
  for (const [key, value] of Object.entries(enFlat)) {
    if (!loadedFlat[key]) {
      missingFlat[key] = value;
    }
  }

  const missingCount = Object.keys(missingFlat).length;
  if (missingCount === 0) return;

  console.log(`[i18n] ${lang}: ${missingCount} missing keys detected`);

  // Step 1: Check localStorage cache for previously AI-translated keys
  const cached = getCachedTranslations(lang) || {};
  const fromCache: Record<string, string> = {};
  const stillMissing: Record<string, string> = {};

  for (const [key, enValue] of Object.entries(missingFlat)) {
    if (cached[key]) {
      fromCache[key] = cached[key];
    } else {
      stillMissing[key] = enValue;
    }
  }

  // Step 2: Inject cached translations + English fallbacks for the rest
  const fallbackBundle = unflattenKeys({ ...missingFlat, ...fromCache });
  i18n.addResourceBundle(lang, 'translation', fallbackBundle, true, true);

  if (Object.keys(fromCache).length > 0) {
    console.log(`[i18n] ${lang}: ${Object.keys(fromCache).length} keys restored from cache`);
  }

  const stillMissingCount = Object.keys(stillMissing).length;
  if (stillMissingCount === 0) return;

  console.log(`[i18n] ${lang}: requesting AI translation for ${stillMissingCount} keys...`);

  // Step 3: Background AI translation (non-blocking)
  requestBatchTranslation(stillMissing, lang).then((translated) => {
    const translatedCount = Object.keys(translated).length;
    if (translatedCount === 0) return;

    console.log(`[i18n] ${lang}: received ${translatedCount} AI translations`);

    // Merge into runtime
    const translatedBundle = unflattenKeys(translated);
    i18n.addResourceBundle(lang, 'translation', translatedBundle, true, true);

    // Cache for future visits
    setCachedTranslations(lang, translated);
  });
}
