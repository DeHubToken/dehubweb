/**
 * Focus rings for keyboard users only.
 *
 * Radix hands focus back to a menu's or drawer's trigger when it closes, and
 * Chrome counts that script focus as :focus-visible. So a tap or click on the
 * three-dot button, Share or Bookmark left a 2px white ring on it after the
 * menu shut. :focus-visible alone cannot tell those apart from Tab, so this
 * tracks how the person is actually moving: Tab or arrow keys set
 * html[data-focus-keys], any press clears it. focus-keys.css only draws rings
 * while it is set. Escape and Enter do not set it, since they close menus a
 * pointer opened.
 */

const NAV_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

export function installFocusKeys() {
  window.addEventListener('keydown', (e) => {
    if (!NAV_KEYS.has(e.key) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== 'Tab') {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    }
    const root = document.documentElement;
    if (!root.hasAttribute('data-focus-keys')) root.setAttribute('data-focus-keys', '');
  }, true);
  window.addEventListener('pointerdown', () => {
    const root = document.documentElement;
    if (root.hasAttribute('data-focus-keys')) root.removeAttribute('data-focus-keys');
  }, true);
}
