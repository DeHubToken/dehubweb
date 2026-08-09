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
describe('feed video — a tap on the media reveals controls, it does not navigate', () => {
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
    expect(branch).not.toContain('openPost');
  });

  it('does not open the post from a tap on the player', () => {
    const branch = feedBranch('handleTouchEnd');
    expect(branch).toContain('showControlsBriefly()');
    expect(branch).not.toContain('openPost');
  });

  it('still opens the post from the surrounding bento', () => {
    // handleCardClick is the one that navigates, and the media container opts
    // out of it by name — [data-no-navigate] — rather than by stopPropagation.
    expect(VIDEO_CARD).toMatch(/const handleCardClick[\s\S]{0,600}?openPost\(\)/);
    expect(VIDEO_CARD).toMatch(/data-no-navigate[\s\S]{0,200}?data-media-full/);
  });

  it('keeps the play control reachable before any metadata has loaded', () => {
    // Lite mode preloads nothing and suppresses autoplay, so `duration` sits at
    // 0 until something calls play(). Gating the whole transport bar on it left
    // the only control that can start the clip unrenderable — and now that a tap
    // no longer escapes to the post page, that is a dead end rather than a
    // detour. Only the scrubber and timestamps may wait for real metadata.
    const bar = VIDEO_CARD.match(
      /\{showControls && \(\n\s*<div data-video-controls className="absolute bottom-0([\s\S]*?)\n {8}\)\}/
    );
    expect(bar, 'transport bar is not gated on showControls alone').not.toBeNull();
    expect(bar![1]).toContain('handlePlayClick()');
    // The play button comes before the duration gate, so it renders either way.
    expect(bar![1].indexOf('handlePlayClick()')).toBeLessThan(
      bar![1].indexOf('{duration > 0 &&')
    );
  });
});
