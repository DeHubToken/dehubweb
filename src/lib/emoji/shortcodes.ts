/**
 * `:shortcode:` → emoji, for every name Slack, GitHub, Discord and JoyPixels
 * use (built by scripts/build-emoji-data.mjs). ~30 KB gzipped, fetched the
 * first time a message actually contains a candidate `:code:`.
 */

let map: Record<string, string> | null = null;
let pending: Promise<Record<string, string>> | null = null;

export function getLoadedShortcodes(): Record<string, string> | null {
  return map;
}

export function loadShortcodes(): Promise<Record<string, string>> {
  if (map) return Promise.resolve(map);
  if (!pending) {
    pending = import('./data/shortcodes.json')
      .then((mod) => {
        map = ((mod as { default?: unknown }).default ?? mod) as Record<string, string>;
        return map;
      })
      .catch((err) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}
