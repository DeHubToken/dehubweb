import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  pauseMediaIn,
  pauseOffDocumentMediaIn,
  registerOffDocumentMedia,
  resumeMedia,
} from '@/lib/pause-media-in';

/**
 * A page in PersistentPageCache is hidden with CSS, never unmounted. CSS does
 * not pause media — only removal from the document does — so a video playing on
 * a page the user navigated away from kept its audio going with no visible
 * player to stop it from. Reproduced on staging: playing a short, then clicking
 * through to Explore, left it at `paused: false, muted: false` with its clock
 * still advancing.
 */

/**
 * jsdom implements neither play() nor pause(), so stand in a minimal media
 * element whose paused flag actually moves.
 */
function fakeMedia(tag: 'video' | 'audio', playing: boolean) {
  const el = document.createElement(tag) as HTMLMediaElement;
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

describe('pauseMediaIn — a hidden cached page stops making noise', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  it('pauses a playing video and reports it for later resumption', () => {
    const video = fakeMedia('video', true);
    root.appendChild(video);

    const paused = pauseMediaIn(root);

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.paused).toBe(true);
    expect(paused).toEqual([video]);
  });

  it('pauses audio elements too, not just video', () => {
    // Audio posts and the soundtrack on an image post are <audio>, and they are
    // the ones where invisible playback is least explicable to the user.
    const audio = fakeMedia('audio', true);
    root.appendChild(audio);

    expect(pauseMediaIn(root)).toEqual([audio]);
    expect(audio.paused).toBe(true);
  });

  it('finds media nested anywhere in the page, not just at the top', () => {
    const deep = document.createElement('div');
    deep.innerHTML = '<div><section><div></div></section></div>';
    root.appendChild(deep);
    const video = fakeMedia('video', true);
    deep.querySelector('div > section > div')!.appendChild(video);

    expect(pauseMediaIn(root)).toEqual([video]);
  });

  it('leaves already-paused media alone so it is not resumed later', () => {
    // Resuming something the user had deliberately paused would be a new bug.
    const idle = fakeMedia('video', false);
    root.appendChild(idle);

    expect(pauseMediaIn(root)).toEqual([]);
    expect(idle.pause).not.toHaveBeenCalled();
  });

  it('never touches media outside the page it was given', () => {
    // The radio and stage-recording mini players live in AppLayout, outside the
    // cache, precisely so they survive navigation.
    const outside = fakeMedia('audio', true);
    document.body.appendChild(outside);
    const inside = fakeMedia('video', true);
    root.appendChild(inside);

    expect(pauseMediaIn(root)).toEqual([inside]);
    expect(outside.pause).not.toHaveBeenCalled();
    expect(outside.paused).toBe(false);
  });

  it('leaves a picture-in-picture video playing', () => {
    // PiP is the one element in a hidden subtree that is still genuinely on
    // screen, in its own window, where the user can see and stop it.
    const pip = fakeMedia('video', true);
    root.appendChild(pip);
    Object.defineProperty(document, 'pictureInPictureElement', {
      value: pip,
      configurable: true,
    });

    expect(pauseMediaIn(root)).toEqual([]);
    expect(pip.pause).not.toHaveBeenCalled();

    Object.defineProperty(document, 'pictureInPictureElement', {
      value: null,
      configurable: true,
    });
  });
});

describe('resumeMedia — coming back restores what was stopped', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('replays exactly the elements that were paused', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const a = fakeMedia('video', true);
    const b = fakeMedia('video', true);
    root.append(a, b);

    resumeMedia(pauseMediaIn(root));

    expect(a.play).toHaveBeenCalledTimes(1);
    expect(b.play).toHaveBeenCalledTimes(1);
    expect(a.paused).toBe(false);
  });

  it('skips an element torn down while the page was hidden', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const gone = fakeMedia('video', true);
    root.appendChild(gone);
    const paused = pauseMediaIn(root);
    gone.remove();

    expect(() => resumeMedia(paused)).not.toThrow();
    expect(gone.play).not.toHaveBeenCalled();
  });

  it('swallows a rejected play() instead of surfacing an unhandled rejection', async () => {
    const el = fakeMedia('video', false);
    document.body.appendChild(el);
    el.play = vi.fn(() => Promise.reject(new Error('NotAllowedError')));

    resumeMedia([el]);
    // A floating rejection would fail the run on the next tick.
    await Promise.resolve();
    expect(el.play).toHaveBeenCalled();
  });
});

describe('PersistentPageCache wires the pause to the hide', () => {
  const SOURCE = readFileSync(
    resolve(__dirname, '../components/app/PersistentPageCache.tsx'),
    'utf8',
  );

  it('drives the two sweeps off the flags that hide the page', () => {
    // `shouldStayVisible` is what writes `visibility: hidden`, so it decides
    // the full sweep. `isActive` is the narrower one: a page still visible
    // only because a post overlay sits above it keeps its <video> — the post
    // page takes that very element over — and loses everything off-document.
    expect(SOURCE).toMatch(/pauseMediaIn\(root\)/);
    expect(SOURCE).toMatch(/pauseOffDocumentMediaIn\(root\)/);
    expect(SOURCE).toMatch(/resumeMedia\(resumeRef\.current\)/);
    expect(SOURCE).toMatch(/\}, \[isActive, shouldStayVisible\]\)/);
  });
});

/**
 * An audio post plays through a bare `new Audio()` that is never put in the
 * document — the canvas is the thing on screen. `querySelectorAll` cannot see
 * it, so the sweep above walked straight past a playing track: reproduced on
 * production, a track started in the feed was still at `paused: false` with its
 * clock at 56s after clicking through to the post page and then to Explore.
 */
describe('off-document players — the sound with nothing in the DOM to find', () => {
  let root: HTMLDivElement;
  let anchor: HTMLCanvasElement;
  const registered: (() => void)[] = [];

  const register = (el: HTMLMediaElement, node: Node | null) => {
    const off = registerOffDocumentMedia(el, () => node);
    registered.push(off);
    return off;
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    anchor = document.createElement('canvas');
    root.appendChild(anchor);
  });

  afterEach(() => {
    registered.splice(0).forEach((off) => off());
  });

  it('pauses one registered against a node inside the page', () => {
    const track = fakeMedia('audio', true);
    register(track, anchor);

    expect(pauseMediaIn(root)).toEqual([track]);
    expect(track.paused).toBe(true);
  });

  it('leaves one anchored on a different page alone', () => {
    const elsewhere = document.createElement('canvas');
    document.body.appendChild(elsewhere);
    const track = fakeMedia('audio', true);
    register(track, elsewhere);

    expect(pauseMediaIn(root)).toEqual([]);
    expect(track.paused).toBe(false);
  });

  it('forgets one whose registration has been dropped', () => {
    // The corner player takes the element over and is meant to keep playing
    // across navigation, exactly like the radio.
    const track = fakeMedia('audio', true);
    const handOver = register(track, anchor);
    handOver();

    expect(pauseMediaIn(root)).toEqual([]);
    expect(track.paused).toBe(false);
  });

  it('ignores one whose anchor has since unmounted', () => {
    const track = fakeMedia('audio', true);
    register(track, null);

    expect(pauseMediaIn(root)).toEqual([]);
  });

  it('resumes one on return, though it is never connected to the document', () => {
    const track = fakeMedia('audio', true);
    register(track, anchor);

    resumeMedia(pauseMediaIn(root));

    expect(track.isConnected).toBe(false);
    expect(track.play).toHaveBeenCalledTimes(1);
    expect(track.paused).toBe(false);
  });

  it('does not resume one that was torn down while the page was hidden', () => {
    const track = fakeMedia('audio', true);
    const drop = register(track, anchor);
    const paused = pauseMediaIn(root);
    drop();

    resumeMedia(paused);

    expect(track.play).not.toHaveBeenCalled();
  });
});

describe('pauseOffDocumentMediaIn — the post overlay, where home stays visible', () => {
  let root: HTMLDivElement;
  let anchor: HTMLCanvasElement;
  const registered: (() => void)[] = [];

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    anchor = document.createElement('canvas');
    root.appendChild(anchor);
  });

  afterEach(() => {
    registered.splice(0).forEach((off) => off());
  });

  it('stops an audio post playing in the feed behind the open post', () => {
    const track = fakeMedia('audio', true);
    registered.push(registerOffDocumentMedia(track, () => anchor));

    expect(pauseOffDocumentMediaIn(root)).toEqual([track]);
    expect(track.paused).toBe(true);
  });

  it('leaves the feed <video> alone, because opening the post takes that element with it', () => {
    // lib/video-handoff moves the live element up into the post page. Pausing
    // it here would stop the clip the user just opened.
    const clip = fakeMedia('video', true);
    root.appendChild(clip);

    expect(pauseOffDocumentMediaIn(root)).toEqual([]);
    expect(clip.pause).not.toHaveBeenCalled();
  });
});

describe('AudioVisualizer puts its element on the page cache books', () => {
  const SOURCE = readFileSync(
    resolve(__dirname, '../components/app/audio/AudioVisualizer.tsx'),
    'utf8',
  );

  it('registers the element it builds against the canvas', () => {
    expect(SOURCE).toMatch(/registerOffDocumentMedia\(el, \(\) => canvasRef\.current\)/);
  });

  it('gives the claim up when the corner player takes the track', () => {
    // The corner player is mounted outside the cache so it can outlive the
    // route. Keeping the registration would have the next navigation pause it.
    expect(SOURCE).toMatch(/handedOverRef\.current = !!el;[\s\S]{0,200}releaseOffDocument\(\)/);
  });
});
