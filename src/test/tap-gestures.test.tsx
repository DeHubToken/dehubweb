import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTapGestures } from '@/hooks/use-tap-gestures';
import {
  DOUBLE_TAP_LIKE_EVENT,
  OPEN_REACTIONS_EVENT,
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
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
let opens: string[];
let onCast: EventListener;
let onOpen: EventListener;

beforeEach(() => {
  vi.useFakeTimers();
  casts = [];
  opens = [];
  onCast = (e) => casts.push((e as CustomEvent<DoubleTapLikeEventDetail>).detail);
  onOpen = (e) => opens.push((e as CustomEvent<{ postId: string }>).detail.postId);
  window.addEventListener(DOUBLE_TAP_LIKE_EVENT, onCast);
  window.addEventListener(OPEN_REACTIONS_EVENT, onOpen);
});

afterEach(() => {
  // These are window listeners: without removal they accumulate across cases
  // and every later assertion counts the earlier tests' events too.
  window.removeEventListener(DOUBLE_TAP_LIKE_EVENT, onCast);
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

    act(() => void vi.advanceTimersByTime(300));
    expect(onSingleTap).toHaveBeenCalledTimes(1);
    expect(casts).toEqual([]);
  });

  it('likes on a double tap and cancels the single tap', () => {
    const onSingleTap = vi.fn();
    const h = mountGesture({ postId: '7', onSingleTap });

    tapAt(h);
    act(() => void vi.advanceTimersByTime(80));
    tapAt(h);

    expect(casts.map((c) => c.reaction)).toEqual(['like']);
    act(() => void vi.advanceTimersByTime(500));
    expect(onSingleTap).not.toHaveBeenCalled();
  });

  it('casts the like immediately rather than waiting for a possible third tap', () => {
    // The point of the gesture is that it feels instant.
    const h = mountGesture({ postId: '7' });
    tapAt(h);
    act(() => void vi.advanceTimersByTime(80));
    tapAt(h);
    expect(casts).toHaveLength(1);
  });

  it('upgrades to love on a third tap', () => {
    const h = mountGesture({ postId: '7' });

    tapAt(h);
    act(() => void vi.advanceTimersByTime(80));
    tapAt(h);
    act(() => void vi.advanceTimersByTime(80));
    tapAt(h);

    expect(casts.map((c) => c.reaction)).toEqual(['like', 'love']);
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
    expect(casts.map((c) => c.reaction)).toEqual(['like', 'love']);
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

  it('never lets a gesture clear a reaction the viewer already holds', () => {
    // handleReaction reads a repeat as "toggle off", so casting blind would let
    // a stray double-tap silently remove a like. Both listeners must guard.
    for (const [name, src] of [['ActionBar', ACTION_BAR], ['ShortsViewer', SHORTS]] as const) {
      expect(src, name).toContain('if (myReaction === reaction) return;');
      expect(src, name).toContain("if (reaction === 'like' && isLiked) return;");
    }
  });

  it('leaves the immersive player its own double-tap for seek', () => {
    // Double-tap-to-seek is the gesture people already use to scrub a video.
    expect(VIDEO_CARD).toContain('disabled: isImmersive || hideActions || !!video.isAudio');
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
    expect(POST).toMatch(/data-no-navigate\s*\n\s*\{\.\.\.tapGestures\}/);
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
});
