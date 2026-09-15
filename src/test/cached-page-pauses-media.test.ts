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
    expect(SOURCE).toMatch(/pauseOffDocumentMediaIn\(root, overlayKey\)/);
    expect(SOURCE).toMatch(/resumeMedia\(resumeRef\.current\)/);
    expect(SOURCE).toMatch(/\}, \[isActive, shouldStayVisible, overlayKey\]\)/);
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
    expect(SOURCE).toMatch(/handedOverRef\.current = !!el;[\s\S]{0,400}releaseOffDocument\(\)/);
  });
});

/**
 * Every other player built the same way. `new Audio()` is the whole tell: the
 * element never enters the document, so the sweep above cannot see it, and the
 * sound outlives the page it belongs to. These are the rest of them.
 */
const OFF_DOCUMENT_PLAYERS = [
  {
    what: 'a voice note on a comment',
    file: '../components/app/cards/CommentsSection.tsx',
    registers: /registerOffDocumentMedia\(el, \(\) => buttonRef\.current\)/,
    releases: /unregisterMediaRef\.current\?\.\(\);\s*\n\s*unregisterMediaRef\.current = null;/,
  },
  {
    what: "the comment composer's own preview",
    file: '../components/app/cards/CommentsSection.tsx',
    registers: /registerOffDocumentMedia\(el, \(\) => sectionRef\.current\)/,
    releases: /unregisterPreviewRef\.current\?\.\(\);\s*\n\s*unregisterPreviewRef\.current = null;/,
  },
  {
    what: 'a DM voice message waveform',
    file: '../components/app/chat/VoiceWaveformPlayer.tsx',
    registers: /registerOffDocumentMedia\(audio, \(\) => canvasRef\.current\)/,
    releases: /return \(\) => \{\s*\n\s*unregisterMedia\(\);/,
  },
  {
    what: 'a DM voice message bubble',
    file: '../components/app/chat/DirectMessageChat.tsx',
    registers: /registerOffDocumentMedia\(el, \(\) => buttonRef\.current\)/,
    releases: /unregisterMediaRef\.current\?\.\(\);\s*\n\s*unregisterMediaRef\.current = null;/,
  },
  {
    what: 'a track the assistant generated',
    file: '../components/app/assistant/GeneratedAudioPlayer.tsx',
    registers: /registerOffDocumentMedia\(audio, \(\) => containerRef\.current\)/,
    releases: /return \(\) => \{\s*\n\s*unregisterMedia\(\);/,
  },
  {
    what: 'a track in the assistant history drawer',
    file: '../components/app/assistant/ConversationHistoryDrawer.tsx',
    registers: /registerOffDocumentMedia\(el, pageAnchor\)/,
    releases: /unregisterMediaRef\.current\?\.\(\);\s*\n\s*unregisterMediaRef\.current = null;/,
  },
] as const;

describe.each(OFF_DOCUMENT_PLAYERS)('$what', ({ file, registers, releases }) => {
  const SOURCE = readFileSync(resolve(__dirname, file), 'utf8');

  it('registers its element against a node that is actually rendered', () => {
    expect(SOURCE).toMatch(registers);
  });

  it('drops the registration when the player is torn down', () => {
    // A registration left behind outlives its element: the map would hold the
    // only reference to it, and a later sweep would resume a dead player.
    expect(SOURCE).toMatch(releases);
  });
});

describe('the assistant history drawer anchors outside its own portal', () => {
  const SOURCE = readFileSync(
    resolve(__dirname, '../components/app/assistant/ConversationHistoryDrawer.tsx'),
    'utf8',
  );

  it('renders the anchor in the page, next to the Drawer rather than inside it', () => {
    // Verified against vaul: DrawerContent portals to <body>, so a node inside
    // it belongs to no page at all and `root.contains` can never match. The
    // drawer is the one player here that cannot anchor on its own button.
    expect(SOURCE).toMatch(/<span ref=\{pageAnchorRef\} hidden aria-hidden="true" \/>\s*\n\s*<Drawer/);
  });

  it('hands the same anchor to every row, so one navigation stops them all', () => {
    expect(SOURCE).toMatch(/pageAnchor=\{pageAnchor\}/);
    expect(SOURCE).toMatch(/const pageAnchor = useCallback\(\(\) => pageAnchorRef\.current, \[\]\)/);
  });
});

describe('a page with several off-document players on it', () => {
  let root: HTMLDivElement;
  let elsewhere: HTMLDivElement;
  const registered: (() => void)[] = [];

  const register = (el: HTMLMediaElement, node: Node | null) => {
    registered.push(registerOffDocumentMedia(el, () => node));
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    elsewhere = document.createElement('div');
    document.body.append(root, elsewhere);
  });

  afterEach(() => {
    registered.splice(0).forEach((off) => off());
  });

  it('stops all of them on the way out and starts all of them on the way back', () => {
    // A comment thread can have a voice note per row and one more in the
    // composer. Stopping only the first would be the same bug with a smaller
    // blast radius.
    const anchors = [0, 1, 2].map(() => {
      const button = document.createElement('button');
      root.appendChild(button);
      return button;
    });
    const players = anchors.map((anchor) => {
      const el = fakeMedia('audio', true);
      register(el, anchor);
      return el;
    });

    const paused = pauseMediaIn(root);
    expect(paused).toHaveLength(3);
    expect(players.every((el) => el.paused)).toBe(true);

    resumeMedia(paused);
    expect(players.every((el) => !el.paused)).toBe(true);
  });

  it('leaves a player mounted outside the cache alone', () => {
    // SidebarChat and the DM dock render their voice messages from AppLayout,
    // OUTSIDE PersistentPageCache, precisely so they follow the user between
    // pages — the same exemption the radio has. Their anchors are in no cached
    // page, so no page's sweep claims them.
    const docked = fakeMedia('audio', true);
    register(docked, elsewhere);
    const onPage = fakeMedia('audio', true);
    register(onPage, root);

    expect(pauseMediaIn(root)).toEqual([onPage]);
    expect(docked.paused).toBe(false);
  });

  it('counts an anchor nested deep in the page, not just a direct child', () => {
    // Every real anchor here is buried: a button inside a bubble inside a list.
    const deep = document.createElement('canvas');
    const wrapper = document.createElement('div');
    wrapper.appendChild(deep);
    root.appendChild(wrapper);
    const el = fakeMedia('audio', true);
    register(el, deep);

    expect(pauseOffDocumentMediaIn(root)).toEqual([el]);
  });
});
