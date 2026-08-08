/**
 * Auto-translate preference
 * =========================
 * Whether the app may translate text without being asked.
 *
 * Split out of TranslatableText so callers that sit on the boot path can read it.
 * NewVersionToast is mounted eagerly at the App root, so importing the setting
 * from that component would have pulled it — and framer-motion, lucide, and the
 * tooltip primitives with it — onto the entry chunk for the sake of two
 * localStorage lines.
 *
 * @module lib/auto-translate-setting
 */

// Auto-translate is on unless the reader has turned it off. Stored rather than
// defaulted per session so the choice survives a reload, and read at call time
// rather than cached in a module constant so a change applies without a refresh.
const AUTO_TRANSLATE_KEY = 'dehub-auto-translate';

export function autoTranslateEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_TRANSLATE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setAutoTranslateEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_TRANSLATE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Storage disabled; the setting just will not persist.
  }
}
