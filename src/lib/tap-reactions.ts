/**
 * Tap-gesture reactions
 * =====================
 * The contract between a media surface (which detects the gesture) and the
 * post's ActionBar (which owns the vote). They are far apart in the tree — the
 * thumbnail is inside the card, the bar is a sibling — so this goes through a
 * window CustomEvent keyed by post id rather than a prop drilled through both.
 *
 * The ladder, on every feed surface:
 *
 *   double tap → 👍 like
 *   triple tap → ❤️ love (tap three cancels the pending like before it casts)
 *   hold       → the reaction tray
 *
 * A gesture only ever ADDS. Double-tapping something already liked does
 * nothing rather than toggling the like off, because the gesture is easy to
 * fire by accident and losing a like you meant to keep is worse than a tap that
 * appears to do nothing.
 *
 * Visual feedback and persistence travel separately. Tap two draws immediately,
 * while the vote request waits briefly in case tap three upgrades Like to Love.
 * That keeps the gesture responsive without ever writing two reactions or
 * creating two notifications.
 */

/** Reactions the tap ladder can cast. Both are positive; see lib/reactions. */
export type TapReaction = 'like' | 'love';

/**
 * Kept under the old name so the surfaces already listening for it keep
 * working — `reaction` is new and absent means 'like'.
 */
export const DOUBLE_TAP_LIKE_EVENT = 'dehub:double-tap-like';

/** Immediate visual acknowledgement. This never writes a vote by itself. */
export const TAP_REACTION_FEEDBACK_EVENT = 'dehub:tap-reaction-feedback';

/**
 * Fired by whoever owns the vote — `ActionBar`, or `ShortsViewer` which renders
 * none — after its guards pass and the reaction really is being cast. Carries
 * the prompting gesture's detail through unchanged so the burst still lands
 * under the finger.
 */
export const TAP_REACTION_CAST_EVENT = 'dehub:tap-reaction-cast';

/** A hold on the media asks the post's ActionBar to open its reaction tray. */
export const OPEN_REACTIONS_EVENT = 'dehub:open-reactions';

export interface DoubleTapLikeEventDetail {
  postId: string;
  reaction?: TapReaction;
  /** Viewport coords of the tap, so the burst can start where the finger was. */
  x?: number;
  y?: number;
  /** The synchronous root painter already drew this acknowledgement. */
  painted?: boolean;
}

export interface OpenReactionsEventDetail {
  postId: string;
}

type TapReactionFeedbackListener = (detail: DoubleTapLikeEventDetail) => void;

/**
 * Keep an in-process listener set as a fallback for browsers where dispatching
 * a CustomEvent fails. The normal path is the window event below: production
 * can load the recogniser and renderer from separate lazy chunks, and each
 * chunk may otherwise end up with its own module-local Set. A window event is
 * the shared bridge that both chunks can always hear.
 */
const tapReactionFeedbackListeners = new Set<TapReactionFeedbackListener>();

const TAP_REACTION_STYLE_ID = 'dehub-tap-reaction-styles';
const TAP_REACTION_BURST_SELECTOR = '[data-tap-reaction-burst]';

const HEART_PATH =
  'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z';
const THUMB_PATH =
  'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z';

const heartSvg = (className: string) =>
  `<svg class="${className}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${HEART_PATH}" /></svg>`;

const thumbSvg =
  `<svg class="dehub-tap-reaction-main" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12" /><path d="${THUMB_PATH}" /></svg>`;

const LOVE_SPARKS = [
  [-12, -70, 15, 0],
  [-47, -39, 11, 30],
  [46, -42, 12, 20],
  [-46, -5, 9, 50],
  [49, -7, 10, 40],
  [13, 36, 9, 60],
] as const;

function ensureTapReactionStyles() {
  if (document.getElementById(TAP_REACTION_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = TAP_REACTION_STYLE_ID;
  style.textContent = `
    .dehub-tap-reaction-burst{position:fixed;width:0;height:0;z-index:2147483647;pointer-events:none;overflow:visible}
    .dehub-tap-reaction-main{position:absolute;left:-36px;top:-36px;width:72px;height:72px;display:block;transform-origin:50% 50%;animation:dehub-tap-main 1.46s cubic-bezier(.22,1,.36,1) both}
    .dehub-tap-reaction-burst--love .dehub-tap-reaction-main{color:#f43f5e;filter:drop-shadow(0 2px 5px rgba(190,18,60,.20))}
    .dehub-tap-reaction-burst--like .dehub-tap-reaction-main{width:64px;height:64px;left:-32px;top:-32px;color:#0ea5e9;filter:drop-shadow(0 2px 5px rgba(2,132,199,.18));animation-duration:1.16s}
    .dehub-tap-reaction-spark{position:absolute;display:block;color:#fb7185;animation:dehub-tap-spark .68s cubic-bezier(.22,1,.36,1) both;animation-delay:var(--delay)}
    .dehub-tap-reaction-spark svg{display:block;width:100%;height:100%}
    @keyframes dehub-tap-main{0%{opacity:1;transform:translateY(5px) scale(.72) rotate(-5deg)}17%{opacity:1;transform:translateY(0) scale(1.1) rotate(0)}70%{opacity:.96;transform:translateY(-2px) scale(1)}100%{opacity:0;transform:translateY(-14px) scale(.92) rotate(2deg)}}
    @keyframes dehub-tap-spark{0%{opacity:0;transform:translate(0,0) scale(.55)}22%{opacity:.9;transform:translate(calc(var(--dx) * .7),calc(var(--dy) * .7)) scale(1)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.72)}}
    @media (prefers-reduced-motion:reduce){.dehub-tap-reaction-main{animation:dehub-tap-reduced .7s ease-out both}.dehub-tap-reaction-spark{display:none}@keyframes dehub-tap-reduced{0%,70%{opacity:1}100%{opacity:0}}}
  `;
  document.head.appendChild(style);
}

/**
 * Paint at document.body synchronously, before React can batch the pointer
 * event with playback and vote state. This is deliberately DOM-native: video
 * frames and lazy route chunks cannot delay or swallow the acknowledgement.
 */
function paintTapReactionFeedback(detail: DoubleTapLikeEventDetail) {
  if (typeof document === 'undefined' || !document.body) return false;
  ensureTapReactionStyles();

  const reaction = detail.reaction ?? 'like';
  document.querySelectorAll(TAP_REACTION_BURST_SELECTOR).forEach((node) => {
    if (reaction === 'love' || node.getAttribute('data-tap-reaction-burst') === reaction) {
      node.remove();
    }
  });

  const margin = 84;
  const clamp = (value: number | undefined, extent: number) =>
    Math.min(extent - margin, Math.max(margin, value ?? extent / 2));
  const burst = document.createElement('div');
  burst.className = `dehub-tap-reaction-burst dehub-tap-reaction-burst--${reaction}`;
  burst.setAttribute('data-tap-reaction-burst', reaction);
  burst.setAttribute('aria-hidden', 'true');
  burst.style.left = `${clamp(detail.x, window.innerWidth)}px`;
  burst.style.top = `${clamp(detail.y, window.innerHeight)}px`;

  if (reaction === 'love') {
    burst.innerHTML = heartSvg('dehub-tap-reaction-main');
    LOVE_SPARKS.forEach(([dx, dy, size, delay]) => {
      const spark = document.createElement('span');
      spark.className = 'dehub-tap-reaction-spark';
      spark.style.cssText = `left:${-size / 2}px;top:${-size / 2}px;width:${size}px;height:${size}px;--dx:${dx}px;--dy:${dy}px;--delay:${delay}ms`;
      spark.innerHTML = heartSvg('');
      burst.appendChild(spark);
    });
  } else {
    burst.innerHTML = thumbSvg;
  }

  document.body.appendChild(burst);
  window.setTimeout(() => burst.remove(), reaction === 'love' ? 1560 : 1260);
  return true;
}

export function subscribeTapReactionFeedback(listener: TapReactionFeedbackListener) {
  tapReactionFeedbackListeners.add(listener);
  const onFeedback = (event: Event) => {
    listener((event as CustomEvent<DoubleTapLikeEventDetail>).detail);
  };
  window.addEventListener(TAP_REACTION_FEEDBACK_EVENT, onFeedback);
  return () => {
    tapReactionFeedbackListeners.delete(listener);
    window.removeEventListener(TAP_REACTION_FEEDBACK_EVENT, onFeedback);
  };
}

function dispatch<T>(name: string, detail: T) {
  try {
    window.dispatchEvent(new CustomEvent<T>(name, { detail }));
  } catch {
    /* a browser without CustomEvent is not one we can react on anyway */
  }
}

export function emitTapReaction(
  postId: string,
  reaction: TapReaction,
  point?: { x: number; y: number },
) {
  if (!postId) return;
  dispatch<DoubleTapLikeEventDetail>(DOUBLE_TAP_LIKE_EVENT, {
    postId: String(postId),
    reaction,
    x: point?.x,
    y: point?.y,
  });
}

export function emitTapReactionFeedback(
  postId: string,
  reaction: TapReaction,
  point?: { x: number; y: number },
) {
  if (!postId) return;
  const detail: DoubleTapLikeEventDetail = {
    postId: String(postId),
    reaction,
    x: point?.x,
    y: point?.y,
  };

  detail.painted = paintTapReactionFeedback(detail);

  try {
    // The window is the one bridge shared by every lazy chunk. Dispatching only
    // here also means a subscriber present in this chunk receives exactly one
    // burst rather than one direct callback plus the public event.
    window.dispatchEvent(
      new CustomEvent<DoubleTapLikeEventDetail>(TAP_REACTION_FEEDBACK_EVENT, { detail }),
    );
  } catch {
    // Old or patched browsers can still paint through the same-chunk fallback.
    tapReactionFeedbackListeners.forEach((listener) => {
      try {
        listener(detail);
      } catch {
        // Decorative feedback must never interrupt the gesture or its vote.
      }
    });
  }
}

/**
 * The vote owner confirming it is casting `reaction`. Give it the detail of the
 * gesture event that prompted it, so the tap point survives the hand-off.
 */
export function emitTapReactionCast(detail: DoubleTapLikeEventDetail) {
  if (!detail?.postId) return;
  dispatch<DoubleTapLikeEventDetail>(TAP_REACTION_CAST_EVENT, {
    ...detail,
    postId: String(detail.postId),
  });
}

/** Back-compat alias for the original double-tap-only callers. */
export function emitDoubleTapLike(postId: string) {
  emitTapReaction(postId, 'like');
}

export function emitOpenReactions(postId: string) {
  if (!postId) return;
  dispatch<OpenReactionsEventDetail>(OPEN_REACTIONS_EVENT, { postId: String(postId) });
}
