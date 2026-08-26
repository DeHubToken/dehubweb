import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pauseMediaIn, resumeMedia } from '@/lib/pause-media-in';

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

  it('drives both helpers off the same flag that hides the page', () => {
    // `shouldStayVisible` is what writes `visibility: hidden`. Pausing on any
    // other signal (isActive alone) would stop the home feed while a post
    // overlay is open above it, which is the one case where a hidden-looking
    // page is deliberately still visible.
    expect(SOURCE).toMatch(/pauseMediaIn\(root\)/);
    expect(SOURCE).toMatch(/resumeMedia\(resumeRef\.current\)/);
    expect(SOURCE).toMatch(/\}, \[shouldStayVisible\]\)/);
  });
});
