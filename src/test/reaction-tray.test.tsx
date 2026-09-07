import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useReactionTray, type ReactionTray } from '@/hooks/use-reaction-tray';

/**
 * Two trays on one row — the thumbs-up's faces and whatever the thumbs-down
 * has to offer — and the rule that only one of them is ever up. The negative
 * side holds a single 👎 today and so opens nothing, but the exclusion rule is
 * what breaks the moment it has a second, so it is tested on its own here.
 *
 * Every surface that carries the pair (ActionBar, ShortsViewer, a comment row,
 * an author-thread entry) writes that rule the same way:
 *
 *   useEffect(() => { if (a.open) b.close(); }, [a.open, b.close]);
 *   useEffect(() => { if (b.open) a.close(); }, [b.open, a.close]);
 *
 * which only works because `close` and `openNow` keep the same identity across
 * renders. Depend on the tray OBJECT instead — it is a fresh literal every
 * render — and both effects run on every render, so a moment with both open
 * has each closing the other and the reader gets neither. This file pins both
 * halves: the identities are stable, and the pair behaves.
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

interface Harness {
  like: ReactionTray;
  dislike: ReactionTray;
  /** How many times the component has rendered — the effects must not force more. */
  renders: number;
  /** Distinct identities seen for the callbacks the effects depend on. */
  closeIdentities: Set<unknown>;
}

function mountPair() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const state: Harness = {
    like: null as unknown as ReactionTray,
    dislike: null as unknown as ReactionTray,
    renders: 0,
    closeIdentities: new Set(),
  };

  function Probe() {
    const like = useReactionTray(true);
    const dislike = useReactionTray(true);
    state.like = like;
    state.dislike = dislike;
    state.renders += 1;
    state.closeIdentities.add(like.close);
    state.closeIdentities.add(dislike.close);

    // The exact pair every surface carries.
    useEffect(() => { if (like.open) dislike.close(); }, [like.open, dislike.close]);
    useEffect(() => { if (dislike.open) like.close(); }, [dislike.open, like.close]);
    return null;
  }

  const root = createRoot(host);
  act(() => root.render(createElement(Probe)));
  return { state, unmount: () => act(() => root.unmount()) };
}

let harness: ReturnType<typeof mountPair>;

beforeEach(() => {
  vi.useFakeTimers();
  harness = mountPair();
});

afterEach(() => {
  harness.unmount();
  vi.useRealTimers();
});

describe('the two trays on one row', () => {
  it('keeps close and openNow stable across renders', () => {
    const { state } = harness;
    const before = { close: state.like.close, open: state.like.openNow };

    act(() => state.dislike.openNow());
    act(() => state.dislike.close());

    expect(state.renders).toBeGreaterThan(1);
    expect(state.like.close).toBe(before.close);
    expect(state.like.openNow).toBe(before.open);
    // Two trays, one identity each, however many renders happened.
    expect(state.closeIdentities.size).toBe(2);
  });

  it('lets the newly opened tray win instead of closing both', () => {
    const { state } = harness;

    act(() => state.like.openNow());
    expect(state.like.open).toBe(true);

    // Open the other one while the first is still up — the case a hold inside
    // the hover grace produces. The dislike tray is the one the reader asked
    // for, so it is the one that must survive.
    act(() => state.dislike.openNow());

    expect(state.dislike.open).toBe(true);
    expect(state.like.open).toBe(false);
  });

  it('opens on a hold and swallows the click that ends it', () => {
    const { state } = harness;

    act(() => state.like.buttonProps.onPointerDown());
    expect(state.like.open).toBe(false);
    // 400ms is the hold, matched to the mobile bar's delayLongPress.
    act(() => { vi.advanceTimersByTime(400); });
    expect(state.like.open).toBe(true);

    // The click arriving at the end of that press must not also cast a vote,
    // and the guard clears itself so the next real click does.
    expect(state.like.consumePress()).toBe(true);
    expect(state.like.consumePress()).toBe(false);
  });

  it('does not open when a press is released early', () => {
    const { state } = harness;

    act(() => state.like.buttonProps.onPointerDown());
    act(() => { vi.advanceTimersByTime(200); });
    act(() => state.like.buttonProps.onPointerUp());
    act(() => { vi.advanceTimersByTime(400); });

    expect(state.like.open).toBe(false);
    expect(state.like.consumePress()).toBe(false);
  });
});
