import { useLayoutEffect, useRef } from 'react';

const pending = new Map<HTMLElement, Element>();
let frame: number | null = null;

function flushFonts() {
  frame = null;
  // Computed styles are live: capture every value before changing ANY badge.
  // Interleaving these reads with writes forces layout once per font property
  // per badge as a new page of feed cards mounts.
  const fonts = new Map<Element, { fontSize: string; fontFamily: string; fontWeight: string }>();
  const updates = Array.from(pending, ([badge, name]) => {
    if (!badge.isConnected || !name.isConnected) return null;
    let font = fonts.get(name);
    if (!font) {
      const computed = getComputedStyle(name);
      font = { fontSize: computed.fontSize, fontFamily: computed.fontFamily, fontWeight: computed.fontWeight };
      fonts.set(name, font);
    }
    return { badge, font };
  });
  pending.clear();
  for (const update of updates) {
    if (!update) continue;
    const { badge, font } = update;
    if (badge.style.fontSize !== font.fontSize) badge.style.fontSize = font.fontSize;
    if (badge.style.fontFamily !== font.fontFamily) badge.style.fontFamily = font.fontFamily;
    if (badge.style.fontWeight !== font.fontWeight) badge.style.fontWeight = font.fontWeight;
  }
}

function scheduleFont(badge: HTMLElement, name: Element) {
  pending.set(badge, name);
  if (frame === null) frame = requestAnimationFrame(flushFonts);
}

function cancelFont(badge: HTMLElement) {
  pending.delete(badge);
  if (!pending.size && frame !== null) {
    cancelAnimationFrame(frame);
    frame = null;
  }
}

/** Inline artwork uses the name's font metrics even when only the name is styled. */
export function useInlineBadgeFont<T extends HTMLElement = HTMLSpanElement>() {
  const ref = useRef<T>(null);
  const subscription = useRef<{ badge: T; name: Element; observer?: ResizeObserver } | null>(null);
  useLayoutEffect(() => {
    const badge = ref.current;
    const parent = badge?.parentElement;
    const sibling = badge?.previousElementSibling;
    const name = sibling?.textContent?.trim() && !sibling.matches('[data-badge-playing], [data-streamer-badge]')
      ? sibling : parent;
    const previous = subscription.current;
    if (previous && (previous.badge !== badge || previous.name !== name)) {
      previous.observer?.disconnect();
      cancelFont(previous.badge);
      subscription.current = null;
    }
    if (!badge || !name) return;
    scheduleFont(badge, name);
    if (!subscription.current) {
      const observer = typeof ResizeObserver === 'undefined' ? undefined
        : new ResizeObserver(() => scheduleFont(badge, name));
      observer?.observe(name);
      subscription.current = { badge, name, observer };
    }
  });
  useLayoutEffect(() => () => {
    const current = subscription.current;
    if (!current) return;
    current.observer?.disconnect();
    cancelFont(current.badge);
    subscription.current = null;
  }, []);
  return ref;
}
