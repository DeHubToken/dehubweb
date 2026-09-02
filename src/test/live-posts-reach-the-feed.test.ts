/**
 * A stream that aired belongs in the feed like any other post — live while it
 * runs, and as its replay afterwards. Only a live post whose stream never went
 * on air (the shape a failed Go Live launch leaves behind) stays hidden.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { mapToVideoItem, type UnifiedFeedItem } from '@/hooks/use-unified-feed';

const REPLAY = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/replays/abc.mp4';

function liveItem(stream: Record<string, unknown>): UnifiedFeedItem {
  return {
    tokenId: 1,
    name: 'A stream',
    imageUrl: '',
    minter: '0xabc',
    postType: 'live',
    views: 0,
    commentCount: 0,
    createdAt: new Date().toISOString(),
    stream,
  } as unknown as UnifiedFeedItem;
}

describe('live posts in the feed', () => {
  it('gives an ended stream its replay to play', () => {
    const mapped = mapToVideoItem(
      liveItem({
        status: 'ENDED',
        startedAt: '2026-09-01T12:24:23.822Z',
        recording: { status: 'ready', url: REPLAY, durationSec: 48 },
      }),
      0,
    );
    expect(mapped.videoUrl).toBe(REPLAY);
    expect(mapped.durationSeconds).toBe(48);
    expect(mapped.isLivePost).toBe(true);
    expect(mapped.isLiveNow).toBe(false);
  });

  it('leaves an ended stream with no captured replay url-less, so the card shows its poster', () => {
    const mapped = mapToVideoItem(
      liveItem({ status: 'ENDED', startedAt: '2026-09-01T12:24:23.822Z', recording: { status: 'failed' } }),
      0,
    );
    expect(mapped.videoUrl).toBeUndefined();
  });

  it('never hands a running stream a video url — the card plays its HLS ladder', () => {
    const mapped = mapToVideoItem(
      liveItem({ status: 'LIVE', isActive: true, startedAt: '2026-09-01T12:24:23.822Z', playbackId: 'pb1' }),
      0,
    );
    expect(mapped.videoUrl).toBeUndefined();
    expect(mapped.isLiveNow).toBe(true);
    expect(mapped.livePlaybackUrls?.length).toBeTruthy();
  });

  it('hides only the live posts whose stream never aired', () => {
    const src = readFileSync(join(process.cwd(), 'src/hooks/use-unified-feed.ts'), 'utf8');
    // The blanket `postType !== 'live'` drop is what kept every past stream out
    // of every feed; it must not come back.
    expect(src).not.toMatch(/item\.postType !== 'live'/);
    expect(src).toMatch(/!isUnairedLivePost\(item\)/);
    expect(src).toMatch(/item\.postType === 'live' && !item\.stream\?\.startedAt/);
  });
});
