import { translateCopy } from '@/i18n/copy';
import { searchNFTs, type DeHubNFT } from '@/lib/api/dehub';

/** The orders the music video chart offers, on web and in the app. */
export type MusicVideoChartSort = 'views' | 'week' | 'liked' | 'new';

/** The music video chart is a top 20, ranked on the server. */
export const MUSIC_VIDEO_CHART_SIZE = 20;

/**
 * One music video chart. "Trending" is the most viewed of the last week,
 * topped up from the last month when a quiet week has only a handful.
 */
export async function fetchMusicVideoChart(sort: MusicVideoChartSort): Promise<DeHubNFT[]> {
  const base = { category: 'Music', postType: 'video', unit: MUSIC_VIDEO_CHART_SIZE } as const;
  if (sort !== 'week') {
    const sortMode = sort === 'views' ? 'trending' : sort === 'liked' ? 'popular' : 'new';
    return (await searchNFTs({ ...base, sortMode })).data || [];
  }
  const week = (await searchNFTs({ ...base, sortMode: 'trending', range: 'week' })).data || [];
  if (week.length >= 5) return week;
  const month = (await searchNFTs({ ...base, sortMode: 'trending', range: 'month' }).catch(() => ({ data: [] as DeHubNFT[] }))).data || [];
  const seen = new Set(week.map(nft => nft.tokenId));
  return [...week, ...month.filter(nft => !seen.has(nft.tokenId))].slice(0, MUSIC_VIDEO_CHART_SIZE);
}

export const MUSIC_VIDEO_CHART_SORTS: { value: MusicVideoChartSort; label: string }[] = [
  { value: 'views', get label() { return translateCopy('music.mostViewed', { defaultValue: 'Most viewed' }); } },
  { value: 'week', get label() { return translateCopy('music.trendingWeek', { defaultValue: 'Trending this week' }); } },
  { value: 'liked', get label() { return translateCopy('music.mostLiked', { defaultValue: 'Most liked' }); } },
  { value: 'new', get label() { return translateCopy('music.newest', { defaultValue: 'Newest' }); } },
];
