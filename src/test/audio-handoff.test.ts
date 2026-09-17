import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  claimHandoffAudio,
  detachHandoffAudio,
  getHandoffAudio,
  isHandoffAudioActive,
  releaseHandoffAudio,
  setHandoffAudio,
  subscribeHandoffAudio,
} from '@/lib/audio-handoff';
import { pauseMediaIn, pauseOffDocumentMediaIn } from '@/lib/pause-media-in';

/**
 * Opening an audio post from the feed used to start it again at 0:00 while the
 * feed's own copy carried on behind the overlay. Cards showing the same post
 * now share one player, the innermost claim drives it, and closing the post
 * hands it back down to the feed card — which never unmounted.
 */

/** An <audio> whose paused flag actually moves; jsdom implements neither call. */
function fakeAudio(playing = false) {
  const el = document.createElement('audio');
  let paused = !playing;
  Object.defineProperty(el, 'paused', { get: () => paused, configurable: true });
  el.pause = vi.fn(() => {
    paused = true;
  });
  el.play = vi.fn(() => {
    paused = false;
    return Promise.resolve();
  });
  return el;
}

describe('lib/audio-handoff', () => {
  let feedCanvas: HTMLCanvasElement;
  let postCanvas: HTMLCanvasElement;
  let home: HTMLDivElement;
  let overlay: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    home = document.createElement('div');
    overlay = document.createElement('div');
    document.body.append(home, overlay);
    feedCanvas = document.createElement('canvas');
    postCanvas = document.createElement('canvas');
    home.appendChild(feedCanvas);
    overlay.appendChild(postCanvas);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('hands a running player to the card that claims on top of it', () => {
    const feed = claimHandoffAudio('5682', () => feedCanvas);
    const el = fakeAudio(true);
    setHandoffAudio('5682', feed, { el, source: null, analyser: null });

    const post = claimHandoffAudio('5682', () => postCanvas);

    expect(isHandoffAudioActive('5682', post)).toBe(true);
    expect(isHandoffAudioActive('5682', feed)).toBe(false);
    // Same element, still playing, position untouched — that is the whole point.
    expect(getHandoffAudio('5682', post)?.el).toBe(el);
    expect(el.paused).toBe(false);
    expect(el.pause).not.toHaveBeenCalled();

    releaseHandoffAudio('5682', post);
    releaseHandoffAudio('5682', feed);
  });

  it('hands it back down when the post page closes', () => {
    const feed = claimHandoffAudio('5682', () => feedCanvas);
    const el = fakeAudio(true);
    setHandoffAudio('5682', feed, { el, source: null, analyser: null });
    const post = claimHandoffAudio('5682', () => postCanvas);

    releaseHandoffAudio('5682', post);

    expect(isHandoffAudioActive('5682', feed)).toBe(true);
    expect(getHandoffAudio('5682', feed)?.el).toBe(el);
    expect(el.paused).toBe(false);

    releaseHandoffAudio('5682', feed);
  });

  it('tells every card when the player changes hands', () => {
    const seen = vi.fn();
    const stop = subscribeHandoffAudio('5682', seen);
    const feed = claimHandoffAudio('5682', () => feedCanvas);
    const post = claimHandoffAudio('5682', () => postCanvas);
    releaseHandoffAudio('5682', post);

    expect(seen).toHaveBeenCalledTimes(3);
    stop();
    releaseHandoffAudio('5682', feed);
  });

  it('lets only the holder install a graph', () => {
    const feed = claimHandoffAudio('5682', () => feedCanvas);
    const post = claimHandoffAudio('5682', () => postCanvas);
    const stale = fakeAudio();

    setHandoffAudio('5682', feed, { el: stale, source: null, analyser: null });

    expect(getHandoffAudio('5682', post)).toBeNull();
    releaseHandoffAudio('5682', post);
    releaseHandoffAudio('5682', feed);
  });

  it('tears the player down once nothing is holding it', () => {
    const feed = claimHandoffAudio('lonely', () => feedCanvas);
    const el = fakeAudio(true);
    setHandoffAudio('lonely', feed, { el, source: null, analyser: null });

    releaseHandoffAudio('lonely', feed);
    expect(el.paused).toBe(false); // parked, not disposed: a claim may still arrive

    vi.advanceTimersByTime(2500);
    expect(el.paused).toBe(true);
    expect(el.getAttribute('src')).toBeNull();
  });

  it('keeps it alive for a claim that arrives behind a lazy chunk', () => {
    const feed = claimHandoffAudio('late', () => feedCanvas);
    const el = fakeAudio(true);
    setHandoffAudio('late', feed, { el, source: null, analyser: null });
    releaseHandoffAudio('late', feed);

    vi.advanceTimersByTime(500);
    const post = claimHandoffAudio('late', () => postCanvas);
    vi.advanceTimersByTime(5000);

    expect(el.paused).toBe(false);
    expect(getHandoffAudio('late', post)?.el).toBe(el);
    releaseHandoffAudio('late', post);
  });

  it('lets the corner player take the track out without tearing it down', () => {
    const feed = claimHandoffAudio('5682', () => feedCanvas);
    const el = fakeAudio(true);
    setHandoffAudio('5682', feed, { el, source: null, analyser: null });

    detachHandoffAudio('5682');
    vi.advanceTimersByTime(5000);

    expect(el.paused).toBe(false);
    expect(getHandoffAudio('5682', feed)).toBeNull();
    releaseHandoffAudio('5682', feed);
  });

  describe('which page the sound counts as being on', () => {
    it('follows the claim, not a render', () => {
      const feed = claimHandoffAudio('5682', () => feedCanvas);
      const el = fakeAudio(true);
      setHandoffAudio('5682', feed, { el, source: null, analyser: null });

      // Held by the feed card: home owns the sound.
      expect(pauseMediaIn(overlay)).toEqual([]);
      expect(pauseMediaIn(home)).toEqual([el]);
      el.play();

      const post = claimHandoffAudio('5682', () => postCanvas);
      // The instant the post page claims it — no re-registration, no render.
      expect(pauseMediaIn(home)).toEqual([]);
      expect(pauseMediaIn(overlay)).toEqual([el]);

      releaseHandoffAudio('5682', post);
      releaseHandoffAudio('5682', feed);
    });

    it('spares the post being opened, and stops everything else in the feed', () => {
      // The overlay sweep runs a commit before the post page's card claims, so
      // the track being opened has to be named or it would be paused in transit.
      const opened = claimHandoffAudio('5682', () => feedCanvas);
      const openedEl = fakeAudio(true);
      setHandoffAudio('5682', opened, { el: openedEl, source: null, analyser: null });

      const other = claimHandoffAudio('4111', () => feedCanvas);
      const otherEl = fakeAudio(true);
      setHandoffAudio('4111', other, { el: otherEl, source: null, analyser: null });

      expect(pauseOffDocumentMediaIn(home, '5682')).toEqual([otherEl]);
      expect(openedEl.paused).toBe(false);
      expect(otherEl.paused).toBe(true);

      releaseHandoffAudio('5682', opened);
      releaseHandoffAudio('4111', other);
    });
  });
});

describe('the cards are wired to the pool', () => {
  const VISUALIZER = readFileSync(
    resolve(__dirname, '../components/app/audio/AudioVisualizer.tsx'),
    'utf8',
  );
  const CARD = readFileSync(resolve(__dirname, '../components/app/cards/VideoCard.tsx'), 'utf8');
  const CACHE = readFileSync(
    resolve(__dirname, '../components/app/PersistentPageCache.tsx'),
    'utf8',
  );

  it('keys both cards for a post on the same id', () => {
    expect(CARD).toContain('handoffKey={video.id}');
    expect(CARD).toContain('onPlaybackAdopted={handleAudioPlaybackAdopted}');
  });

  it('lets only the holder write to the element', () => {
    // Two cards forwarding play/pause and both setting `muted` is the whole
    // reason the claim exists.
    expect(VISUALIZER).toContain('if (!audioRef.current || isPoppedOut || !isActiveClaim) return;');
    expect(VISUALIZER).toContain('if (!el || !isActiveClaim) return;');
  });

  it('does not tear a pooled player down when the card goes', () => {
    expect(VISUALIZER).toContain('if (!handedOverRef.current && !handoffKeyRef.current) {');
  });

  it('spares the opening post from the overlay sweep', () => {
    expect(CACHE).toContain('pauseOffDocumentMediaIn(root, overlayKey, handoffVideoFor(overlayKey))');
  });
});
