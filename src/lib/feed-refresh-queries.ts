/**
 * What a feed refresh (pull to refresh, or tapping Home again) re-asks the
 * server for.
 *
 * Every list a feed tab draws counts from belongs here. A key left out keeps
 * its views, reactions and comments from whenever it was first loaded, however
 * often the reader refreshes: the pinned or boosted post at the top of Home
 * and the Music tab's lists both did, because each sits in a query of its own.
 *
 * Invalidated rather than removed, so the cards stay on screen while the fresh
 * copy loads.
 */
import type { QueryClient } from '@tanstack/react-query';

export const FEED_REFRESH_QUERY_KEYS = [
  ['dehub-live'],
  ['unified-feed'],
  ['home-feed'],
  ['feed'],
  // The pinned post and the boosted posts dealt into Home.
  ['pinned-post'],
  // Shorts.
  ['dehub-feed'],
  // Music: video uploads, audio uploads, the charts and the radio top list.
  ['music-videos-infinite'],
  ['music-audio-uploads'],
  ['music-video-chart'],
  ['radio-chart-top'],
] as const;

export function refreshFeedQueries(queryClient: QueryClient): void {
  for (const queryKey of FEED_REFRESH_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
}
