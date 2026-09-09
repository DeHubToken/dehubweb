import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTapGestures } from '@/hooks/use-tap-gestures';
import { TapReactionBurst } from '@/components/app/cards/TapReactionBurst';
import {
  DOUBLE_TAP_LIKE_EVENT,
  emitTapReactionFeedback,
  OPEN_REACTIONS_EVENT,
  TAP_REACTION_FEEDBACK_EVENT,
  type DoubleTapLikeEventDetail,
} from '@/lib/tap-reactions';

/**
 * The tap ladder: double 👍, triple ❤️, hold for the tray.
 *
 * Every rung shares one pointer stream with a scroll, a carousel drag and a
 * vertical swipe, so most of what matters here is what the gesture DOESN'T
 * claim. Driven with real PointerEvents rather than a component so the timing
 * is exercised directly.
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function mountGesture(options: Parameters<typeof useTapGestures>[0]) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const handlers = { current: null as ReturnType<typeof useTapGestures> | null };
  function Probe() {
    handlers.current = useTapGestures(options);
    return null;
  }
  const root = createRoot(host);
  act(() => root.render(createElement(Probe)));
  return handlers;
}

/** The subset of a React PointerEvent the hook actually reads. */
function pointer(x: number, y: number, id = 1) {
  return { clientX: x, clientY: y, pointerId: id } as unknown as React.PointerEvent;
}

function tapAt(h: ReturnType<typeof mountGesture>, x = 50, y = 50, id = 1) {
  act(() => {
    h.current!.onPointerDown(pointer(x, y, id));
    h.current!.onPointerUp(pointer(x, y, id));
  });
}

let casts: DoubleTapLikeEventDetail[];
let feedback: DoubleTapLikeEventDetail[];
let opens: string[];
let onCast: EventListener;
let onFeedback: EventListener;
let onOpen: EventListener;

beforeEach(() => {
  vi.useFakeTimers();
  casts = [];
  feedback = [];
  opens = [];
  onCast = (e) => casts.push((e as CustomEvent<DoubleTapLikeEventDetail>).detail);
  onFeedback = (e) => feedback.push((e as CustomEvent<DoubleTapLikeEventDetail>).detail);
  onOpen = (e) => opens.push((e as CustomEvent<{ postId: string }>).detail.postId);
  window.addEventListener(DOUBLE_TAP_LIKE_EVENT, onCast);
  window.addEventListener(TAP_REACTION_FEEDBACK_EVENT, onFeedback);
  window.addEventListener(OPEN_REACTIONS_EVENT, onOpen);
});

afterEach(() => {
  // These are window listeners: without removal they accumulate across cases
  // and every later assertion counts the earlier tests' events too.
  window.removeEventListener(DOUBLE_TAP_LIKE_EVENT, onCast);
  window.removeEventListener(TAP_REACTION_FEEDBACK_EVENT, onFeedback);
  window.removeEventListener(OPEN_REACTIONS_EVENT, onOpen);
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('the tap ladder', () => {
  it('sends a single tap through, not a reaction', () => {
    const onSingleTap = vi.fn();
    const h = mountGesture({ postId: '7', onSingleTap });

    tapAt(h);
    expect(onSingleTap).not.toHaveBeenCalled(); // held back for a possible second

    act(() => void vi.advanceTimersByTime(360));
    expect(onSingleTap).toHaveBeenCalledTimes(1);
    expect(casts).toEqual([]);
  });

  it('likes on a double tap and cancels the single tap', () => {
    const onSingleTap = vi.fn();
    const h = mountGesture({ postId: '7', onSingleTap });

    tapAt(h);
    act(() => void vi.advanceTimersByTime(80));
    tapAt(h);

    expect(casts).toEqual([]);
    expect(feedback.map((item) => item.reaction)).toEqual(['like']);
    act(() => void vi.advanceTimersByTime(360));
    expect(casts.map((c) => c.reaction)).toEqual(['like']);
    act(() => void vi.advanceTimersByTime(500));
    expect(onSingleTap).not.toHaveBeenCalled();
  });

  it('holds the like briefly so a third tap can replace it', () => {
    const h = mountGesture({ postId: '7' });
    tapAt(h);
    act(() => void vi.advanceTimersByTime(80));
    tapAt(h);
    expect(casts).toHaveLength(0);
    expect(feedback.map((item) => item.reaction)).toEqual(['like']);
    act(() => void vi.advanceTimersByTime(359));
    expect(casts).toHaveLength(0);
    act(() => void vi.advanceTimersByTime(1));
    expect(casts).toHaveLength(1);
  });

  it('casts only love on a third tap', () => {
    const h = mountGesture({ postId: '7' });

    tapAt(h);
    act(() => void vi.advanceTimersByTime(80));
    tapAt(h);
    act(() => void vi.advanceTimersByTime(80));
    tapAt(h);

    expect(casts.map((c) => c.reaction)).toEqual(['love']);
    expect(feedback.map((item) => item.reaction)).toEqual(['like', 'love']);
    act(() => void vi.advanceTimersByTime(500));
    expect(casts.map((c) => c.reaction)).toEqual(['love']);
  });

  it('recognises a deliberate desktop triple-click cadence', () => {
    const h = mountGesture({ postId: '7' });

    tapAt(h);
    act(() => void vi.advanceTimersByTime(315));
    tapAt(h);
    act(() => void vi.advanceTimersByTime(315));
    tapAt(h);

    expect(feedback.map((item) => item.reaction)).toEqual(['like', 'love']);
    expect(casts.map((item) => item.reaction)).toEqual(['love']);
  });

  it('renders tap-two feedback immediately and replaces it on tap three', () => {
    const burstHost = document.createElement('div');
    document.body.appendChild(burstHost);
    const burstRoot = createRoot(burstHost);
    act(() => burstRoot.render(createElement(TapReactionBurst, { postId: '7' })));
    const h = mountGesture({ postId: '7' });

    tapAt(h);
    act(() => void vi.advanceTimersByTime(80));
    tapAt(h);

    expect(casts).toEqual([]);
    expect(document.querySelector('[data-tap-reaction-burst="like"] svg.fill-sky-500')).not.toBeNull();

    act(() => void vi.advanceTimersByTime(80));
    tapAt(h);

    expect(document.querySelector('[data-tap-reaction-burst="like"]')).toBeNull();
    expect(document.querySelector('[data-tap-reaction-burst="love"] svg.fill-rose-500')).not.toBeNull();
    expect(document.querySelectorAll('[data-tap-reaction-burst="love"]')).toHaveLength(1);
    expect(casts.map((item) => item.reaction)).toEqual(['love']);
    act(() => burstRoot.unmount());
  });

  it('renders feedback even when the browser event bridge is unavailable', () => {
    const burstHost = document.createElement('div');
    document.body.appendChild(burstHost);
    const burstRoot = createRoot(burstHost);
    act(() => burstRoot.render(createElement(TapReactionBurst, { postId: '7' })));
    const dispatch = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => {
      throw new Error('event bridge unavailable');
    });

    act(() => emitTapReactionFeedback('7', 'love', { x: 60, y: 70 }));

    expect(document.querySelector('svg.fill-rose-500')).not.toBeNull();
    dispatch.mockRestore();
    act(() => burstRoot.unmount());
  });

  it('keeps the visible Love burst mounted long enough to paint over video', () => {
    const burstHost = document.createElement('div');
    document.body.appendChild(burstHost);
    const burstRoot = createRoot(burstHost);
    act(() => burstRoot.render(createElement(TapReactionBurst, { postId: '7' })));

    act(() => emitTapReactionFeedback('7', 'love', { x: 60, y: 70 }));
    expect(document.querySelector('[data-tap-reaction-burst="love"]')).not.toBeNull();

    act(() => void vi.advanceTimersByTime(1200));
    expect(document.querySelector('[data-tap-reaction-burst="love"]')).not.toBeNull();

    act(() => void vi.advanceTimersByTime(360));
    expect(document.querySelector('[data-tap-reaction-burst="love"]')).toBeNull();
    act(() => burstRoot.unmount());
  });

  it('fires a reversible single tap instantly, with no wait at all', () => {
    // Instagram has no delay because a feed photo has no single-tap action to
    // hold back. Shorts does have one — play/pause — but it is a toggle, so it
    // can act now and be taken back if a second tap turns up.
    const onSingleTap = vi.fn();
    const onUndoSingleTap = vi.fn();
    const h = mountGesture({ postId: '7', onSingleTap, onUndoSingleTap });

    tapAt(h);
    expect(onSingleTap).toHaveBeenCalledTimes(1); // no timers advanced
    expect(onUndoSingleTap).not.toHaveBeenCalled();
  });

  it('takes the reversible tap back when a second tap arrives, and still likes', () => {
    const onSingleTap = vi.fn();
    const onUndoSingleTap = vi.fn();
    const h = mountGesture({ postId: '7', onSingleTap, onUndoSingleTap });

    tapAt(h);
    act(() => void vi.advanceTimersByTime(80));
    tapAt(h);

    expect(onSingleTap).toHaveBeenCalledTimes(1);
    expect(onUndoSingleTap).toHaveBeenCalledTimes(1);
    expect(casts).toEqual([]);
    act(() => void vi.advanceTimersByTime(360));
    expect(casts.map((c) => c.reaction)).toEqual(['like']);
  });

  it('does not undo twice when the gesture runs on to a third tap', () => {
    // The love upgrade must not re-toggle play/pause a second time.
    const onUndoSingleTap = vi.fn();
    const h = mountGesture({ postId: '7', onSingleTap: vi.fn(), onUndoSingleTap });

    tapAt(h);
    act(() => void vi.advanceTimersByTime(80));
    tapAt(h);
    act(() => void vi.advanceTimersByTime(80));
    tapAt(h);

    expect(onUndoSingleTap).toHaveBeenCalledTimes(1);
    expect(casts.map((c) => c.reaction)).toEqual(['love']);
  });

  it('leaves a lone reversible tap standing', () => {
    const onSingleTap = vi.fn();
    const onUndoSingleTap = vi.fn();
    const h = mountGesture({ postId: '7', onSingleTap, onUndoSingleTap });

    tapAt(h);
    act(() => void vi.advanceTimersByTime(500));

    expect(onSingleTap).toHaveBeenCalledTimes(1);
    expect(onUndoSingleTap).not.toHaveBeenCalled();
  });

  it('starts a fresh gesture once the window lapses', () => {
    const onSingleTap = vi.fn();
    const h = mountGesture({ postId: '7', onSingleTap });

    tapAt(h);
    act(() => void vi.advanceTimersByTime(400)); // window closed, single fired
    tapAt(h);
    act(() => void vi.advanceTimersByTime(400));

    expect(onSingleTap).toHaveBeenCalledTimes(2);
    expect(casts).toEqual([]);
  });

  it('reports where the tap landed so the burst can start there', () => {
    const h = mountGesture({ postId: '7' });
    tapAt(h, 120, 240);
    act(() => void vi.advanceTimersByTime(80));
    tapAt(h, 122, 241);

    expect(feedback[0]).toMatchObject({ postId: '7', x: 122, y: 241 });
    act(() => void vi.advanceTimersByTime(360));
    expect(casts[0]).toMatchObject({ postId: '7', x: 122, y: 241 });
  });

  it('opens the reaction tray on a hold', () => {
    const onSingleTap = vi.fn();
    const h = mountGesture({ postId: '7', onSingleTap });

    act(() => h.current!.onPointerDown(pointer(50, 50)));
    act(() => void vi.advanceTimersByTime(450));
    expect(opens).toEqual(['7']);

    // The release that ends the hold must not also count as a tap.
    act(() => h.current!.onPointerUp(pointer(50, 50)));
    act(() => void vi.advanceTimersByTime(500));
    expect(onSingleTap).not.toHaveBeenCalled();
    expect(casts).toEqual([]);
  });

  it('does not open the tray when the finger lifts before the hold completes', () => {
    const h = mountGesture({ postId: '7' });
    act(() => h.current!.onPointerDown(pointer(50, 50)));
    act(() => void vi.advanceTimersByTime(200));
    act(() => h.current!.onPointerUp(pointer(50, 50)));
    act(() => void vi.advanceTimersByTime(500));
    expect(opens).toEqual([]);
  });
});

describe('what the ladder refuses to claim', () => {
  it('abandons the gesture once the finger travels — that is a scroll', () => {
    // The shorts carousel drags vertically on this same element.
    const onSingleTap = vi.fn();
    const h = mountGesture({ postId: '7', onSingleTap });

    act(() => {
      h.current!.onPointerDown(pointer(50, 50));
      h.current!.onPointerMove(pointer(50, 140));
      h.current!.onPointerUp(pointer(50, 140));
    });
    act(() => void vi.advanceTimersByTime(500));

    expect(onSingleTap).not.toHaveBeenCalled();
    expect(casts).toEqual([]);
  });

  it('cancels a pending hold when the finger starts moving', () => {
    const h = mountGesture({ postId: '7' });
    act(() => h.current!.onPointerDown(pointer(50, 50)));
    act(() => void vi.advanceTimersByTime(200));
    act(() => h.current!.onPointerMove(pointer(50, 200)));
    act(() => void vi.advanceTimersByTime(400));
    expect(opens).toEqual([]);
  });

  it('tolerates a little jitter without losing the tap', () => {
    // A finger never lands perfectly still.
    const onSingleTap = vi.fn();
    const h = mountGesture({ postId: '7', onSingleTap });
    act(() => {
      h.current!.onPointerDown(pointer(50, 50));
      h.current!.onPointerMove(pointer(53, 52));
      h.current!.onPointerUp(pointer(53, 52));
    });
    act(() => void vi.advanceTimersByTime(400));
    expect(onSingleTap).toHaveBeenCalledTimes(1);
  });

  it('ignores a second finger', () => {
    const h = mountGesture({ postId: '7' });
    act(() => h.current!.onPointerDown(pointer(50, 50, 1)));
    act(() => h.current!.onPointerDown(pointer(90, 90, 2)));
    act(() => h.current!.onPointerUp(pointer(90, 90, 2)));
    act(() => void vi.advanceTimersByTime(500));
    expect(casts).toEqual([]);
  });

  it('drops everything on pointercancel', () => {
    const onSingleTap = vi.fn();
    const h = mountGesture({ postId: '7', onSingleTap });
    act(() => h.current!.onPointerDown(pointer(50, 50)));
    act(() => h.current!.onPointerCancel());
    act(() => void vi.advanceTimersByTime(500));
    expect(onSingleTap).not.toHaveBeenCalled();
    expect(opens).toEqual([]);
  });

  it('passes single taps straight through when disabled, with no delay', () => {
    // The immersive player keeps its own double-tap for seek, so it opts out.
    const onSingleTap = vi.fn();
    const h = mountGesture({ postId: '7', onSingleTap, disabled: true });
    tapAt(h);
    expect(onSingleTap).toHaveBeenCalledTimes(1);
    expect(casts).toEqual([]);
  });

  it('emits nothing without a post id', () => {
    const h = mountGesture({ postId: undefined });
    tapAt(h);
    act(() => void vi.advanceTimersByTime(80));
    tapAt(h);
    expect(casts).toEqual([]);
  });

  it('can have the hold disabled on its own', () => {
    const h = mountGesture({ postId: '7', enableLongPress: false });
    act(() => h.current!.onPointerDown(pointer(50, 50)));
    act(() => void vi.advanceTimersByTime(600));
    expect(opens).toEqual([]);
  });
});

describe('surfaces are wired consistently', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
  const ACTION_BAR = read('components/app/cards/ActionBar.tsx');
  const VIDEO_CARD = read('components/app/cards/VideoCard.tsx');
  const SHORTS = read('components/app/cards/ShortsViewer.tsx');
  const SLIDE = read('components/app/cards/VideoSlide.tsx');
  const POST = read('components/app/cards/PostCard.tsx');
  const IMAGE_CARD = read('components/app/cards/ImageCard.tsx');
  const BURST = read('components/app/cards/TapReactionBurst.tsx');

  it('never lets a gesture clear a reaction the viewer already holds', () => {
    // handleReaction reads a repeat as "toggle off", so casting blind would let
    // a stray double-tap silently remove a like. Both listeners must guard.
    for (const [name, src] of [['ActionBar', ACTION_BAR], ['ShortsViewer', SHORTS]] as const) {
      expect(src, name).toContain('if (myReaction === reaction) return;');
      expect(src, name).toContain("if (reaction === 'like' && isLiked) return;");
    }
  });

  it('draws immediate feedback independently from the delayed vote', () => {
    // The second tap must feel immediate even though persistence waits for a
    // possible third tap. Vote owners still guard repeats from toggling off.
    expect(BURST).toContain('subscribeTapReactionFeedback');
    expect(BURST).not.toContain('DOUBLE_TAP_LIKE_EVENT');
    for (const [name, src] of [['ActionBar', ACTION_BAR], ['ShortsViewer', SHORTS]] as const) {
      // ...and emits it below the guards, never above them.
      const guard = src.indexOf("if (reaction === 'like' && isLiked) return;");
      const cast = src.indexOf('emitTapReactionCast({');
      expect(guard, name).toBeGreaterThan(-1);
      expect(cast, name).toBeGreaterThan(guard);
    }
  });

  it('draws the burst over the card, not inside it', () => {
    // The love firework throws sparks ~130px out of the tap point and a feed
    // card is a rounded, clipped bento: drawn in place, every burst was sliced
    // against the card's edge, the image's corner radius, the media box's own
    // `overflow-hidden`, or the sticky nav above a short card. So the layer is
    // portalled to <body> in viewport coordinates — nothing between the card
    // and the root can cut it, and it stays pointer-events-none up there.
    expect(BURST).toContain('createPortal(layer, document.body)');
    // ...and clips itself nowhere on the way. (Matched against the class lists
    // only: the comment above the portal names the trap it fixed.)
    expect(BURST.match(/className="[^"]*overflow-hidden[^"]*"/)).toBeNull();
  });

  it('uses the reaction ladder in the immersive video player too', () => {
    expect(VIDEO_CARD).toContain('disabled: hideActions || !!video.isAudio || isContentGated');
    expect(VIDEO_CARD).toContain('onSingleTap: isImmersive ? () =>');
    expect(VIDEO_CARD).toContain('onUndoSingleTap: isImmersive ? handlePlayClick : undefined');
    expect(VIDEO_CARD).not.toContain('handleDoubleTapSeek');
    expect(VIDEO_CARD).not.toContain('lastTapRef');
    expect(VIDEO_CARD).toContain('{!hideActions && !video.isAudio && (');
  });

  it('gives shorts its own listener, since it renders no ActionBar', () => {
    expect(SHORTS).toContain('DOUBLE_TAP_LIKE_EVENT');
    expect(SHORTS).toContain('OPEN_REACTIONS_EVENT');
  });

  it('never reverses a play/pause that never happened', () => {
    // togglePlayPause returns early when a tap is really a chrome-restore, or
    // mid-transition. Undoing blind there would pause a playing short.
    expect(SHORTS).toContain('lastToggleTookEffect');
    expect(SHORTS).toContain('if (!lastToggleTookEffect.current) return;');
  });

  it('gives a text post the ladder without costing it instant navigation', () => {
    // The body carries no single-tap action, so there is nothing to hold back
    // while a second tap is awaited — the same reason Instagram's double-tap
    // has no lag. Tapping the rest of the card still opens the post at once.
    expect(POST).toContain('const tapGestures = useTapGestures({');
    expect(POST).not.toMatch(/useTapGestures\(\{[^}]*onSingleTap/s);
    // The body sits inside `data-no-navigate` and carries the ladder.
    expect(POST).toMatch(/data-no-navigate\s*\n\s*>\s*\n[\s\S]*?\{\.\.\.tapGestures\}/);

    // ...but the ladder stops at the body. It used to sit on the wrapper that
    // also holds the action bar, the shop board and the comments block, so
    // double-clicking to select a word in a comment cast a like and a
    // triple-click cast a love. Whatever carries tapGestures must close before
    // ActionBar, or that comes back.
    const ladderStart = POST.indexOf('{...tapGestures}');
    const ladderEnd = POST.indexOf('</div>', POST.indexOf('<FeedLinkPreviews'));
    const actionBar = POST.indexOf('<ActionBar');
    const comments = POST.indexOf('<CommentsWrapper');
    expect(ladderStart).toBeGreaterThan(-1);
    expect(actionBar).toBeGreaterThan(ladderEnd);
    expect(comments).toBeGreaterThan(ladderEnd);
  });

  it('leaves a hold on post text alone, so it can still be selected', () => {
    // A long press on text is how you select it; taking that over would cost
    // copy/paste on every text post. The tray is still on the ActionBar thumb.
    expect(POST).toMatch(/useTapGestures\(\{[\s\S]*?enableLongPress: false/);
  });

  it('carries no second mute control on the text post header', () => {
    // The ✕ fired the same handleMuteAuthor the ⋯ menu already calls, and no
    // other card had one.
    expect(POST).not.toContain('aria-label="Mute this account"');
  });

  it('keeps muting reachable from the menu on all three cards', () => {
    for (const [name, src] of [
      ['PostCard', POST],
      ['VideoCard', VIDEO_CARD],
      ['ImageCard', IMAGE_CARD],
    ] as const) {
      expect(src, name).toContain("postOptions.blockCreator");
    }
  });

  it('keeps tap-to-pause instant on shorts', () => {
    // The whole point of the undo path: no 260ms wait on the primary gesture.
    expect(SLIDE).toContain('onUndoSingleTap: () => (onTapUndo ?? onTap)?.()');
  });

  it('stays off a gated card, where there is nothing to react to yet', () => {
    // TapReactionBurst sits inside VideoCard's !isContentGated block, so a
    // PPV / holdings-locked / mature-gated card would take the gesture and
    // show nothing back. ImageCard already opts out by construction.
    expect(VIDEO_CARD).toContain('|| isContentGated,');
  });
});
