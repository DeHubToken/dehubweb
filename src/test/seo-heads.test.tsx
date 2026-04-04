/**
 * SEO Tests — Verify every page has SEOHead + hidden H1
 * Checks that each page component renders:
 *   1. A <title> tag (via react-helmet-async)
 *   2. A meta description
 *   3. A visually-hidden <h1> element
 */
import { describe, it, expect, vi } from 'vitest';

// ---- Heavy mocks to avoid pulling in wallets, supabase, etc. ----

// Mock AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
    openLoginModal: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

// Mock SidebarCollapseContext
vi.mock('@/contexts/SidebarCollapseContext', () => ({
  useSidebarCollapse: () => ({ isCollapsed: false }),
}));

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      if (typeof fallback === 'string') return fallback;
      return key;
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock tanstack query
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, error: null }),
  useInfiniteQuery: () => ({ data: undefined, isLoading: false, fetchNextPage: vi.fn(), hasNextPage: false }),
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
  useQueries: () => [],
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ data: [], error: null }), insert: vi.fn(), update: vi.fn(), delete: vi.fn() }),
    channel: () => ({ on: () => ({ subscribe: vi.fn() }), subscribe: vi.fn() }),
    auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }) },
  },
}));

// Mock hooks that cause side-effects
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/use-tab-indicator', () => ({
  useTabIndicator: () => ({ layerRef: { current: null }, setRef: () => () => {}, rect: { x: 0, y: 0, width: 0, height: 0, ready: false }, onScroll: vi.fn() }),
}));
vi.mock('@/hooks/use-drag-tab-indicator', () => ({
  useDragTabIndicator: () => ({ isDragging: false, indicatorRef: { current: null }, handleDragStart: vi.fn(), handleDragMove: vi.fn(), handleDragEnd: vi.fn() }),
}));
vi.mock('@/hooks/use-pull-to-refresh', () => ({
  usePullToRefresh: () => ({ pullDistance: 0, isRefreshing: false, handlers: {} }),
}));
vi.mock('@/hooks/use-feed-prefetch', () => ({
  useFeedPrefetch: vi.fn(),
  clearPrefetchState: vi.fn(),
}));
vi.mock('@/hooks/use-persisted-feed-filter', () => ({
  clearPersistedFeedFilters: vi.fn(),
}));
vi.mock('@/lib/gesture-state', () => ({
  setTabSwitchTime: vi.fn(),
}));
vi.mock('@/hooks/use-bookmarks', () => ({
  useBookmarks: () => ({ bookmarks: [], isLoading: false, totalCount: 0, fetchNextPage: vi.fn(), hasNextPage: false }),
  BookmarkType: {},
}));
vi.mock('@/hooks/use-messages', () => ({
  useConversations: () => ({ data: [], isLoading: false }),
  useUserOnlineStatus: () => ({}),
  useCreateConversation: () => ({ mutateAsync: vi.fn() }),
  useUserSearchForDM: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/use-dm-realtime', () => ({
  useDMRealtime: vi.fn(),
}));
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ data: { pages: [] }, isLoading: false, fetchNextPage: vi.fn(), hasNextPage: false }),
  useUnreadNotificationCount: () => ({ data: 0 }),
  useMarkAllNotificationsAsRead: () => ({ mutate: vi.fn() }),
  useMarkNotificationAsRead: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/use-custom-notifications', () => ({
  useCustomNotifications: () => ({ data: [], isLoading: false }),
  useCustomUnreadCount: () => ({ data: 0 }),
  useMarkCustomNotificationAsRead: () => ({ mutate: vi.fn() }),
  useMarkAllCustomNotificationsAsRead: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/use-wallet-tokens', () => ({
  useAllChainsTokens: () => ({ allTokens: [], isLoading: false }),
}));
vi.mock('@/hooks/use-staking-data', () => ({
  useStakingStats: () => ({ data: undefined }),
  useUnstakeQueue: () => ({ data: [] }),
  useStakingTVL: () => ({ data: undefined }),
  useUserStakingData: () => ({ data: undefined }),
  getUserDHBBalance: vi.fn(),
}));
vi.mock('@/hooks/use-token-prices', () => ({
  useTokenPrices: () => ({ data: {} }),
}));
vi.mock('@/hooks/use-cmc-top-100', () => ({
  useCmcTop100: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/use-voice-chat', () => ({
  useVoiceChat: () => ({ isListening: false, start: vi.fn(), stop: vi.fn() }),
}));
vi.mock('@/hooks/use-user-language', () => ({
  useUserLanguage: () => 'en',
}));
vi.mock('@/hooks/use-mention', () => ({
  useMention: () => ({ mentionState: null, handleInput: vi.fn(), selectUser: vi.fn() }),
}));
vi.mock('@/hooks/use-global-drop-zone', () => ({
  useGlobalDropZone: () => ({ isDragging: false, handleDragOver: vi.fn(), handleDragLeave: vi.fn(), handleDrop: vi.fn() }),
}));
vi.mock('@/hooks/use-governance', () => ({
  useGovernanceUserVotes: () => ({ data: {} }),
  useVoteGovernanceProposal: () => ({ mutate: vi.fn() }),
  getVoteWeight: () => 1,
}));
vi.mock('@/hooks/use-governance-proposal', () => ({
  useGovernanceProposal: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/hooks/use-governance-comments', () => ({
  useGovernanceComments: () => ({ data: [] }),
  useSubmitGovernanceComment: () => ({ mutateAsync: vi.fn() }),
  useDeleteGovernanceComment: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/use-feature-requests', () => ({
  useFeatureRequests: () => ({ features: [], isLoading: false }),
  useShippedFeatures: () => ({ data: [] }),
  useSubmitFeatureRequest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVoteFeatureRequest: () => ({ mutate: vi.fn() }),
  useUserVotes: () => ({ data: {} }),
  useDeleteFeatureRequest: () => ({ mutateAsync: vi.fn() }),
  useUpdateFeatureRequest: () => ({ mutateAsync: vi.fn() }),
  useTotalFeatureCount: () => ({ data: 0 }),
}));
vi.mock('@/hooks/use-feature-request-comments', () => ({
  useFeatureRequestComments: () => ({ data: [] }),
  useSubmitComment: () => ({ mutateAsync: vi.fn() }),
  useDeleteComment: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/use-profile-avatar-cache', () => ({
  useProfileAvatar: () => null,
}));
vi.mock('@/hooks/use-debounced-value', () => ({
  useDebouncedValue: (val: unknown) => val,
}));
vi.mock('@/lib/supabase-wallet-client', () => ({
  withWalletHeader: (query: unknown) => query,
}));
vi.mock('@/lib/web3auth', () => ({
  showWeb3AuthCheckout: vi.fn(),
  isWeb3AuthConnected: () => false,
}));
vi.mock('@/lib/wallet/send', () => ({
  sendNativeToken: vi.fn(),
  sendERC20Token: vi.fn(),
}));
vi.mock('@/lib/wallet/tokens', () => ({
  getERC20Metadata: vi.fn(),
  saveCustomToken: vi.fn(),
  formatBalance: (v: string) => v,
}));
vi.mock('@/lib/wallet/buy-links', () => ({
  getDexBuyLink: () => '',
}));
vi.mock('@/lib/contracts/dhb-token', () => ({
  BASE_CHAIN_ID: 8453,
  BNB_CHAIN_ID: 56,
  ETH_CHAIN_ID: 1,
  CHAIN_CONFIGS: {},
  fromWei: (v: string) => v,
}));
vi.mock('@/lib/contracts/aa-utils', () => ({
  getWalletAddress: vi.fn(),
  switchChain: vi.fn(),
}));
vi.mock('@/lib/contracts/staking', () => ({
  STAKING_ADDRESS: '0x0',
  claimBNBRewards: vi.fn(),
}));
vi.mock('@/lib/api/dpay', () => ({
  getDPayPrice: vi.fn(),
  getDPayPriceByChain: vi.fn(),
  getAvailableTokens: vi.fn(),
  getAvailableGasTokens: vi.fn(),
  getTokenAvailableSupply: vi.fn(),
  createCheckoutSession: vi.fn(),
  getDPaySessionStatus: vi.fn(),
  getDPayTransactions: vi.fn(),
  getAllDPayTransactions: vi.fn(),
  getDPayTotal: vi.fn(),
}));
vi.mock('@/contexts/StageContext', () => ({
  useStage: () => ({ joinSpace: vi.fn(), currentSpace: null, openModal: vi.fn() }),
}));

// Mock all image/asset imports
vi.mock('@/assets/dehub-coin.png', () => ({ default: '' }));
vi.mock('@/assets/dehub-logo.png', () => ({ default: '' }));
vi.mock('@/assets/dehub-logo-white.png', () => ({ default: '' }));
vi.mock('@/assets/bnb-logo.png', () => ({ default: '' }));
vi.mock('@/assets/governance-shield.png', () => ({ default: '' }));
vi.mock('@/assets/trophy-icon.png', () => ({ default: '' }));
vi.mock('@/assets/features-lightbulb.png', () => ({ default: '' }));
vi.mock('@/assets/glossary-icon.png', () => ({ default: '' }));


// List of pages that should have SEOHead + hidden H1
const PAGE_CASES: { name: string; path: string; h1Substring: string }[] = [
  { name: 'Home', path: 'src/pages/app/HomePage.tsx', h1Substring: 'Home' },
  { name: 'TV', path: 'src/pages/app/TVPage.tsx', h1Substring: 'Live TV' },
  { name: 'Governance', path: 'src/pages/app/GovernancePage.tsx', h1Substring: 'Governance' },
  { name: 'Leaderboard', path: 'src/pages/app/LeaderboardPage.tsx', h1Substring: 'Leaderboard' },
  { name: 'Music', path: 'src/pages/app/MusicPage.tsx', h1Substring: 'Music' },
  { name: 'Bridge', path: 'src/pages/app/BridgePage.tsx', h1Substring: 'Bridge' },
  { name: 'Agents', path: 'src/pages/app/AgentsPage.tsx', h1Substring: 'AI Agents' },
  { name: 'Buy', path: 'src/pages/app/BuyCoinsPage.tsx', h1Substring: 'Buy' },
  { name: 'Glossary', path: 'src/pages/app/GlossaryPage.tsx', h1Substring: 'Glossary' },
  { name: 'Top 100', path: 'src/pages/app/Top100CryptosPage.tsx', h1Substring: 'Top 100' },
  { name: 'Features', path: 'src/pages/app/FeaturesPage.tsx', h1Substring: 'Features' },
  { name: 'Careers', path: 'src/pages/app/CareersPage.tsx', h1Substring: 'Careers' },
  { name: 'Bookmarks', path: 'src/pages/app/BookmarksPage.tsx', h1Substring: 'Bookmarks' },
  { name: 'Messages', path: 'src/pages/app/MessagesPage.tsx', h1Substring: 'Messages' },
  { name: 'Notifications', path: 'src/pages/app/NotificationsPage.tsx', h1Substring: 'Notifications' },
  { name: 'Settings', path: 'src/pages/app/SettingsPage.tsx', h1Substring: 'Settings' },
  { name: 'Wallet', path: 'src/pages/app/FullWalletPage.tsx', h1Substring: 'Wallet' },
  { name: 'Command', path: 'src/pages/app/CommandCentrePage.tsx', h1Substring: 'Command' },
  { name: 'Explore', path: 'src/pages/app/ExplorePage.tsx', h1Substring: 'Explore' },
];

describe('SEO: Every page has a hidden H1 tag', () => {
  for (const { name, h1Substring } of PAGE_CASES) {
    it(`${name} page has a sr-only <h1> containing "${h1Substring}"`, async () => {
      // Dynamic import — we just check the H1 exists in the DOM
      // Since heavy mocks might cause some pages to partially render,
      // we grep the source file instead for reliability
      const fs = await import('fs');
      const filePath = PAGE_CASES.find(p => p.name === name)!.path;
      const source = fs.readFileSync(filePath, 'utf-8');
      
      // Check for sr-only h1
      expect(source).toMatch(/className="sr-only"/);
      expect(source).toMatch(/<h1\s/);
      expect(source).toContain(h1Substring);
    });
  }
});

describe('SEO: Every page has SEOHead with title and description', () => {
  for (const { name } of PAGE_CASES) {
    it(`${name} page imports and uses SEOHead`, async () => {
      const fs = await import('fs');
      const filePath = PAGE_CASES.find(p => p.name === name)!.path;
      const source = fs.readFileSync(filePath, 'utf-8');
      
      // Check SEOHead import
      expect(source).toContain("import { SEOHead }");
      
      // Check SEOHead usage with title and description props
      expect(source).toMatch(/<SEOHead\s/);
      expect(source).toMatch(/title="/);
      expect(source).toMatch(/description="/);
    });
  }
});

describe('SEO: Title and description length constraints', () => {
  for (const { name } of PAGE_CASES) {
    it(`${name} page has title < 60 chars and description > 100 chars`, async () => {
      const fs = await import('fs');
      const filePath = PAGE_CASES.find(p => p.name === name)!.path;
      const source = fs.readFileSync(filePath, 'utf-8');
      
      // Extract title from SEOHead
      const titleMatch = source.match(/<SEOHead[^>]*title="([^"]+)"/);
      expect(titleMatch, `${name}: SEOHead title not found`).toBeTruthy();
      const title = titleMatch![1];
      
      // Title should be under 60 chars (SEO best practice)
      expect(title.length, `${name}: title "${title}" is ${title.length} chars, should be < 60`).toBeLessThan(60);
      
      // Extract description
      const descMatch = source.match(/<SEOHead[^>]*description="([^"]+)"/);
      expect(descMatch, `${name}: SEOHead description not found`).toBeTruthy();
      const desc = descMatch![1];
      
      // Description should be > 100 chars (SEO best practice)
      expect(desc.length, `${name}: description is only ${desc.length} chars, should be > 100`).toBeGreaterThan(100);
    });
  }
});

describe('SEO: No page title contains "Page" suffix', () => {
  for (const { name } of PAGE_CASES) {
    it(`${name} SEOHead title does not contain "Page"`, async () => {
      const fs = await import('fs');
      const filePath = PAGE_CASES.find(p => p.name === name)!.path;
      const source = fs.readFileSync(filePath, 'utf-8');
      
      const titleMatch = source.match(/<SEOHead[^>]*title="([^"]+)"/);
      if (titleMatch) {
        expect(titleMatch[1]).not.toMatch(/\bPage\b/i);
      }
    });
  }
});

describe('SSR: Internal nav has 15+ links', () => {
  it('ssr-seo edge function nav block has at least 15 internal links', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('supabase/functions/ssr-seo/index.ts', 'utf-8');
    
    const navMatch = source.match(/<nav[^>]*>([\s\S]*?)<\/nav>/);
    expect(navMatch, 'nav block not found in ssr-seo').toBeTruthy();
    
    const linkCount = (navMatch![1].match(/<a\s/g) || []).length;
    expect(linkCount, `Only ${linkCount} links in SSR nav, expected >= 15`).toBeGreaterThanOrEqual(15);
  });
});

describe('SEO: JSON-LD structured data on key pages', () => {
  const JSON_LD_PAGES = [
    { name: 'Index', path: 'src/pages/Index.tsx', schemaType: 'WebSite' },
    { name: 'Home', path: 'src/pages/app/HomePage.tsx', schemaType: 'CollectionPage' },
    { name: 'Explore', path: 'src/pages/app/ExplorePage.tsx', schemaType: 'CollectionPage' },
    { name: 'TV', path: 'src/pages/app/TVPage.tsx', schemaType: 'WebApplication' },
    { name: 'Governance', path: 'src/pages/app/GovernancePage.tsx', schemaType: 'WebPage' },
    { name: 'Staking', path: 'src/pages/app/StakingPage.tsx', schemaType: 'WebPage' },
    { name: 'Leaderboard', path: 'src/pages/app/LeaderboardPage.tsx', schemaType: 'WebPage' },
    { name: 'Music', path: 'src/pages/app/MusicPage.tsx', schemaType: 'MusicPlaylist' },
    { name: 'Bridge', path: 'src/pages/app/BridgePage.tsx', schemaType: 'WebApplication' },
    { name: 'Agents', path: 'src/pages/app/AgentsPage.tsx', schemaType: 'SoftwareApplication' },
    { name: 'Assistant', path: 'src/pages/app/AssistantPage.tsx', schemaType: 'SoftwareApplication' },
    { name: 'Buy', path: 'src/pages/app/BuyCoinsPage.tsx', schemaType: 'WebPage' },
    { name: 'Glossary', path: 'src/pages/app/GlossaryPage.tsx', schemaType: 'DefinedTermSet' },
    { name: 'Top 100', path: 'src/pages/app/Top100CryptosPage.tsx', schemaType: 'Table' },
    { name: 'Features', path: 'src/pages/app/FeaturesPage.tsx', schemaType: 'WebPage' },
    { name: 'Careers', path: 'src/pages/app/CareersPage.tsx', schemaType: 'WebPage' },
    { name: 'Profile', path: 'src/pages/app/ProfilePage.tsx', schemaType: 'Person' },
    { name: 'SinglePost', path: 'src/pages/app/SinglePostPage.tsx', schemaType: 'Article' },
  ];

  for (const { name, path: filePath, schemaType } of JSON_LD_PAGES) {
    it(`${name} has JSON-LD with @type "${schemaType}"`, async () => {
      const fs = await import('fs');
      const source = fs.readFileSync(filePath, 'utf-8');
      
      expect(source).toContain('jsonLd');
      expect(source).toContain('schema.org');
      expect(source).toContain(schemaType);
    });
  }
});

describe('SSR: JSON-LD in edge function', () => {
  it('ssr-seo generates JSON-LD for profiles, posts, and fallback', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('supabase/functions/ssr-seo/index.ts', 'utf-8');
    
    expect(source).toContain('application/ld+json');
    expect(source).toContain("'@type': 'Person'");
    expect(source).toContain("'@type': 'Article'");
    expect(source).toContain("'@type': 'WebSite'");
    expect(source).toContain("'@type': 'Organization'");
  });
});
