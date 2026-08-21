import { useEffect } from 'react';

/**
 * Replaces the browser's native `title=` tooltip with the app's own hover
 * label — the small dark pill used by the side panel tabs.
 *
 * There are ~190 `title="…"` attributes spread across the app, and the browser
 * renders each as a square grey OS tooltip that ignores the theme entirely.
 * Rather than hand-wrapping every one of them in a Radix <Tooltip> (and pulling
 * a provider into every tree), this listens once at the document level: on
 * hover it lifts the title off the element into `data-native-title` — which is
 * what actually suppresses the OS tooltip — draws our own label, and puts the
 * attribute back on the way out so anything else reading `title` still sees it.
 *
 * Mounted once at the app root. Elements that genuinely want the OS tooltip can
 * opt out with `data-native-tooltip`.
 */

const SHOW_DELAY_MS = 200;
const STASH_ATTR = 'data-native-title';

export function NativeTitleTooltips() {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const bubble = document.createElement('div');
    bubble.setAttribute('role', 'tooltip');
    bubble.setAttribute('aria-hidden', 'true');
    bubble.style.cssText = [
      'position:fixed',
      'z-index:2147483000',
      'pointer-events:none',
      'max-width:min(18rem,80vw)',
      'padding:4px 8px',
      'border-radius:6px',
      'background:#27272a',
      'color:#f4f4f5',
      'font-size:11px',
      'font-weight:500',
      'line-height:1.25',
      'box-shadow:0 8px 24px rgba(0,0,0,0.35)',
      'opacity:0',
      'transition:opacity 150ms ease',
      'white-space:pre-line',
      'left:0',
      'top:0',
      'display:none',
    ].join(';');
    document.body.appendChild(bubble);

    let current: HTMLElement | null = null;
    let timer: number | undefined;

    const restore = (el: HTMLElement | null) => {
      if (!el) return;
      const stashed = el.getAttribute(STASH_ATTR);
      if (stashed !== null) {
        el.setAttribute('title', stashed);
        el.removeAttribute(STASH_ATTR);
      }
    };

    const hide = () => {
      window.clearTimeout(timer);
      bubble.style.opacity = '0';
      bubble.style.display = 'none';
      restore(current);
      current = null;
    };

    const place = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      // Measure before positioning: the bubble must be laid out to know its size.
      bubble.style.display = 'block';
      const { width, height } = bubble.getBoundingClientRect();
      const gap = 6;
      let top = rect.bottom + gap;
      // Flip above when the label would run off the bottom of the viewport.
      if (top + height > window.innerHeight - 4) top = rect.top - height - gap;
      if (top < 4) top = 4;
      let left = rect.left + rect.width / 2 - width / 2;
      left = Math.max(4, Math.min(left, window.innerWidth - width - 4));
      bubble.style.left = `${Math.round(left)}px`;
      bubble.style.top = `${Math.round(top)}px`;
      bubble.style.opacity = '1';
    };

    const onOver = (e: PointerEvent) => {
      // Touch devices have no hover; a label there just blocks the tap target.
      if (e.pointerType === 'touch') return;
      const target = e.target as Element | null;
      const el = target?.closest?.('[title]') as HTMLElement | null;
      if (!el || el === current) return;
      if (el.hasAttribute('data-native-tooltip')) return;
      const text = el.getAttribute('title');
      if (!text || !text.trim()) return;

      hide();
      current = el;
      // Lifting the attribute is what stops the OS tooltip from appearing.
      el.setAttribute(STASH_ATTR, text);
      el.removeAttribute('title');
      // The title was often the only accessible name on these icon buttons.
      if (!el.getAttribute('aria-label') && !el.textContent?.trim()) {
        el.setAttribute('aria-label', text);
      }
      bubble.textContent = text;
      timer = window.setTimeout(() => {
        if (current === el && el.isConnected) place(el);
      }, SHOW_DELAY_MS);
    };

    const onOut = (e: PointerEvent) => {
      if (!current) return;
      const next = e.relatedTarget as Node | null;
      if (next && current.contains(next)) return;
      hide();
    };

    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerout', onOut, true);
    document.addEventListener('pointerdown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);

    return () => {
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerout', onOut, true);
      document.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
      window.clearTimeout(timer);
      restore(current);
      bubble.remove();
    };
  }, []);

  return null;
}
