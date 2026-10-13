import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const VIDEO_CARD = readFileSync(
  resolve(__dirname, '../components/app/cards/VideoCard.tsx'),
  'utf8'
);

describe('feed video opens the scrolling viewer', () => {
  function handler(name: string) {
    const start = VIDEO_CARD.indexOf(`const ${name} = useCallback`);
    expect(start).toBeGreaterThan(-1);
    return VIDEO_CARD.slice(start, VIDEO_CARD.indexOf('\n  }, [', start));
  }

  it('opens the selected video from mouse and touch input', () => {
    for (const name of ['handleVideoAreaClick', 'handleTouchEnd']) {
      const body = handler(name);
      expect(body).toContain('!isFullscreen && !video.isLivePost');
      expect(body).toContain('openVideoViewer();');
      expect(body).not.toContain('openPost()');
    }
    expect(handler('openVideoViewer')).toContain('openBrainrotFeed(video.id, {');
    expect(handler('openVideoViewer')).toContain('isContentGated || isVideoNotReady');
  });

  it('keeps scrolling and control touches out of viewer navigation', () => {
    const body = handler('handleTouchEnd');
    expect(body.indexOf('> TAP_SLOP_PX')).toBeLessThan(body.indexOf('openVideoViewer();'));
    expect(body.indexOf('isControlTarget(e.target)')).toBeLessThan(body.indexOf('openVideoViewer();'));
  });
  it('never paints a focus outline around the video surface', () => {
    expect(VIDEO_CARD).toContain('focus-visible:outline-none');
  });

  it('still opens the post from the surrounding bento', () => {
    // handleCardClick is the one that navigates, and the media container opts
    // out of it by name — [data-no-navigate] — rather than by stopPropagation.
    expect(VIDEO_CARD).toMatch(/const handleCardClick[\s\S]{0,600}?openPost\(\)/);
    expect(VIDEO_CARD).toMatch(/data-no-navigate[^>]*?data-media-full/);
  });

  it('keeps strip playback and the timeline available before metadata loads', () => {
    // Lite mode has no duration until Play is pressed. The strip button must
    // still start playback; seeking stays disabled until metadata arrives.
    const bar = VIDEO_CARD.match(
      /\{!video\.isAudio && !\(video\.isLivePost && video\.isLiveNow\) && \(\n\s*<div data-video-controls[^\n]*?"absolute bottom-0([\s\S]*?)\n {8}\)\}/
    );
    expect(bar, 'transport bar must remain mounted before metadata and while controls are hidden').not.toBeNull();
    expect(VIDEO_CARD).toContain('data-controls-hidden={!controlsVisible');
    const play = bar![1].match(/\{splitControls && <button[\s\S]*?<\/button>\}/);
    expect(play, 'strip playback must not wait for metadata').not.toBeNull();
    expect(play![0]).toContain('handlePlayClick()');
    expect(play![0]).not.toContain('duration');
    // Nothing inside the bar waits on the clip's length any more: a profile
    // card that never autoplayed used to render no timeline at all.
    expect(bar![1]).not.toContain('{duration > 0 &&');
    expect(bar![1]).toContain('disabled={duration <= 0}');
  });

  it('gives the seek line a touch-sized hit target without thickening its rail', () => {
    expect(VIDEO_CARD).toMatch(/aria-label=\{_copy\("copy\.[a-f0-9]+", \{ defaultValue: "Video progress" \}\)\}/);
    expect(VIDEO_CARD).toContain('className="flex-1 h-6 bg-transparent');
    expect(VIDEO_CARD).toContain("backgroundSize: '100% 4px'");
  });
});
