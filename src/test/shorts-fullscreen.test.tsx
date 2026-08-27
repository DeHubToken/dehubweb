import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVideoFullscreen } from '@/hooks/use-video-fullscreen';

/**
 * The shorts viewer shipped with no way to go fullscreen at all — 46 controls on
 * the page and not one of them fullscreen, while the feed's VideoCard had a
 * button all along. Reported as "I cant see anyway to full screen a video from
 * this spot", and confirmed live before this was written.
 *
 * Rendered with react-dom directly rather than @testing-library/react: this repo
 * only needs the hook's return value, and the extra dependency buys nothing.
 */
// React only treats act() as supported when this is set, and warns on every
// render otherwise. Vitest does not set it for us.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function renderHook<T>(useIt: () => T) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const result = { current: undefined as T };
  function Probe() {
    result.current = useIt();
    return null;
  }
  const root = createRoot(host);
  act(() => {
    root.render(createElement(Probe));
  });
  return { result, unmount: () => act(() => root.unmount()) };
}

function refs(container: HTMLElement, video?: HTMLVideoElement) {
  return {
    videoRef: { current: video ?? null },
    containerRef: { current: container as HTMLElement | null },
  };
}

function setNativeFullscreen(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { value: el, configurable: true });
}

afterEach(() => {
  setNativeFullscreen(null);
  vi.restoreAllMocks();
});

describe('useVideoFullscreen', () => {
  it('requests fullscreen on the container, not the bare video', () => {
    // The container carries the seek strip and the play indicator; fullscreening
    // the <video> alone would leave every control behind.
    const container = document.createElement('div');
    const request = vi.fn(() => Promise.resolve());
    (container as any).requestFullscreen = request;
    const { videoRef, containerRef } = refs(container);

    const { result } = renderHook(() => useVideoFullscreen(videoRef, containerRef));
    act(() => result.current.toggleFullscreen());

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('exits when already natively fullscreen', () => {
    const container = document.createElement('div');
    (container as any).requestFullscreen = vi.fn(() => Promise.resolve());
    const exit = vi.fn();
    (document as any).exitFullscreen = exit;
    setNativeFullscreen(container);
    const { videoRef, containerRef } = refs(container);

    const { result } = renderHook(() => useVideoFullscreen(videoRef, containerRef));
    act(() => result.current.toggleFullscreen());

    expect(exit).toHaveBeenCalledTimes(1);
    expect((container as any).requestFullscreen).not.toHaveBeenCalled();
  });

  it('prefers webkitEnterFullscreen on iOS, where element fullscreen does not exist', () => {
    const container = document.createElement('div');
    (container as any).requestFullscreen = vi.fn(() => Promise.resolve());
    const video = document.createElement('video');
    (video as any).webkitEnterFullscreen = vi.fn();
    const { videoRef, containerRef } = refs(container, video);

    const { result } = renderHook(() => useVideoFullscreen(videoRef, containerRef));
    act(() => result.current.toggleFullscreen());

    expect((video as any).webkitEnterFullscreen).toHaveBeenCalledTimes(1);
    expect((container as any).requestFullscreen).not.toHaveBeenCalled();
  });

  it('falls back to simulated fullscreen when a WebView resolves but does nothing', async () => {
    // SafePal's WebView exposes requestFullscreen, resolves it, and never enters
    // fullscreen. Only the delayed re-check catches that.
    vi.useFakeTimers();
    const container = document.createElement('div');
    (container as any).requestFullscreen = vi.fn(() => Promise.resolve());
    const { videoRef, containerRef } = refs(container);

    const { result } = renderHook(() => useVideoFullscreen(videoRef, containerRef));
    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.isFullscreen).toBe(true);
    vi.useRealTimers();
  });

  it('falls back to simulated fullscreen when the API is absent entirely', () => {
    const container = document.createElement('div');
    const { videoRef, containerRef } = refs(container);

    const { result } = renderHook(() => useVideoFullscreen(videoRef, containerRef));
    act(() => result.current.toggleFullscreen());

    expect(result.current.isFullscreen).toBe(true);
  });

  it('refuses to fake fullscreen when the caller cannot paint one', async () => {
    // The shorts carousel translateY's every slide, and a transformed ancestor
    // makes the `fixed inset-0` simulated fullscreen relies on resolve against
    // that wrapper instead of the viewport. Landing somewhere arbitrary is worse
    // than doing nothing, so those callers opt out.
    vi.useFakeTimers();
    const container = document.createElement('div');
    (container as any).requestFullscreen = vi.fn(() => Promise.resolve());
    const { videoRef, containerRef } = refs(container);

    const { result } = renderHook(() =>
      useVideoFullscreen(videoRef, containerRef, { allowSimulated: false }),
    );
    act(() => result.current.toggleFullscreen());
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.isFullscreen).toBe(false);
    vi.useRealTimers();
  });

  it('still tries the real API when the simulated fallback is refused', () => {
    // Opting out must not disable fullscreen itself — native fullscreen goes to
    // the top layer, where no ancestor transform applies.
    const container = document.createElement('div');
    const request = vi.fn(() => Promise.resolve());
    (container as any).requestFullscreen = request;
    const { videoRef, containerRef } = refs(container);

    const { result } = renderHook(() =>
      useVideoFullscreen(videoRef, containerRef, { allowSimulated: false }),
    );
    act(() => result.current.toggleFullscreen());

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('leaves simulated fullscreen without calling exitFullscreen', () => {
    // There is no native state to exit, and calling exitFullscreen here throws
    // in some browsers.
    const container = document.createElement('div');
    const exit = vi.fn();
    (document as any).exitFullscreen = exit;
    const { videoRef, containerRef } = refs(container);

    const { result } = renderHook(() => useVideoFullscreen(videoRef, containerRef));
    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(true);

    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(false);
    expect(exit).not.toHaveBeenCalled();
  });
});

describe('the two players share one fullscreen implementation', () => {
  const SLIDE = readFileSync(
    resolve(__dirname, '../components/app/cards/VideoSlide.tsx'),
    'utf8',
  );
  const CARD = readFileSync(
    resolve(__dirname, '../components/app/cards/VideoCard.tsx'),
    'utf8',
  );
  const VIEWER = readFileSync(
    resolve(__dirname, '../components/app/cards/ShortsViewer.tsx'),
    'utf8',
  );

  it('gives the shorts viewer a fullscreen control at all', () => {
    // The whole point of the change: there was no fullscreen anything. It is
    // drawn by the viewer rather than the slide — see the corner-controls block
    // below for why.
    expect(VIEWER).toMatch(/aria-label=\{isFullscreen \? 'Exit fullscreen' : 'Enter fullscreen'\}/);
  });

  it('routes both players through the shared hook', () => {
    // The iOS and WebView fallbacks are subtle enough that a second copy would
    // drift. Neither file should re-implement the raw API.
    expect(VIEWER).toContain('useVideoFullscreen(noVideoRef, fullscreenTargetRef, {');
    expect(CARD).toContain('useVideoFullscreen(videoRef, containerRef)');
    expect(CARD).not.toContain('webkitEnterFullscreen');
  });

  it('fullscreens the container that holds the chrome, not the slide', () => {
    // Only what lives inside the fullscreened element paints in the top layer.
    // The slide used to fullscreen itself, which handed back a bare video: the
    // mute button, the action bar and the creator block are all siblings of the
    // carousel, one level up, and stayed behind on the hidden page.
    // The callback ref still sets `fullscreenTargetRef`; it only also keeps the
    // node in state so the slide has somewhere to portal its progress bar.
    expect(VIEWER).toContain('fullscreenTargetRef.current = node');
    expect(VIEWER).toContain('ref={attachVideoContainer}');
    expect(SLIDE).not.toContain('useVideoFullscreen');
    // …and the chrome is inside that same container, below its opening tag and
    // above its close.
    const container = VIEWER.slice(VIEWER.indexOf('ref={attachVideoContainer}'));
    expect(container.indexOf("aria-label={isMuted ? 'Unmute' : 'Mute'}")).toBeGreaterThan(-1);
    expect(container.indexOf('{/* Creator + description, fullscreen only.')).toBeGreaterThan(-1);
  });

  it('hands the hook no video, so it cannot take the iOS path', () => {
    // Given a video the hook prefers `webkitEnterFullscreen()`, which replaces
    // the page with the system player — the one path that provably cannot carry
    // the action bar with it.
    expect(VIEWER).toMatch(/const noVideoRef = useRef<HTMLVideoElement>\(null\)/);
  });

  it('lets the container fake fullscreen where the API lies', () => {
    // The refusal was a property of the SLIDE — the carousel translateY's it,
    // and a transformed ancestor makes `fixed inset-0` resolve against that
    // wrapper. The container is above that transform, so the fallback lands on
    // the viewport and a WebView gets immersive mode instead of a dead button.
    expect(VIEWER).toContain('allowSimulated: true');
    expect(SLIDE).not.toContain('allowSimulated');
  });

  it('drops the 9:16 lock in fullscreen so landscape runs full width', () => {
    // The windowed viewer is a phone-shaped box. Keeping that box in fullscreen
    // would letterbox a sideways video into a column down the middle of a
    // 16:9 display, which is the opposite of immersive.
    expect(VIEWER).toMatch(/isFullscreen[\s\S]{0,600}?"fixed inset-0 z-\[70\] w-screen h-screen max-h-none rounded-none bg-black"/);
  });

  it('offers fullscreen on desktop only', () => {
    // The viewer is `fixed inset-0` on mobile, so a short already fills the
    // screen there — a fullscreen button would visibly do nothing.
    const desktopOnly = VIEWER.slice(VIEWER.indexOf('{!isMobile && (\n            <>'));
    expect(desktopOnly).toContain("aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}");
  });

  it('leaves the slide with no say in fullscreen but the fit', () => {
    // It keeps `isFullscreen` to decide `object-contain`, and nothing else: the
    // toggle, the button and the chrome fade all belong to the viewer now.
    expect(SLIDE).not.toContain('onToggleFullscreen');
    expect(SLIDE).not.toContain('canFullscreen');
    expect(SLIDE).not.toContain('chromeHidden');
    expect(SLIDE).toContain('isFullscreen');
  });

  it('drops the side panels in fullscreen instead of stranding them', () => {
    // Both are siblings of the fullscreened container, so they cannot paint in
    // the top layer. Left mounted they are dead tab stops behind the video.
    expect(VIEWER.match(/\{!isMobile && !isFullscreen && \(/g) ?? []).toHaveLength(2);
  });

  it('moves comments onto the video when the panel beside it is gone', () => {
    expect(VIEWER).toContain('key="fullscreen-comments"');
    // The window-level wheel handler navigates shorts unless the target opts
    // out, so without this a scroll through the thread jumps to the next video.
    expect(VIEWER).toMatch(/key="fullscreen-comments"[\s\S]{0,200}?data-shorts-scrollable/);
  });

  it('leaves fullscreen before opening a portalled modal', () => {
    // Radix portals to <body>, outside the fullscreen element — a tip or share
    // sheet opened from fullscreen would be completely invisible.
    expect(VIEWER).toContain('const leaveFullscreenThen = useCallback');
    expect(VIEWER).toContain('leaveFullscreenThen(() => setShowTipModal(true))');
    expect(VIEWER).toContain('leaveFullscreenThen(() => setShareSheetOpen(true))');
  });

  it('makes Escape step back one level rather than close everything', () => {
    expect(VIEWER).toMatch(/if \(isFullscreen\) toggleFullscreen\(\);\s*\n\s*else onClose\(\);/);
  });

  it('keeps the slide frame absolutely positioned in both states', () => {
    // The carousel transforms each slide, so a `fixed` frame would resolve
    // against the wrapper. Native fullscreen pins it from the top layer with
    // `!important` UA styles instead, which no ancestor transform affects.
    expect(SLIDE).toContain('className="absolute inset-0 bg-black"');
    expect(SLIDE).not.toContain('fixed inset-0 z-[9999]');
  });

  it('spends the double-tap on reacting, not on fullscreen', () => {
    // Desktop used to take the centre double-tap for fullscreen, which left
    // shorts as the one feed where double-tap did not like the post. One
    // gesture cannot mean two things, so fullscreen kept its button and gave
    // the gesture up. Assert the competing handler is gone entirely — leaving
    // it bound alongside the ladder is how both would fire on one tap.
    expect(SLIDE).not.toContain('handleVideoTap');
    expect(SLIDE).not.toMatch(/inCentre/);
    expect(SLIDE).toContain('{...tapGestures}');
  });

  it('binds one tap model, not one per platform', () => {
    // The old wiring was `onClick={allowFullscreen ? … }` plus a conditional
    // spread, so desktop and mobile ran different gesture code.
    expect(SLIDE).not.toMatch(/allowFullscreen \? \{\} : tapGestures/);
    expect(SLIDE).not.toMatch(/onClick=\{allowFullscreen \?/);
  });
});

/**
 * Trackpad scrolling died every couple of shorts until the mouse was nudged.
 *
 * A browser only recomputes what is under the cursor when the cursor moves.
 * The carousel advances by transform, so after a flick the wheel is still
 * aimed at the slide that just left — fine while it is mounted, dead once the
 * 3-slide render window drops it, because the events then land on a node that
 * is no longer in the document and no listener sees them, window included.
 * Binding to the window (the previous fix) cannot help with that; keeping the
 * latched slide mounted can.
 */
describe('the shorts wheel gesture keeps its target', () => {
  const VIEWER = readFileSync(
    resolve(__dirname, '../components/app/cards/ShortsViewer.tsx'),
    'utf8',
  );

  it('marks each slide with its index so the handler can identify its own', () => {
    expect(VIEWER).toContain('data-shorts-slide={index}');
  });

  it('reads the latched slide off the wheel event itself', () => {
    // The event target *is* the browser's answer to what the gesture is
    // latched to — no guessing from currentIndex, which has already moved on.
    expect(VIEWER).toContain(".closest?.('[data-shorts-slide]')");
    expect(VIEWER).toMatch(/setPointerPinnedIndex\(Number\.isInteger\(latchedIndex\)/);
  });

  it('keeps that slide mounted after the render window drops it', () => {
    // Without this the whole thing is decorative: the pin has to survive
    // falling outside prev/current/next.
    expect(VIEWER).toMatch(
      /pointerPinnedIndex !== null && !indices\.includes\(pointerPinnedIndex\)[\s\S]{0,80}?indices\.push\(pointerPinnedIndex\)/,
    );
    expect(VIEWER).toMatch(/\}, \[currentIndex, shorts\.length, pointerPinnedIndex\]\)/);
  });

  it('releases the pin as soon as the pointer re-targets', () => {
    // A move is the browser's own hit-test, so the old slide is free to go and
    // the viewer is back to exactly three.
    expect(VIEWER).toMatch(/handleDesktopPointerMove = useCallback\(\(\) => \{[\s\S]{0,400}?setPointerPinnedIndex\(currentIndexRef\.current\)/);
    expect(VIEWER).toMatch(/handleDesktopPointerLeave = useCallback\(\(\) => \{[\s\S]{0,300}?setPointerPinnedIndex\(null\)/);
  });
});

/**
 * Three complaints about the desktop viewer, all of them about something
 * sitting in the wrong place.
 */
describe('the desktop shorts frame', () => {
  const VIEWER = readFileSync(
    resolve(__dirname, '../components/app/cards/ShortsViewer.tsx'),
    'utf8',
  );
  const SLIDE = readFileSync(
    resolve(__dirname, '../components/app/cards/VideoSlide.tsx'),
    'utf8',
  );

  it('runs the player the full height of the screen', () => {
    // It was `h-[calc(100vh-80px)] max-h-[640px]`, so on any desktop taller
    // than ~720px the short stopped at 640px and sat in a band down the middle
    // with dead space above and below it. Reported as "cut off top and bottom".
    expect(VIEWER).not.toContain('max-h-[640px]');
    expect(VIEWER).not.toContain('h-[calc(100vh-80px)]');
    expect(VIEWER).toContain('"shrink-0 h-full aspect-[9/16] w-auto max-w-[calc(100vw-8rem)] bg-zinc-900 rounded-none"');
  });

  it('builds both corner controls from one class string', () => {
    // Two hand-copied class lists in two files drifted: fullscreen picked up a
    // `saturate-[180%]` that mute never had, and the pair sat side by side in
    // different shades.
    expect(VIEWER).toContain('const CORNER_CONTROL =');
    expect(VIEWER.match(/cn\(\s*CORNER_CONTROL,/g) ?? []).toHaveLength(2);
    expect(VIEWER).not.toContain('saturate-[180%] text-white rounded-xl');
  });

  it('keeps the fullscreen button out of the carousel', () => {
    // In the slide it was translated on every step, so it slid away with the
    // video while the mute button beside it held still.
    expect(SLIDE).not.toContain('Maximize');
    expect(SLIDE).not.toContain('Minimize');
    expect(VIEWER).toContain('onClick={toggleFullscreen}');
  });

  it('paints the progress bar over the action bar, not under it', () => {
    // The action bar lays a 96px `from-black/80` gradient across the bottom of
    // the container. It is a sibling of the carousel, so it covers anything
    // inside a slide — the bar included, which is the "it shadows over the
    // scroll line" report. A slide cannot out-z-index it from inside its own
    // stacking context, so the bar is portalled up to the container.
    expect(SLIDE).toContain('createPortal(progressBar, progressLayer)');
    expect(VIEWER).toContain('progressLayer={isActive ? videoContainer : null}');
    // …and the seek zone stays where it is: hoisting that too would put a
    // 15%-tall click target on top of the action buttons.
    expect(SLIDE).toMatch(/ref=\{progressBarRef\}[\s\S]{0,220}?height: '15%'/);
    expect(SLIDE).toContain('pointer-events-none');
  });
});
