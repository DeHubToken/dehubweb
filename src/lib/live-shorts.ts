import type { LiveStream, ShortVideo } from '@/types/feed.types';

/**
 * Dual-format live in Shorts: which live streams may appear among the shorts,
 * and how they ride the swipe viewer's list of slides.
 */

/** How often a live stream comes up while swiping: one slide in this many. */
export const LIVE_SLIDE_EVERY = 6;

/** Open to anyone and safe, like the shorts around it. Gated streams stay on the Live tab. */
export function isVerticalFeedLive(stream: LiveStream): boolean {
  return (
    stream.isLive &&
    !stream.isPPV &&
    !stream.isLocked &&
    !stream.subscriberPlans?.length &&
    (!stream.contentRating || stream.contentRating === 'safe') &&
    !!(stream.playbackUrl || stream.playbackUrls?.length)
  );
}

/** A live stream as a slide. The id is prefixed so it can never collide with a post's. */
export function liveToShort(stream: LiveStream): ShortVideo {
  return {
    id: `live-${stream.id}`,
    type: 'short',
    username: stream.creatorUsername || stream.streamer,
    creatorUsername: stream.creatorUsername,
    displayName: stream.streamer,
    creatorId: stream.creatorId,
    verified: false,
    avatar: stream.avatar,
    likes: String(stream.likeCount ?? 0),
    views: stream.viewers,
    thumbnail: stream.thumbnail,
    videoUrl: stream.playbackUrl || stream.playbackUrls?.[0] || '',
    title: stream.title,
    live: stream,
  } as ShortVideo;
}

/**
 * Shorts with a live slide after every `every - 1` shorts. Streams left over
 * when the shorts run out go at the end, so every live tile in the grid has a
 * slide to open on. With nobody live this is the shorts unchanged.
 */
export function interleaveLive(shorts: ShortVideo[], live: ShortVideo[], every = LIVE_SLIDE_EVERY): ShortVideo[] {
  if (!live.length) return shorts;
  const out: ShortVideo[] = [];
  let next = 0;
  shorts.forEach((short, i) => {
    out.push(short);
    if ((i + 1) % (every - 1) === 0 && next < live.length) out.push(live[next++]);
  });
  return out.concat(live.slice(next));
}
