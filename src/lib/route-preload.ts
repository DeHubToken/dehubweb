/**
 * Intent-based route chunk preloading.
 * =====================================
 * Every page is lazy-loaded, so on slow connections tapping a nav item used
 * to feel dead while the page's JS chunk downloaded AFTER the tap. Calling
 * preloadRoute() on touchstart / pointerenter / focus starts that download
 * the moment intent appears — by the time the click handler fires, the chunk
 * is warm (or already in flight).
 *
 * The import() specifiers below intentionally match the lazy() specifiers in
 * PersistentPageCache.tsx / App.tsx exactly — Vite resolves them to the same
 * module, so this warms the very chunk the router will request; it never
 * creates extra bundles.
 *
 * List pages warm their detail-page chunk as a companion (second array entry):
 * the only way to reach a detail page is through its list, so by the time the
 * user clicks a card the detail chunk is already in cache — no double
 * waterfall (chunk fetch → data fetch) on first open.
 */

type Preloader = () => Promise<unknown>;

const PRELOADERS: Record<string, Preloader | Preloader[]> = {
  '/app/explore': () => import('@/pages/app/ExplorePage'),
  '/explore': () => import('@/pages/app/ExplorePage'),
  '/app/profile': () => import('@/pages/app/ProfilePage'),
  '/app/notifications': () => import('@/pages/app/NotificationsPage'),
  '/app/messages': () => import('@/pages/app/MessagesPage'),
  '/app/assistant': () => import('@/pages/app/AssistantPage'),
  '/app/leaderboard': () => import('@/pages/app/LeaderboardPage'),
  '/app/bookmarks': () => import('@/pages/app/BookmarksPage'),
  '/app/settings': () => import('@/pages/app/SettingsPage'),
  '/app/command-centre': () => import('@/pages/app/CommandCentrePage'),
  '/app/wallet': () => import('@/pages/app/FullWalletPage'),
  '/app/music': () => import('@/pages/app/MusicPage'),
  '/app/stages': () => import('@/pages/app/StagesPage'),
  '/stages': () => import('@/pages/app/StagesPage'),
  '/app/tv': () => import('@/pages/app/TVPage'),
  '/app/buy': () => import('@/pages/app/BuyCoinsPage'),
  '/app/agents': () => import('@/pages/app/AgentsPage'),
  '/app/features': () => import('@/pages/app/FeaturesPage'),
  '/features': () => import('@/pages/app/FeaturesPage'),
  '/app/governance': [
    () => import('@/pages/app/GovernancePage'),
    () => import('@/pages/app/GovernanceProposalPage'),
  ],
  '/governance': [
    () => import('@/pages/app/GovernancePage'),
    () => import('@/pages/app/GovernanceProposalPage'),
  ],
  '/app/jobs': () => import('@/pages/app/CareersPage'),
  '/jobs': () => import('@/pages/app/CareersPage'),
  '/app/glossary': () => import('@/pages/app/GlossaryPage'),
  '/glossary': () => import('@/pages/app/GlossaryPage'),
  '/app/stake': () => import('@/pages/app/StakingPage'),
  '/stake': () => import('@/pages/app/StakingPage'),
  '/app/bridge': () => import('@/pages/app/BridgePage'),
  '/app/communities': [
    () => import('@/pages/app/CommunitiesPage'),
    () => import('@/pages/app/CommunityPage'),
  ],
  '/communities': [
    () => import('@/pages/app/CommunitiesPage'),
    () => import('@/pages/app/CommunityPage'),
  ],
  '/app/events': [
    () => import('@/pages/app/EventsPage'),
    () => import('@/pages/EventPage'),
  ],
  '/app/stores': [
    () => import('@/pages/app/StoresPage'),
    () => import('@/pages/app/StoreDetailPage'),
  ],
  '/app/work': [
    () => import('@/pages/app/WorkPage'),
    () => import('@/pages/app/WorkJobDetailPage'),
  ],
  '/work': [
    () => import('@/pages/app/WorkPage'),
    () => import('@/pages/app/WorkJobDetailPage'),
  ],
  '/app/launchpad': [
    () => import('@/pages/app/LaunchpadPage'),
    () => import('@/pages/app/LaunchpadCoinPage'),
  ],
  '/launchpad': [
    () => import('@/pages/app/LaunchpadPage'),
    () => import('@/pages/app/LaunchpadCoinPage'),
  ],
  '/app/affiliate': () => import('@/pages/app/AffiliatePage'),
  '/affiliate': () => import('@/pages/app/AffiliatePage'),
  '/app/top-100': () => import('@/pages/app/Top100CryptosPage'),
  '/app/ads': () => import('@/pages/app/AdsPage'),
  '/premium': () => import('@/pages/Premium'),
  '/pricing': () => import('@/pages/PricingPage'),
  '/prompt': () => import('@/pages/PromptLanding'),
  '/guide': () => import('@/pages/GuidePage'),
  '/docs': () => import('@/pages/DocsSurface'),
  '/guides': () => import('@/pages/DocsSurface'),
};

const warmed = new Set<string>();

export function preloadRoute(path: string | undefined): void {
  if (!path) return;
  const clean = path.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  // Exact match first, then longest registered prefix (e.g. /docs/blog -> /docs).
  let key = PRELOADERS[clean] ? clean : undefined;
  if (!key) {
    key = Object.keys(PRELOADERS)
      .filter(p => clean.startsWith(p + '/'))
      .sort((a, b) => b.length - a.length)[0];
  }
  if (!key || warmed.has(key)) return;
  warmed.add(key);
  const loaders = PRELOADERS[key];
  const list = Array.isArray(loaders) ? loaders : [loaders];
  Promise.all(list.map(load => load())).catch(() => {
    // Network hiccup — allow a later intent to retry.
    warmed.delete(key);
  });
}
