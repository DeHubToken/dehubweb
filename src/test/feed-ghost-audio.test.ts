import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  claimHandoffVideo,
  handoffVideoHolder,
  isHandoffVideoActive,
  releaseHandoffVideo,
  takeHandoffVideo,
} from '@/lib/video-handoff';

/**
 * Scrolling past a feed video left its sound playing, and scrolling back
 * showed that video paused. Two ways in:
 *
 * - The same post on screen twice (a pinned or boosted copy, a repeated feed
 *   page). The newer card took the shared <video> while it played, so the
 *   sound carried on from a slot nobody could see, and the card the viewer
 *   was watching was left with just its poster.
 * - A soundtrack <audio> only followed the card's own play state, so a pause
 *   from anywhere else left the soundtrack running over a stopped video.
 */

/** jsdom implements neither play() nor pause(); stand in ones that move `paused`. */
function makePlayable<T extends HTMLMediaElement>(el: T): T {
  let paused = true;
  Object.defineProperty(el, 'paused', { get: () => paused, configurable: true });
  el.pause = vi.fn(() => {
    if (paused) return;
    paused = true;
    el.dispatchEvent(new Event('pause'));
  });
  el.play = vi.fn(() => {
    paused = false;
    el.dispatchEvent(new Event('play'));
    el.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  });
  el.load = vi.fn();
  return el;
}

const tokens: Array<[string, object]> = [];
afterEach(() => {
  tokens.splice(0).forEach(([key, token]) => releaseHandoffVideo(key, token));
  document.body.innerHTML = '';
});

function slot() {
  const s = document.createElement('div');
  document.body.appendChild(s);
  return s;
}

describe('a second copy of a post cannot keep the first one playing out of sight', () => {
  it('taking the element back moves it to the taker, paused', () => {
    const watched = slot();
    const duplicate = slot();
    const a = claimHandoffVideo('ghost-1', watched);
    tokens.push(['ghost-1', a.token]);
    makePlayable(a.el);
    a.el.play();

    // The duplicate further down mounts and, as before, ends up holding it.
    const b = claimHandoffVideo('ghost-1', duplicate);
    tokens.push(['ghost-1', b.token]);
    expect(handoffVideoHolder('ghost-1')).toBe(duplicate);

    // The watched card wants to play again: it gets the element, and nothing
    // the duplicate was doing comes with it.
    const el = takeHandoffVideo('ghost-1', a.token);
    expect(el).toBe(a.el);
    expect(isHandoffVideoActive('ghost-1', watched)).toBe(true);
    expect(isHandoffVideoActive('ghost-1', duplicate)).toBe(false);
    expect(a.el.paused).toBe(true);
  });

  it('taking it while already holding it leaves playback alone', () => {
    const s = slot();
    const a = claimHandoffVideo('ghost-2', s);
    tokens.push(['ghost-2', a.token]);
    makePlayable(a.el);
    a.el.play();
    expect(takeHandoffVideo('ghost-2', a.token)).toBe(a.el);
    expect(a.el.paused).toBe(false);
  });

  it('an unknown claim takes nothing', () => {
    const s = slot();
    const a = claimHandoffVideo('ghost-3', s);
    tokens.push(['ghost-3', a.token]);
    expect(takeHandoffVideo('ghost-3', {})).toBeNull();
    expect(takeHandoffVideo('nope', a.token)).toBeNull();
  });
});
