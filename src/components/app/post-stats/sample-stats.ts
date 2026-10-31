import type { BestTimes, PostStats } from '@/lib/api/dehub/post-stats';

/** Example numbers for the state gallery. Not anyone's real post. */
const hourlyIn = [3,14,40,58,62,48,38,30,25,20,17,26,40,60,150,120,78,52,34,20,12,8,6,5,7,9,12,14,20,29,38,46,62,70,55,39,27,20,16,12,9,7,5,5,4,5,7,8];
const hourlyOut = hourlyIn.map((v) => Math.round(v * 0.45));

export const SAMPLE_POST_STATS: PostStats = {
  tokenId: 777,
  postedAt: new Date(Date.now() - 50 * 3_600_000).toISOString(),
  postType: 'video',
  duration: 190,
  reach: { people: 1240, signedIn: 860, signedOut: 380, plays: 1910, playsSignedIn: 1290, playsSignedOut: 620, repeats: 670, totalViews: 2410, badgeWeight: 500, agents: 0, listens: 0 },
  badges: [
    { tier: 12, name: 'Megalodon', people: 4 },
    { tier: 9, name: 'Great White Shark', people: 11 },
    { tier: 6, name: 'Crocodile', people: 38 },
    { tier: 3, name: 'Giant Tortoise', people: 72 },
    { tier: 0, name: 'Crab', people: 145 },
    { tier: -1, name: null, people: 590 },
  ],
  devices: { ios: 352, android: 284, web: 224, unknown: 0 },
  hourly: { start: new Date(Date.now() - 50 * 3_600_000).toISOString(), signedIn: hourlyIn, signedOut: hourlyOut },
  watching: {
    all: { plays: 1480, avgSeconds: 102, finishedPct: 31, retention: [100,92,78,70,66,63,61,59,57,55,54,52,51,49,48,46,45,43,41,36,31], biggestDropAt: 5, biggestDropPct: 14 },
    signedIn: { plays: 1010, avgSeconds: 114, finishedPct: 35, retention: [], biggestDropAt: 5, biggestDropPct: 12 },
    signedOut: { plays: 470, avgSeconds: 77, finishedPct: 22, retention: [], biggestDropAt: 5, biggestDropPct: 19 },
  },
  engagement: {
    likes: 182, dislikes: 3, comments: 46, saves: 38, reposts: 12, quotes: 4,
    reactions: { like: 140, love: 30, hot: 12 },
    shares: { signedIn: 21, signedOut: 9 },
    linkClicks: { signedIn: 64, signedOut: 41 },
    profileTaps: { signedIn: 88, signedOut: 27 },
  },
  followers: { gained: 14, viewersWhoFollow: 327, viewersNew: 533 },
  money: {
    tips: 9500, tippers: 5, ppvBuyers: 0, ppvRevenue: 0,
    topSupporters: [
      { address: '0x1111111111111111111111111111111111111111', username: 'mal', displayName: 'mal', avatarImageUrl: null, amount: 5000 },
      { address: '0x2222222222222222222222222222222222222222', username: 'r2r', displayName: 'r2r', avatarImageUrl: null, amount: 2000 },
      { address: '0x3333333333333333333333333333333333333333', username: 'kai', displayName: 'kai', avatarImageUrl: null, amount: 1500 },
    ],
  },
  usual: { posts: 20, people: 540, likes: 96, comments: 33, reposts: 12, saves: 12.3 },
};

const curve = [0.3, 0.1, 0.05, 0.05, 0.1, 0.2, 0.3, 0.35, 0.4, 0.4, 0.45, 0.45, 0.5, 0.5, 0.55, 0.6, 0.65, 0.75, 0.85, 0.95, 1, 1, 0.8, 0.5];
export const SAMPLE_BEST_TIMES: BestTimes = {
  days: 30,
  total: 9000,
  grid: Array.from({ length: 7 }, (_, d) => curve.map((v) => Math.round(v * 60 * (d === 4 || d === 5 ? 1.3 : 1)))),
};
