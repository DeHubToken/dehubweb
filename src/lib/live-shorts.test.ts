import { describe, expect, it } from 'vitest';
import type { LiveStream, ShortVideo } from '@/types/feed.types';
import { interleaveLive, isVerticalFeedLive, liveToShort } from './live-shorts';

const short = (id: string) => ({ id, type: 'short' }) as ShortVideo;
const stream = (over: Partial<LiveStream> = {}) =>
  ({ id: 's1', type: 'live', streamer: 'chaos', isLive: true, playbackUrl: 'https://x/index.m3u8', viewers: '12', thumbnail: '', ...over }) as LiveStream;

describe('live in the swipe viewer', () => {
  it('puts a live slide after every five shorts while streams last', () => {
    const shorts = Array.from({ length: 12 }, (_, i) => short(`p${i}`));
    const out = interleaveLive(shorts, [liveToShort(stream()), liveToShort(stream({ id: 's2' }))]);
    expect(out.map((s) => s.id)).toEqual([
      'p0', 'p1', 'p2', 'p3', 'p4', 'live-s1',
      'p5', 'p6', 'p7', 'p8', 'p9', 'live-s2',
      'p10', 'p11',
    ]);
  });

  it('puts streams that did not fit at the end', () => {
    const out = interleaveLive([short('a'), short('b')], [liveToShort(stream())]);
    expect(out.map((s) => s.id)).toEqual(['a', 'b', 'live-s1']);
  });

  it('leaves the shorts alone when nobody is live', () => {
    const shorts = [short('a'), short('b')];
    expect(interleaveLive(shorts, [])).toBe(shorts);
  });

  it('keeps gated, mature and offline streams out', () => {
    expect(isVerticalFeedLive(stream())).toBe(true);
    expect(isVerticalFeedLive(stream({ isLive: false }))).toBe(false);
    expect(isVerticalFeedLive(stream({ isPPV: true }))).toBe(false);
    expect(isVerticalFeedLive(stream({ isLocked: true }))).toBe(false);
    expect(isVerticalFeedLive(stream({ contentRating: 'mature' }))).toBe(false);
    expect(isVerticalFeedLive(stream({ playbackUrl: undefined }))).toBe(false);
  });

  it('carries the stream on the slide', () => {
    const slide = liveToShort(stream());
    expect(slide.id).toBe('live-s1');
    expect(slide.live?.id).toBe('s1');
  });
});
