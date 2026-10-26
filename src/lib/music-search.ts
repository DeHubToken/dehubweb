/**
 * Music search
 * ============
 * Searches a whole Music zone on the server, not just the chart on screen:
 * every audio upload, every music video, every station in the radio directory.
 * Shared by the Music tab's charts and the System theme's phone layout.
 *
 * @module lib/music-search
 */

import { searchNFTs, type DeHubNFT } from '@/lib/api/dehub';
import { getStationsByTag, searchStations, type RadioStation } from '@/lib/api/radio-browser';
import { isBlockedCreator, mapNFTToVideoItem } from '@/lib/music-feed-items';
import { resolveViewCount } from '@/lib/engagement';
import type { VideoItem } from '@/types/feed.types';

/** How many matches one search pulls from its zone. */
export const MUSIC_SEARCH_SIZE = 50;

const none = { data: [] as DeHubNFT[] };

function toItems(lists: DeHubNFT[][], audio = false): VideoItem[] {
  const seen = new Set<string | number>();
  return lists.flat()
    .filter(nft => {
      const tid = nft.tokenId || nft.id || nft.token_id;
      if (seen.has(tid) || isBlockedCreator(nft)) return false;
      seen.add(tid);
      return true;
    })
    .sort((a, b) => resolveViewCount(b) - resolveViewCount(a))
    .map((nft, index) => ({ ...mapNFTToVideoItem(nft, index), ...(audio ? { isAudio: true } : {}) }));
}

/** Every audio upload whose title, description or creator matches. */
export async function searchAudioUploads(query: string): Promise<VideoItem[]> {
  const lists = await Promise.all(['audio', 'feed-audio'].map(postType =>
    searchNFTs({ postType, search: query, unit: MUSIC_SEARCH_SIZE, sortMode: 'trending' }).catch(() => none)));
  return toItems(lists.map(res => res.data || []), true);
}

/** Every music video whose title, description or creator matches. */
export async function searchMusicVideos(query: string): Promise<VideoItem[]> {
  const res = await searchNFTs({ category: 'Music', postType: 'video', search: query, unit: MUSIC_SEARCH_SIZE, sortMode: 'trending' });
  return toItems([res.data || []]);
}

/** Everything musical: Music-category posts of any kind plus every audio upload. */
export async function searchAllMusic(query: string): Promise<VideoItem[]> {
  const lists = await Promise.all([
    searchNFTs({ category: 'Music', postType: 'all', search: query, unit: MUSIC_SEARCH_SIZE, sortMode: 'trending' }).catch(() => none),
    searchNFTs({ postType: 'feed-audio', search: query, unit: MUSIC_SEARCH_SIZE, sortMode: 'trending' }).catch(() => none),
    searchNFTs({ postType: 'audio', search: query, unit: MUSIC_SEARCH_SIZE, sortMode: 'trending' }).catch(() => none),
  ]);
  return toItems(lists.map(res => res.data || []));
}

/** Stations whose name or genre matches, from the whole radio directory. */
export async function searchRadio(query: string): Promise<RadioStation[]> {
  const [byName, byTag] = await Promise.all([
    searchStations(query, 100).catch(() => [] as RadioStation[]),
    getStationsByTag(query.toLowerCase(), MUSIC_SEARCH_SIZE).catch(() => [] as RadioStation[]),
  ]);
  const seen = new Set<string>();
  return [...byName, ...byTag].filter(station => !seen.has(station.stationuuid) && (seen.add(station.stationuuid), true));
}
