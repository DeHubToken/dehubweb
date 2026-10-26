/**
 * Live clips: the editor's trim rules, the Short's caption, and the edge
 * worker's /clip/<n> page. The worker is read as source, same as
 * creator-flow-seo.test.ts. The page is /clip, not /clips: a real user holds
 * the `clips` handle, and every top-level route has to be reserved.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/lib/api/dehub/core', () => ({ ensureFreshToken: vi.fn() }));
vi.mock('@/lib/api/dehub/content', () => ({ mintPost: vi.fn() }));

import { clampRange } from '@/components/app/live/ClipEditorSheet';
import { liveClipCaption, liveClipLink, type LiveClip } from '@/lib/api/live-clips';
import { ROUTE_SEGMENTS } from '@/lib/reserved-usernames.js';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');

const clipPath = (() => {
  const line = WORKER.split('\n').find((l) => l.startsWith('const LIVE_CLIP_PATH = '))!;
  return new RegExp(line.slice(line.indexOf('/') + 1, line.lastIndexOf('/')));
})();

describe('trim range', () => {
  it('keeps the clip between 3 and 60 seconds inside the window', () => {
    expect(clampRange(10, 11, 0, 120, 'start')).toEqual([10, 13]);
    expect(clampRange(10, 11, 0, 120, 'end')).toEqual([8, 11]);
    expect(clampRange(0, 100, 0, 120, 'start')).toEqual([0, 60]);
    expect(clampRange(0, 100, 0, 120, 'end')).toEqual([40, 100]);
    expect(clampRange(-5, 200, 0, 30, 'end')).toEqual([0, 30]);
  });

  it('never leaves the window, even pushed against its edge', () => {
    expect(clampRange(29, 30, 0, 30, 'start')).toEqual([27, 30]);
    expect(clampRange(0, 1, 0, 30, 'end')).toEqual([0, 3]);
  });
});

const clip = (over: Partial<LiveClip> = {}): LiveClip => ({
  id: 'c', shortId: 42, kind: 'viewer', status: 'ready', streamTokenId: 7, streamTitle: 'Night run',
  streamerAddress: '0xs', streamerUsername: 'streamer', clipperAddress: '0xc', clipperUsername: 'fan',
  sourceKind: 'live', sourceUrl: null, windowStart: 0, windowEnd: 60, broadcastOffset: 300, start: 30, end: 60,
  title: 'Clutch', score: null, reason: null, error: null, videoUrl: 'https://v', posterUrl: null, cardUrl: null,
  durationSeconds: 33, postTokenId: null, postedAt: null, createdAt: '', ...over,
});

describe('caption', () => {
  it('credits the streamer and the clipper and links the clip page', () => {
    expect(liveClipCaption(clip())).toBe("Clipped from @streamer's live by @fan\nhttps://dehub.io/clip/42");
  });

  it('leaves the clipper out of a highlight and of a streamer clipping themselves', () => {
    expect(liveClipCaption(clip({ kind: 'highlight', clipperUsername: null }))).toBe("Clipped from @streamer's live\nhttps://dehub.io/clip/42");
    expect(liveClipCaption(clip({ clipperAddress: '0xs' }))).toBe("Clipped from @streamer's live\nhttps://dehub.io/clip/42");
    expect(liveClipLink({ shortId: 9 })).toBe('https://dehub.io/clip/9');
  });
});

describe('/clip/<n> at the edge', () => {
  it('matches clip ids and nothing else', () => {
    expect(clipPath.test('/clip/12')).toBe(true);
    expect(clipPath.test('/clip/12/')).toBe(true);
    expect(clipPath.test('/clip')).toBe(false);
    expect(clipPath.test('/clips/12')).toBe(false);
    expect(clipPath.test('/clip/abc')).toBe(false);
    expect(clipPath.test('/clip/12/extra')).toBe(false);
  });

  it('reserves /clip and leaves the @clips handle alone', () => {
    expect(ROUTE_SEGMENTS).toContain('clip');
    expect(ROUTE_SEGMENTS).not.toContain('clips');
  });

  it('is let through the SSR gate', () => {
    const gate = WORKER.slice(WORKER.indexOf('function shouldServeSSR'));
    expect(gate.slice(0, gate.indexOf('\n}\n'))).toContain('LIVE_CLIP_PATH.test(pathname)');
  });

  it('only reads posted clips, with the columns anon may read', () => {
    const at = WORKER.indexOf('const liveClipMatch');
    const branch = WORKER.slice(at, WORKER.indexOf('\n  }\n', at));
    expect(branch).toContain('status=eq.posted');
    expect(branch).toContain('select=${LIVE_CLIP_COLUMNS}');
    expect(branch).not.toContain('select=*');
  });

  it('renders a video card with og:video and VideoObject data', () => {
    const at = WORKER.indexOf('function buildClipHtml');
    const fn = WORKER.slice(at, WORKER.indexOf('\n}\n', at));
    expect(fn).toContain('og:video');
    expect(fn).toContain("'@type': 'VideoObject'");
    expect(fn).toContain('/clip/${clip.short_id}');
  });
});
