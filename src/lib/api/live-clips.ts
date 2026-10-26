/**
 * Live clips: a viewer's Clip button and the streamer's auto highlights.
 *
 * Everything goes through the live-clips edge function, which grabs the live
 * window or points at the replay, has the worker cut a vertical MP4, and keeps
 * the row. Posting is the one step that happens here: the finished file is
 * minted as a Short by whoever pressed Post, exactly as the composer would,
 * then reported back so the clip page can link to it.
 */
import { supabase } from '@/integrations/supabase/client';
import { ensureFreshToken } from '@/lib/api/dehub/core';
import { mintPost } from '@/lib/api/dehub/content';

export type LiveClipStatus = 'capturing' | 'draft' | 'rendering' | 'ready' | 'posted' | 'dismissed' | 'failed';

export interface LiveClip {
  id: string;
  shortId: number;
  kind: 'viewer' | 'highlight';
  status: LiveClipStatus;
  streamTokenId: number;
  streamTitle: string;
  streamerAddress: string;
  streamerUsername: string | null;
  clipperAddress: string | null;
  clipperUsername: string | null;
  sourceKind: 'live' | 'replay';
  sourceUrl: string | null;
  windowStart: number;
  windowEnd: number;
  broadcastOffset: number | null;
  start: number | null;
  end: number | null;
  title: string;
  score: number | null;
  reason: string | null;
  error: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  cardUrl: string | null;
  durationSeconds: number | null;
  postTokenId: number | null;
  postedAt: string | null;
  createdAt: string;
}

export const CLIP_MIN_S = 3;
export const CLIP_MAX_S = 60;

async function call<T>(body: Record<string, unknown>, signedIn: boolean): Promise<T> {
  const headers: Record<string, string> = {};
  if (signedIn) headers['x-dehub-token'] = await ensureFreshToken();
  const { data, error } = await supabase.functions.invoke('live-clips', { body, headers });
  if (data?.error) throw new Error(data.error);
  if (error) {
    // A non-2xx answer carries the reason in its body; FunctionsHttpError hides it.
    const context = (error as { context?: Response }).context;
    const reason = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
    throw new Error(reason?.error || error.message || 'Clip request failed');
  }
  return data as T;
}

/** Start a clip: grabs the last minute of a live stream, or opens the replay around `at`. */
export async function captureLiveClip(tokenId: string | number, at?: number): Promise<LiveClip> {
  return (await call<{ clip: LiveClip }>({ action: 'capture', tokenId: String(tokenId), at }, true)).clip;
}

export async function getLiveClip(id: string): Promise<LiveClip> {
  return (await call<{ clip: LiveClip }>({ action: 'get', id }, false)).clip;
}

/** A stream's clips. The streamer also gets drafts and highlights; a clipper their own. */
export async function listLiveClips(tokenId: string | number, signedIn: boolean): Promise<LiveClip[]> {
  return (await call<{ clips: LiveClip[] }>({ action: 'list', tokenId: String(tokenId) }, signedIn)).clips ?? [];
}

export async function renderLiveClip(id: string, start: number, end: number, title: string): Promise<LiveClip> {
  return (await call<{ clip: LiveClip }>({ action: 'render', id, start, end, title }, true)).clip;
}

export async function dismissLiveClip(id: string): Promise<void> {
  await call({ action: 'dismiss', id }, true);
}

/** The streamer's Studio asks this every minute on air, and once after the replay lands. */
export async function detectHighlights(tokenId: string | number): Promise<number> {
  return (await call<{ created?: number }>({ action: 'highlights', tokenId: String(tokenId) }, true)).created ?? 0;
}

/** Poll a clip until it leaves `waiting`, or give up after `timeoutMs`. */
export async function waitForClip(
  id: string,
  waiting: LiveClipStatus,
  { timeoutMs = 180_000, everyMs = 2_000, signal }: { timeoutMs?: number; everyMs?: number; signal?: AbortSignal } = {},
): Promise<LiveClip> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const clip = await getLiveClip(id);
    if (clip.status !== waiting) return clip;
    if (Date.now() > until) throw new Error('This is taking longer than usual. Try again in a minute.');
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

export function liveClipLink(clip: Pick<LiveClip, 'shortId'>): string {
  return `https://dehub.io/clip/${clip.shortId}`;
}

/** The Short's caption: the clipper's title, then who it came from and the clip page. */
export function liveClipCaption(clip: LiveClip): string {
  const streamer = clip.streamerUsername ? `@${clip.streamerUsername}` : 'this stream';
  const credit = clip.kind === 'viewer' && clip.clipperUsername && clip.clipperAddress !== clip.streamerAddress
    ? `Clipped from ${streamer}'s live by @${clip.clipperUsername}`
    : `Clipped from ${streamer}'s live`;
  return `${credit}\n${liveClipLink(clip)}`;
}

async function fileFrom(url: string, name: string, type: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load the clip');
  return new File([await res.blob()], name, { type });
}

/**
 * Mint the rendered clip as a Short from `wallet`, then tell the function
 * which post it became. Safe to repeat: the clip id is the idempotency key, so
 * a retry returns the post already made.
 */
export async function postLiveClip(clip: LiveClip, wallet: string, chainId = 8453): Promise<LiveClip> {
  if (clip.status === 'posted') return clip;
  if (!clip.videoUrl) throw new Error('The clip is not ready yet');
  const [video, poster] = await Promise.all([
    fileFrom(clip.videoUrl, `clip-${clip.shortId}.mp4`, 'video/mp4'),
    clip.posterUrl ? fileFrom(clip.posterUrl, 'thumbnail.jpg', 'image/jpeg') : Promise.resolve(undefined),
  ]);
  const res = await mintPost({
    name: (clip.title || clip.streamTitle || 'Live clip').slice(0, 100),
    description: liveClipCaption(clip),
    postType: 'video',
    chainId,
    category: ['General'],
    minterAddress: wallet,
    mintOptOut: true,
    files: [video],
    thumbnail: poster,
    idempotencyKey: `live-clip-${clip.id}`,
  });
  if (!res?.createdTokenId) throw new Error('The Short was not created');
  return (await call<{ clip: LiveClip }>({ action: 'posted', id: clip.id, postTokenId: String(res.createdTokenId) }, true)).clip;
}
