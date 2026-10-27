/**
 * The moment after Post: the new post lands at the top of the feed in the
 * style chosen in Settings > Appearance, `ghost` unless the viewer picks
 * another. The mobile app has the same four (dehub-mobile libs/postLanding)
 * under the same storage key.
 *
 * - ghost: the feed eases down to open a slot and the post fades into it.
 * - morph: the composer itself shrinks into the post.
 * - pill:  a progress pill opens out into the post.
 * - drop:  the post drops in from above with a small bounce.
 *
 * The composer calls `preparePostLanding` as it adds the post to the feed and
 * `beginPostLanding` as it closes; the feed holds the post's card out of sight
 * in between, then brings it in with `runPostLanding`.
 */
import { useSyncExternalStore } from 'react';

export type PostLandingStyle = 'ghost' | 'morph' | 'pill' | 'drop';
export const POST_LANDING_STYLES: readonly PostLandingStyle[] = ['ghost', 'morph', 'pill', 'drop'];

const STORAGE_KEY = 'dehub.postLanding';
const CHANGED_EVENT = 'dehub:post-landing-style';
/** A landing nobody picked up by now (the feed was never shown) is dropped. */
const STALE_MS = 10_000;

export function isPostLandingStyle(value: unknown): value is PostLandingStyle {
  return typeof value === 'string' && (POST_LANDING_STYLES as readonly string[]).includes(value);
}

export function getPostLandingStyle(): PostLandingStyle {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isPostLandingStyle(stored) ? stored : 'ghost';
  } catch {
    return 'ghost';
  }
}

export function setPostLandingStyle(style: PostLandingStyle): void {
  try {
    localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

function subscribeStyle(onChange: () => void) {
  window.addEventListener(CHANGED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function usePostLandingStyle(): PostLandingStyle {
  return useSyncExternalStore(subscribeStyle, getPostLandingStyle, () => 'ghost');
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PendingLanding {
  id: string;
  style: PostLandingStyle;
  /** The composer's box as it closed, where a morph starts. */
  from: Rect | null;
  at: number;
  /** The composer has closed: the post can come in. */
  closed: boolean;
}

let pending: PendingLanding | null = null;
const beginListeners = new Set<() => void>();

/**
 * The post is about to be added to the feed, under a composer that is still
 * open. Its card is kept out of sight (`holdPostLanding`) until the composer
 * closes, so it does not appear behind the sheet before its entrance.
 */
export function preparePostLanding(id: string): void {
  pending = { id, style: getPostLandingStyle(), from: null, at: Date.now(), closed: false };
}

/**
 * The composer is closing on a published post. For a morph it hides itself
 * at once, so the flight, not the sheet's own slide, carries it away.
 */
export function beginPostLanding(id: string, composer: HTMLElement | null): void {
  if (!pending || pending.id !== id) preparePostLanding(id);
  const landing = pending!;
  const box = composer?.getBoundingClientRect();
  landing.from = box && box.width > 0 ? { left: box.left, top: box.top, width: box.width, height: box.height } : null;
  landing.at = Date.now();
  landing.closed = true;
  if (landing.style === 'morph' && composer && !reducedMotion()) {
    composer.style.transition = 'none';
    composer.style.opacity = '0';
  }
  beginListeners.forEach(fn => fn());
}

/** Called when a landing is ready to run: the feed checks for its card then. */
export function onPostLandingBegin(listener: () => void): () => void {
  beginListeners.add(listener);
  return () => {
    beginListeners.delete(listener);
  };
}

/** True while this post's card should wait out of sight for the composer to close. */
export function isPostLandingWaiting(id: string): boolean {
  return !!pending && pending.id === id && !pending.closed && Date.now() - pending.at < STALE_MS;
}

/** The landing for this post, once: a card that mounts again does not land again. */
export function takePostLanding(id: string): PendingLanding | null {
  if (!pending || pending.id !== id || !pending.closed) return null;
  const landing = pending;
  pending = null;
  return Date.now() - landing.at < STALE_MS ? landing : null;
}

/** Keeps a card, and the slot it will open, out of sight until its landing runs. */
export function holdPostLanding(card: HTMLElement, slot: HTMLElement | null): void {
  card.style.opacity = '0';
  if (slot) {
    slot.style.height = '0px';
    slot.style.overflow = 'hidden';
  }
}

/** Undoes `holdPostLanding`. */
export function releasePostLanding(card: HTMLElement, slot: HTMLElement | null): void {
  card.style.opacity = '';
  if (slot) {
    slot.style.height = '';
    slot.style.overflow = '';
  }
}

function reducedMotion(): boolean {
  return document.documentElement.classList.contains('reduce-motion')
    || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** easeOutQuint: quick off the mark, then a long, soft settle. */
const SETTLE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const RING = '0 0 0 3px rgba(226, 232, 240, 0.55), 0 0 32px rgba(226, 232, 240, 0.25)';

/** A panel that flies from `from` to the card and hands over to it. */
function fly(card: HTMLElement, from: Rect, startStyle: Partial<CSSStyleDeclaration>, duration: number) {
  const to = card.getBoundingClientRect();
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    zIndex: '60',
    pointerEvents: 'none',
    boxSizing: 'border-box',
    ...startStyle,
  });
  document.body.appendChild(panel);
  const flight = panel.animate([
    { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: startStyle.borderRadius ?? '24px', opacity: 1 },
    { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, borderRadius: '16px', opacity: 1, offset: 0.82 },
    { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, borderRadius: '16px', opacity: 0 },
  ], { duration, easing: SETTLE, fill: 'forwards' });
  card.animate([
    { opacity: 0, transform: 'scale(1.02)' },
    { opacity: 0, transform: 'scale(1.02)', offset: 0.6 },
    { opacity: 1, transform: 'scale(1)' },
  ], { duration, easing: SETTLE });
  flight.finished.finally(() => panel.remove());
}

/**
 * Brings a card in. `slot` is the block that holds the new card at the top of
 * the feed; it grows from nothing so the posts below glide down.
 */
export function runPostLanding(landing: PendingLanding, card: HTMLElement, slot: HTMLElement | null): void {
  releasePostLanding(card, slot);
  if (reducedMotion()) return;

  if (slot && landing.style !== 'morph') {
    const height = slot.getBoundingClientRect().height;
    slot.animate([
      { height: '0px', overflow: 'hidden' },
      { height: `${height}px`, overflow: 'hidden' },
    ], { duration: 420, easing: SETTLE });
  }

  switch (landing.style) {
    case 'ghost':
      card.animate([
        { opacity: 0, transform: 'scale(0.965)', filter: 'blur(6px)' },
        { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
      ], { duration: 560, delay: 140, easing: SETTLE, fill: 'backwards' });
      card.animate([
        { boxShadow: '0 0 0 0 rgba(226, 232, 240, 0)' },
        { boxShadow: RING, offset: 0.3 },
        { boxShadow: '0 0 0 0 rgba(226, 232, 240, 0)' },
      ], { duration: 1100, delay: 520, easing: 'ease-in-out' });
      break;
    case 'drop': {
      const lift = card.getBoundingClientRect().height + 40;
      card.animate([
        { transform: `translateY(${-lift}px)`, opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { transform: 'translateY(8px)', offset: 0.62 },
        { transform: 'translateY(-3px)', offset: 0.82 },
        { transform: 'translateY(0)', opacity: 1 },
      ], { duration: 680, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' });
      break;
    }
    case 'morph':
      if (landing.from) {
        fly(card, landing.from, {
          background: 'rgba(14, 15, 18, 0.96)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '24px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.45)',
        }, 620);
      }
      break;
    case 'pill': {
      const width = Math.min(360, window.innerWidth - 32);
      const from = { left: (window.innerWidth - width) / 2, top: window.innerHeight - 24 - 48, width, height: 48 };
      fly(card, from, {
        background: 'rgba(10, 10, 10, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '24px',
        boxShadow: 'inset 0 -2px 0 #fff',
      }, 600);
      break;
    }
  }
}
