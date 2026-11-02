import { apiCall, getAuthToken, DEHUB_API_REQUEST_BASE } from './core';

/** Still-watching summary for one audience. Percentages are 0-100. */
export interface PostWatchSummary {
  plays: number;
  avgSeconds: number;
  finishedPct: number;
  /** Share of plays still going at 0%, 5% ... 100% of the video. */
  retention: number[];
  /** Point in the video (0-100%) where the most plays stopped. */
  biggestDropAt: number | null;
  biggestDropPct: number;
}

export interface PostStatsBadge {
  /** -1 = no badge, otherwise the ladder index (0 Crab ... 12 Megalodon). */
  tier: number;
  name: string | null;
  people: number;
}

export interface PostStatsSupporter {
  address: string;
  username: string | null;
  displayName: string | null;
  avatarImageUrl: string | null;
  amount: number;
}

interface InOut { signedIn: number; signedOut: number }

export interface PostStats {
  tokenId: number;
  postedAt: string;
  postType?: string;
  duration: number | null;
  reach: {
    people: number;
    signedIn: number;
    signedOut: number;
    plays: number;
    playsSignedIn: number;
    playsSignedOut: number;
    repeats: number;
    totalViews: number;
    badgeWeight: number;
    agents: number;
    listens: number;
  };
  badges: PostStatsBadge[];
  devices: { ios: number; android: number; web: number; unknown: number };
  hourly: { start: string; signedIn: number[]; signedOut: number[] };
  watching: { all: PostWatchSummary | null; signedIn: PostWatchSummary | null; signedOut: PostWatchSummary | null };
  engagement: {
    likes: number;
    dislikes: number;
    comments: number;
    saves: number;
    reposts: number;
    quotes: number;
    reactions: Record<string, number>;
    shares: InOut;
    linkClicks: InOut;
    profileTaps: InOut;
  };
  followers: { gained: number; viewersWhoFollow: number; viewersNew: number };
  money: { tips: number; tippers: number; ppvBuyers: number; ppvRevenue: number; topSupporters: PostStatsSupporter[] };
  usual: { posts: number; people: number; likes: number; comments: number; reposts: number; saves: number } | null;
}

export interface BestTimes {
  days: number;
  total: number;
  /** 7 rows, Sunday first, of 24 hourly counts, in UTC. */
  grid: number[][];
}

export async function getPostStats(tokenId: string | number): Promise<PostStats> {
  const res = await apiCall<{ result: PostStats }>(`/api/post-stats/${encodeURIComponent(String(tokenId))}`, { requiresAuth: true });
  return res.result;
}

export async function getBestTimes(): Promise<BestTimes> {
  const res = await apiCall<{ result: BestTimes }>('/api/post-stats/best-times', { requiresAuth: true });
  return res.result;
}

/**
 * Fire-and-forget POST that survives the page closing (keepalive), signed in or
 * signed out. Stats are never worth an error the person can see.
 */
export function sendPostStatsBeacon(path: 'watch-time' | 'event', body: Record<string, unknown>): void {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    void fetch(`${DEHUB_API_REQUEST_BASE}/api/post-stats/${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Deliberately silent.
  }
}

export type PostEventType = 'share' | 'link' | 'profile';

export function reportPostEvent(tokenId: string | number | null | undefined, type: PostEventType): void {
  const id = Number(tokenId);
  if (!Number.isInteger(id) || id <= 0) return;
  sendPostStatsBeacon('event', { tokenId: id, type });
}
