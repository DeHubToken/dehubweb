export function humanizeTranslationKey(key: string): string {
  const leaf = key.split('.').filter(Boolean).pop() ?? key;
  const words = leaf
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();

  if (!words) return 'Translation unavailable';
  return words.charAt(0).toUpperCase() + words.slice(1);
}
