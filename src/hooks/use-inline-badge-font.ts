import { useLayoutEffect, useRef } from 'react';

const pending = new Map<HTMLElement, Element>();
let frame: number | null = null;
type Subscription = { badge: HTMLElement; name: Element; observer?: ResizeObserver; visible: boolean; signature: string };
const subscriptions = new Map<HTMLElement, Subscription>();
let visibility: IntersectionObserver | undefined;
let themeChanges: MutationObserver | undefined;

function observeBadge(subscription: Subscription) {
  subscriptions.set(subscription.badge, subscription);
  if (typeof IntersectionObserver !== 'undefined') {
    visibility ??= new IntersectionObserver(entries => {
      for (const entry of entries) {
        const current = subscriptions.get(entry.target as HTMLElement);
        if (!current) continue;
        const entered = entry.isIntersecting && !current.visible;
        current.visible = entry.isIntersecting;
        if (entered) scheduleFont(current.badge, current.name);
        else if (!current.visible) cancelFont(current.badge);
      }
    }, { rootMargin: '300px 0px' });
    visibility.observe(subscription.badge);
  }
  if (!themeChanges && typeof MutationObserver !== 'undefined') {
    themeChanges = new MutationObserver(() => {
      for (const current of subscriptions.values()) scheduleFont(current.badge, current.name);
    });
    themeChanges.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-system-tone', 'class'] });
  }
}

function releaseBadge(current: Subscription) {
  current.observer?.disconnect();
  visibility?.unobserve(current.badge);
  subscriptions.delete(current.badge);
  cancelFont(current.badge);
  if (!subscriptions.size) {
    visibility?.disconnect(); visibility = undefined;
    themeChanges?.disconnect(); themeChanges = undefined;
  }
}

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
  // Reading font metrics inside a skipped content-visibility card wakes its
  // layout. Only nearby badges need their custom name font copied now.
  if (subscriptions.get(badge)?.visible === false) return;
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
  const subscription = useRef<Subscription | null>(null);
  useLayoutEffect(() => {
    const badge = ref.current;
    const parent = badge?.parentElement;
    const sibling = badge?.previousElementSibling;
    const name = sibling?.textContent?.trim() && !sibling.matches('[data-badge-playing], [data-streamer-badge]')
      ? sibling : parent;
    const previous = subscription.current;
    if (previous && (previous.badge !== badge || previous.name !== name)) {
      releaseBadge(previous);
      subscription.current = null;
    }
    if (!badge || !name) return;
    const signature = [name.getAttribute('class'), name.getAttribute('style'), parent?.getAttribute('class'), parent?.getAttribute('style')].join('|');
    if (!subscription.current) {
      const observer = typeof ResizeObserver === 'undefined' ? undefined
        : new ResizeObserver(() => scheduleFont(badge, name));
      const current = { badge, name, observer, signature, visible: typeof IntersectionObserver === 'undefined' };
      subscription.current = current;
      observeBadge(current);
      observer?.observe(name);
      scheduleFont(badge, name);
    } else if (subscription.current.signature !== signature) {
      subscription.current.signature = signature;
      scheduleFont(badge, name);
    }
  });
  useLayoutEffect(() => () => {
    const current = subscription.current;
    if (!current) return;
    releaseBadge(current);
    subscription.current = null;
  }, []);
  return ref;
}
