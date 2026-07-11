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
 */

const PRELOADERS: Record<string, () => Promise<unknown>> = {
  '/app/explore': () => import('@/pages/app/ExplorePage'),
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
  '/app/tv': () => import('@/pages/app/TVPage'),
  '/app/buy': () => import('@/pages/app/BuyCoinsPage'),
  '/app/agents': () => import('@/pages/app/AgentsPage'),
  '/app/features': () => import('@/pages/app/FeaturesPage'),
  '/features': () => import('@/pages/app/FeaturesPage'),
  '/app/governance': () => import('@/pages/app/GovernancePage'),
  '/governance': () => import('@/pages/app/GovernancePage'),
  '/app/jobs': () => import('@/pages/app/CareersPage'),
  '/jobs': () => import('@/pages/app/CareersPage'),
  '/app/glossary': () => import('@/pages/app/GlossaryPage'),
  '/glossary': () => import('@/pages/app/GlossaryPage'),
  '/app/stake': () => import('@/pages/app/StakingPage'),
  '/stake': () => import('@/pages/app/StakingPage'),
  '/app/bridge': () => import('@/pages/app/BridgePage'),
  '/app/communities': () => import('@/pages/app/CommunitiesPage'),
  '/communities': () => import('@/pages/app/CommunitiesPage'),
  '/app/events': () => import('@/pages/app/EventsPage'),
  '/app/stores': () => import('@/pages/app/StoresPage'),
  '/app/work': () => import('@/pages/app/WorkPage'),
  '/work': () => import('@/pages/app/WorkPage'),
  '/app/affiliate': () => import('@/pages/app/AffiliatePage'),
  '/prompt': () => import('@/pages/PromptLanding'),
  '/guide': () => import('@/pages/GuidePage'),
  '/docs': () => import('@/pages/DocsRoutes'),
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
  PRELOADERS[key]().catch(() => {
    // Network hiccup — allow a later intent to retry.
    warmed.delete(key);
  });
}
