import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const VIDEO_CARD = readFileSync(
  resolve(__dirname, '../components/app/cards/VideoCard.tsx'),
  'utf8'
);

/**
 * In the feed, the media is content — not a link to content. Tapping the video
 * reveals the player's own controls for a couple of seconds; opening the post
 * page is the bento's job, the same as it is for every other post type.
 *
 * This was the other way round for a long time, with a comment calling the feed
 * player "a preview" to justify it, so the pull back in this direction is easy
 * to make by accident. Assert on the two handlers that own a press on the media.
 */
describe('feed video — a tap on the media toggles playback, it does not navigate', () => {
  /** The `!isImmersive` (feed) branch of a handler, up to its `return`. */
  function feedBranch(handler: string) {
    const fn = VIDEO_CARD.match(
      new RegExp(`const ${handler} = useCallback\\(([\\s\\S]*?)\\n  \\}, \\[`)
    );
    expect(fn, `${handler} not found`).not.toBeNull();
    const branch = fn![1].match(/if \(!isImmersive\) \{([\s\S]*?)\n {4}\}/);
    expect(branch, `${handler} has no !isImmersive branch`).not.toBeNull();
    return branch![1];
  }

  it('does not open the post from a click on the player', () => {
    const branch = feedBranch('handleVideoAreaClick');
    expect(branch).toContain('showControlsBriefly()');
    expect(branch).toContain('handlePlayClick()');
    expect(branch).not.toContain('openPost');
  });

  it('does not open the post from a tap on the player', () => {
    const branch = feedBranch('handleTouchEnd');
    expect(branch).toContain('showControlsBriefly()');
    expect(branch).toContain('handlePlayClick()');
    expect(branch).not.toContain('openPost');
  });

  it('never paints a focus outline around the video surface', () => {
    expect(VIDEO_CARD).toContain('focus-visible:outline-none');
  });

  it('still opens the post from the surrounding bento', () => {
    // handleCardClick is the one that navigates, and the media container opts
    // out of it by name — [data-no-navigate] — rather than by stopPropagation.
    expect(VIDEO_CARD).toMatch(/const handleCardClick[\s\S]{0,600}?openPost\(\)/);
    expect(VIDEO_CARD).toMatch(/data-no-navigate[\s\S]{0,200}?data-media-full/);
  });

  it('renders the whole transport bar before any metadata has loaded', () => {
    // Lite mode preloads nothing and suppresses autoplay, so `duration` sits at
    // 0 until something calls play(). Gating the whole transport bar on it left
    // the only control that can start the clip unrenderable — and now that a tap
    // no longer escapes to the post page, that is a dead end rather than a
    // detour. Gating just the scrubber on it was no better: a profile card
    // that never autoplayed had no timeline at all. The bar is drawn whole and
    // the slider is disabled until the length is known.
    // Audio and on-air posts have their own player and transport. Recorded
    // video still exposes its play button before metadata arrives.
    // `controlsVisible` is hover plus whatever menu or
    // slider the pointer is currently inside, so it only ever holds the bar up
    // for longer.
    const bar = VIDEO_CARD.match(
      /\{controlsVisible && !video\.isAudio && !\(video\.isLivePost && video\.isLiveNow\) && \(\n\s*<div data-video-controls className="absolute bottom-0([\s\S]*?)\n {8}\)\}/
    );
    expect(bar, 'transport bar is not gated on controls visibility alone').not.toBeNull();
    expect(bar![1]).toContain('handlePlayClick()');
    // Nothing inside the bar waits on the clip's length any more: a profile
    // card that never autoplayed used to render no timeline at all.
    expect(bar![1]).not.toContain('{duration > 0 &&');
    expect(bar![1]).toContain('disabled={duration <= 0}');
  });

  it('gives the seek line a touch-sized hit target without thickening its rail', () => {
    expect(VIDEO_CARD).toContain('aria-label="Video progress"');
    expect(VIDEO_CARD).toContain('className="flex-1 h-6 bg-transparent');
    expect(VIDEO_CARD).toContain("backgroundSize: '100% 4px'");
  });
});
