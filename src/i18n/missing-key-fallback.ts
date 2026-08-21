/**
 * Last-resort text for a key with no entry in the locale file.
 *
 * i18next passes the caller's `defaultValue` here when there was one, so
 * `t('stats.title', 'Live stats')` keeps its English copy rather than being
 * rebuilt out of the key as "Title". Only calls written without a default
 * fall through to humanising the key's leaf.
 */
export function humanizeTranslationKey(key: string, defaultValue?: unknown): string {
  if (typeof defaultValue === 'string' && defaultValue.trim()) return defaultValue;

  const leaf = key.split('.').filter(Boolean).pop() ?? key;
  const words = leaf
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();

  if (!words) return 'Translation unavailable';
  return words.charAt(0).toUpperCase() + words.slice(1);
}
