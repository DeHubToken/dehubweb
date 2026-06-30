import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import Fuse from 'fuse.js';
import { useLocation, useNavigate } from 'react-router-dom';

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  path: string;
  category: string;
  type: 'page' | 'blog' | 'section';
  matches?: any[];
  score?: number;
}

export interface SearchIndex {
  id: string;
  title: string;
  content: string;
  path: string;
  category: string;
  type: 'page' | 'blog' | 'section';
  keywords: string[];
}

interface SearchContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  query: string;
  setQuery: (query: string) => void;
  results: SearchResult[];
  isLoading: boolean;
  recentSearches: string[];
  highlightedIndex: number;
  navigateToResult: (result: SearchResult, searchTerm?: string) => void;
  saveRecentSearch: (searchTerm: string) => void;
  clearRecentSearches: () => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

const RECENT_SEARCHES_KEY = 'recent-searches';

// Comprehensive content index for all documentation
const createSearchIndex = (): SearchIndex[] => {
  return [
    // Main pages
    {
      id: 'docs-home',
      title: 'Documentation Home',
      content: 'Welcome to DeHub documentation. Learn about our decentralized infrastructure platform, token economics, DePIN network, and development tools.',
      path: '/docs',
      category: 'Main',
      type: 'page',
      keywords: ['home', 'documentation', 'welcome', 'getting started']
    },
    {
      id: 'overview',
      title: 'Overview',
      content: 'DeHub platform overview, architecture, core features, decentralized infrastructure, blockchain technology, Web3 ecosystem',
      path: '/docs/overview',
      category: 'Main',
      type: 'page',
      keywords: ['overview', 'platform', 'architecture', 'features']
    },
    {
      id: 'dapps',
      title: "d'App",
      content: 'Decentralized applications on DeHub platform, development tools, APIs, SDKs, smart contracts, badges, tipping, moderation, wallet, rewards, games, raffle',
      path: '/docs/dapps',
      category: 'Main',
      type: 'page',
      keywords: ['dapp', 'decentralized', 'applications', 'development', 'badge', 'badges', 'tipping', 'moderation', 'wallet', 'rewards', 'games', 'raffle']
    },
    {
      id: 'games',
      title: 'Games',
      content: 'Gaming ecosystem on DeHub, play-to-earn, NFT integration, gaming infrastructure, tournaments, raffle, lottery',
      path: '/docs/games',
      category: 'Main',
      type: 'page',
      keywords: ['games', 'gaming', 'play-to-earn', 'nft', 'tournaments', 'raffle', 'lottery']
    },
    {
      id: 'token-economics',
      title: 'Token Economics & Emissions',
      content: 'DHB token economics, emission schedule, tokenomics model, distribution, supply mechanics, burn, deflation',
      path: '/docs/token/economics',
      category: 'Token',
      type: 'page',
      keywords: ['token', 'economics', 'emissions', 'tokenomics', 'dhb', 'burn', 'supply', 'deflation']
    },
    {
      id: 'token-utility',
      title: 'Token Utility & Holder Benefits',
      content: 'DHB token utility, holder benefits, staking rewards, governance rights, ecosystem benefits, badges, tipping, content creation, moderation',
      path: '/docs/token/utility',
      category: 'Token',
      type: 'page',
      keywords: ['utility', 'benefits', 'staking', 'governance', 'rewards', 'badges', 'tipping', 'holder']
    },
    {
      id: 'badges',
      title: 'Badges & Tiers',
      content: 'Badge system, badge tiers, Crab, Lobster, Piranha, Tortoise, Cobra, Octopus, Crocodile, Dolphin, Tiger Shark, Killer Whale, Great White, Blue Whale, Megalodon, holder badges, token holdings, badge levels, tier system, badge rewards',
      path: '/docs/token/utility',
      category: 'Token',
      type: 'section',
      keywords: ['badge', 'badges', 'tier', 'tiers', 'crab', 'lobster', 'piranha', 'tortoise', 'cobra', 'octopus', 'crocodile', 'dolphin', 'tiger shark', 'killer whale', 'great white', 'blue whale', 'megalodon', 'holder', 'level', 'rank']
    },
    {
      id: 'tipping',
      title: 'Tipping System',
      content: 'Tipping system for content creators, send tips, receive tips, DHB tipping, reward creators, community support',
      path: '/docs/token/utility',
      category: 'Token',
      type: 'section',
      keywords: ['tipping', 'tips', 'tip', 'reward', 'creators', 'send', 'receive', 'support']
    },
    {
      id: 'moderation',
      title: 'Content Moderation',
      content: 'Content moderation system, reporting, flagging, community guidelines, content policy, moderators',
      path: '/docs/token/utility',
      category: 'Token',
      type: 'section',
      keywords: ['moderation', 'moderate', 'report', 'flag', 'guidelines', 'policy', 'content']
    },
    {
      id: 'where-to-buy',
      title: 'Where to Buy',
      content: 'Buy DHB token on exchanges, trading pairs, liquidity pools, DEX, CEX listings, Uniswap, PancakeSwap',
      path: '/docs/token/where-to-buy',
      category: 'Token',
      type: 'page',
      keywords: ['buy', 'exchange', 'trading', 'dex', 'cex', 'liquidity', 'uniswap', 'pancakeswap', 'purchase']
    },
    {
      id: 'governance',
      title: 'Governance',
      content: 'DeHub governance system, voting mechanisms, proposals, DAO structure, community decisions, voting power',
      path: '/docs/token/governance',
      category: 'Token',
      type: 'page',
      keywords: ['governance', 'voting', 'dao', 'proposals', 'community', 'vote', 'decision']
    },
    {
      id: 'stake',
      title: 'Stake',
      content: 'Staking DHB tokens, staking rewards, validation, network security, staking pools, APY, yield',
      path: '/docs/token/stake',
      category: 'Token',
      type: 'page',
      keywords: ['stake', 'staking', 'rewards', 'validation', 'security', 'apy', 'yield', 'pool']
    },
    {
      id: 'bridge',
      title: 'Bridge',
      content: 'Cross-chain token bridge for DHB tokens between BASE and BNB networks, token transfer, cross-chain swap',
      path: '/docs/token/bridge',
      category: 'Token',
      type: 'page',
      keywords: ['bridge', 'cross-chain', 'base', 'bnb', 'token', 'transfer', 'swap', 'network']
    },
    {
      id: 'depin',
      title: 'DePIN',
      content: 'Decentralized Physical Infrastructure Network, hardware nodes, network participation, rewards, mining',
      path: '/docs/depin',
      category: 'Main',
      type: 'page',
      keywords: ['depin', 'infrastructure', 'physical', 'nodes', 'hardware', 'mining', 'network']
    },
    {
      id: 'ai-toolkits',
      title: 'AI Toolkits',
      content: 'Artificial intelligence tools, machine learning, AI development, APIs, toolkits, chatbot, automation',
      path: '/docs/ai-toolkits',
      category: 'Main',
      type: 'page',
      keywords: ['ai', 'artificial intelligence', 'machine learning', 'toolkits', 'chatbot', 'automation']
    },
    {
      id: 'advertising',
      title: 'Advertising',
      content: 'Advertising platform, ad campaigns, monetization, content creators, advertising revenue, CPM, impressions, badge-based targeting',
      path: '/docs/advertising',
      category: 'Main',
      type: 'page',
      keywords: ['advertising', 'ads', 'campaigns', 'monetization', 'revenue', 'cpm', 'impressions', 'targeting']
    },
    {
      id: 'advertiser-dashboard',
      title: 'Advertiser Dashboard',
      content: 'Advertiser dashboard for managing campaigns, analytics, budget management, ad performance, campaign creation, ROI tracking',
      path: '/docs/advertiser-dashboard',
      category: 'Main',
      type: 'page',
      keywords: ['advertiser', 'dashboard', 'campaign', 'analytics', 'budget', 'performance', 'roi']
    },
    {
      id: 'e2ee',
      title: 'End-to-End Encryption',
      content: 'End-to-end encryption, E2EE, secure messaging, privacy, encrypted communication, data protection, cryptography',
      path: '/docs/e2ee',
      category: 'Main',
      type: 'page',
      keywords: ['e2ee', 'encryption', 'end-to-end', 'privacy', 'secure', 'messaging', 'encrypted', 'cryptography']
    },
    {
      id: 'donate',
      title: 'Donate',
      content: 'Donate to DeHub project, support development, community donations, funding, contribute',
      path: '/docs/donate',
      category: 'Main',
      type: 'page',
      keywords: ['donate', 'donation', 'support', 'funding', 'contribute', 'help']
    },
    {
      id: 'team',
      title: 'Team',
      content: 'DeHub team members, founders, developers, advisors, company information. Malik CEO and founder.',
      path: '/docs/team',
      category: 'Main',
      type: 'page',
      keywords: ['team', 'founders', 'developers', 'company', 'about', 'malik', 'ceo', 'founder', 'leadership']
    },
    {
      id: 'security',
      title: 'Security',
      content: 'Security measures, audits, smart contract security, platform security, best practices, token security',
      path: '/docs/security',
      category: 'Main',
      type: 'page',
      keywords: ['security', 'audits', 'smart contracts', 'safety', 'audit']
    },
    {
      id: 'roadmap',
      title: 'Roadmap',
      content: 'DeHub development roadmap, future plans, milestones, upcoming features, timeline, phases',
      path: '/docs/roadmap',
      category: 'Main',
      type: 'page',
      keywords: ['roadmap', 'future', 'plans', 'milestones', 'development', 'timeline', 'phases']
    },
    {
      id: 'brand-assets',
      title: 'Brand Assets',
      content: 'DeHub brand assets, logos, graphics, brand guidelines, marketing materials, downloads',
      path: '/docs/brand-assets',
      category: 'Brand',
      type: 'page',
      keywords: ['brand', 'assets', 'logos', 'graphics', 'marketing', 'download']
    },
    {
      id: 'contact',
      title: 'Contact',
      content: 'Contact DeHub team, support, partnerships, business inquiries, community, email, social media',
      path: '/docs/contact',
      category: 'Main',
      type: 'page',
      keywords: ['contact', 'support', 'partnerships', 'business', 'help', 'email', 'social']
    },
    {
      id: 'blog',
      title: 'Community Blog',
      content: 'DeHub community blog, latest news, updates, announcements, insights, stories, articles',
      path: '/docs/blog',
      category: 'Blog',
      type: 'blog',
      keywords: ['blog', 'news', 'updates', 'announcements', 'community', 'articles']
    },
    {
      id: 'quickstart',
      title: 'Quick Start',
      content: 'Quick start guide for DeHub platform, getting started, first steps, setup instructions',
      path: '/docs/quickstart',
      category: 'Development',
      type: 'page',
      keywords: ['quickstart', 'getting started', 'setup', 'guide', 'first steps']
    },
    {
      id: 'installation',
      title: 'Installation',
      content: 'Installation guide for DeHub tools, setup instructions, requirements, dependencies, download app',
      path: '/docs/installation',
      category: 'Development',
      type: 'page',
      keywords: ['installation', 'setup', 'install', 'requirements', 'dependencies', 'download', 'app']
    },
    {
      id: 'api-endpoints',
      title: 'API Endpoints',
      content: 'DeHub API endpoints documentation, REST API, GraphQL, webhooks, integration guide',
      path: '/docs/endpoints',
      category: 'Development',
      type: 'page',
      keywords: ['api', 'endpoints', 'rest', 'graphql', 'webhooks', 'integration']
    },
    {
      id: 'terms',
      title: 'Terms',
      content: 'DeHub terms and conditions, user agreement, platform terms, legal terms',
      path: '/docs/terms',
      category: 'Legal',
      type: 'page',
      keywords: ['terms', 'conditions', 'agreement', 'legal', 'user terms']
    },
    {
      id: 'terms-of-service',
      title: 'Terms of Service',
      content: 'DeHub terms of service, service agreement, user responsibilities, platform rules',
      path: '/docs/terms-of-service',
      category: 'Legal',
      type: 'page',
      keywords: ['terms of service', 'service agreement', 'responsibilities', 'rules']
    },
    {
      id: 'privacy-policy',
      title: 'Privacy Policy',
      content: 'DeHub privacy policy, data protection, user privacy, information collection, GDPR compliance',
      path: '/docs/privacy',
      category: 'Legal',
      type: 'page',
      keywords: ['privacy', 'policy', 'data protection', 'gdpr', 'information']
    },
    {
      id: 'brand-guidelines',
      title: 'Brand Guidelines',
      content: 'DeHub brand guidelines, brand identity, logo usage, design standards, marketing guidelines',
      path: '/docs/brand-guidelines',
      category: 'Brand',
      type: 'page',
      keywords: ['brand', 'guidelines', 'identity', 'logo', 'design', 'marketing']
    },
    {
      id: 'faq',
      title: 'FAQ',
      content: 'Frequently asked questions about DeHub platform, common questions, troubleshooting, help',
      path: '/docs/faq',
      category: 'Support',
      type: 'page',
      keywords: ['faq', 'questions', 'help', 'troubleshooting', 'support', 'answers']
    },
    // Blog posts
    {
      id: 'blog-coinbase',
      title: 'Coinbase DHB Listing',
      content: 'Coinbase listing for DHB token, exchange listing, trading, centralized exchange',
      path: '/docs/blog/coinbase-dhb',
      category: 'Blog',
      type: 'blog',
      keywords: ['coinbase', 'listing', 'exchange', 'dhb', 'trading']
    },
    {
      id: 'blog-e2ee',
      title: 'E2EE Announcement',
      content: 'End-to-end encryption launch, secure messaging feature, privacy update',
      path: '/docs/blog/e2ee',
      category: 'Blog',
      type: 'blog',
      keywords: ['e2ee', 'encryption', 'privacy', 'secure', 'messaging']
    },
    {
      id: 'blog-google-play',
      title: 'Google Play Store Launch',
      content: 'DeHub app on Google Play Store, Android app, mobile download, app launch',
      path: '/docs/blog/google-play-store',
      category: 'Blog',
      type: 'blog',
      keywords: ['google play', 'android', 'app', 'mobile', 'download', 'play store']
    },
    {
      id: 'blog-dev-update',
      title: 'Developer Update January 2026',
      content: 'Development update, new features, improvements, technical progress, changelog',
      path: '/docs/blog/dev-update-jan-2026',
      category: 'Blog',
      type: 'blog',
      keywords: ['dev update', 'development', 'features', 'improvements', 'changelog']
    },
    {
      id: 'blog-town-hall',
      title: 'Town Hall AMA January 2026',
      content: 'Town hall meeting, AMA session, community questions, answers, live event',
      path: '/docs/blog/town-hall-jan-2026',
      category: 'Blog',
      type: 'blog',
      keywords: ['town hall', 'ama', 'community', 'meeting', 'questions', 'live']
    },
    {
      id: 'blog-yearly-wrap',
      title: 'Yearly Wrap Up 2025',
      content: 'Year in review 2025, annual summary, achievements, milestones, yearly recap',
      path: '/docs/blog/yearly-wrap-up-2025',
      category: 'Blog',
      type: 'blog',
      keywords: ['yearly', 'wrap up', 'review', '2025', 'annual', 'recap', 'summary']
    },
    {
      id: 'blog-dubai',
      title: 'Dubai Event',
      content: 'DeHub Dubai event, blockchain conference, crypto event, networking, partnership',
      path: '/docs/blog/dubai-event',
      category: 'Blog',
      type: 'blog',
      keywords: ['dubai', 'event', 'conference', 'blockchain', 'networking']
    },
    {
      id: 'blog-award',
      title: 'Award-Winning Innovation',
      content: 'DeHub award winning innovation, recognition, blockchain award, technology prize',
      path: '/docs/blog/award-winning-innovation',
      category: 'Blog',
      type: 'blog',
      keywords: ['award', 'innovation', 'winning', 'recognition', 'prize']
    },
    {
      id: 'blog-tokenised-uploads',
      title: 'Tokenised Uploads',
      content: 'Tokenised uploads feature, content tokenisation, upload rewards, NFT content',
      path: '/docs/blog/tokenised-uploads',
      category: 'Blog',
      type: 'blog',
      keywords: ['tokenised', 'uploads', 'content', 'nft', 'tokenization']
    },
    // Sub-topic sections for better discoverability
    {
      id: 'ad-badge-targeting',
      title: 'Badge-Based Ad Targeting',
      content: 'Target ads based on user badge tiers, CPM rates per badge, Crab Lobster Piranha Tortoise Cobra Octopus Crocodile Dolphin advertising costs',
      path: '/docs/advertising',
      category: 'Main',
      type: 'section',
      keywords: ['badge', 'targeting', 'cpm', 'ad', 'tier', 'crab', 'lobster', 'advertising', 'cost', 'rate']
    },
    {
      id: 'wallet',
      title: 'Wallet & Holdings',
      content: 'DHB wallet, token holdings, balance, portfolio, wallet connect, MetaMask, crypto wallet',
      path: '/docs/token/utility',
      category: 'Token',
      type: 'section',
      keywords: ['wallet', 'holdings', 'balance', 'portfolio', 'metamask', 'connect']
    },
    {
      id: 'rewards',
      title: 'Rewards & Earnings',
      content: 'Earning rewards on DeHub, content rewards, staking earnings, referral rewards, passive income',
      path: '/docs/token/utility',
      category: 'Token',
      type: 'section',
      keywords: ['rewards', 'earnings', 'earn', 'income', 'referral', 'passive']
    },
    {
      id: 'nft',
      title: 'NFTs & Digital Assets',
      content: 'NFT marketplace, digital assets, non-fungible tokens, collectibles, NFT creation, minting',
      path: '/docs/dapps',
      category: 'Main',
      type: 'section',
      keywords: ['nft', 'digital assets', 'collectibles', 'minting', 'marketplace', 'non-fungible']
    },
    {
      id: 'social',
      title: 'Social Features',
      content: 'Social media features, messaging, groups, channels, community, feed, posts, sharing, chat',
      path: '/docs/dapps',
      category: 'Main',
      type: 'section',
      keywords: ['social', 'messaging', 'chat', 'groups', 'channels', 'feed', 'posts', 'sharing', 'community']
    }
  ];
};

export const SearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  
  const location = useLocation();
  const navigate = useNavigate();

  // Initialize search index
  const searchIndex = useMemo(() => createSearchIndex(), []);

  // Configure Fuse.js for fuzzy search
  const fuse = useMemo(() => {
    const options = {
      keys: [
        { name: 'title', weight: 0.4 },
        { name: 'content', weight: 0.3 },
        { name: 'keywords', weight: 0.2 },
        { name: 'category', weight: 0.1 }
      ],
      threshold: 0.3,
      includeMatches: true,
      includeScore: true,
      minMatchCharLength: 2,
    };
    return new Fuse(searchIndex, options);
  }, [searchIndex]);

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse recent searches:', e);
      }
    }
  }, []);

  // Debounced search function
  const performSearch = useCallback(
    (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      setIsLoading(true);
      
      // Simulate slight delay for better UX
      setTimeout(() => {
        const searchResults = fuse.search(searchQuery);
        const formattedResults: SearchResult[] = searchResults.map((result, index) => ({
          id: result.item.id,
          title: result.item.title,
          content: result.item.content,
          path: result.item.path,
          category: result.item.category,
          type: result.item.type,
          matches: result.matches ? [...result.matches] : undefined,
          score: result.score
        }));
        
        setResults(formattedResults);
        setIsLoading(false);
        setHighlightedIndex(-1);
      }, 100);
    },
    [fuse]
  );

  // Handle search query changes
  useEffect(() => {
    performSearch(query);
  }, [query, performSearch]);

  // Save search to recent searches
  const saveRecentSearch = useCallback((searchTerm: string) => {
    if (!searchTerm.trim()) return;
    
    const updated = [searchTerm, ...recentSearches.filter(s => s !== searchTerm)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  }, [recentSearches]);

  // Navigate to search result with highlighting
  const navigateToResult = useCallback((result: SearchResult, searchTerm?: string) => {
    if (searchTerm) {
      saveRecentSearch(searchTerm);
    }
    
    // Clear any existing highlights immediately
    const existingHighlights = document.querySelectorAll('.search-highlight');
    existingHighlights.forEach(highlight => {
      const parent = highlight.parentElement;
      if (parent) {
        const textContent = parent.textContent || '';
        const textNode = document.createTextNode(textContent);
        parent.parentNode?.replaceChild(textNode, parent);
      }
    });
    
    // Clear any pending highlight requests
    sessionStorage.removeItem('search-highlight');
    
    setIsOpen(false);
    setQuery('');
    
    // Store search term for highlighting on the new page
    if (searchTerm) {
      sessionStorage.setItem('search-highlight', searchTerm);
    }
    
    navigate(result.path);
  }, [navigate, saveRecentSearch]);

  // Keyboard navigation handlers
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && results[highlightedIndex]) {
          navigateToResult(results[highlightedIndex], query);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setQuery('');
        break;
    }
  }, [isOpen, results, highlightedIndex, navigateToResult, query]);

  // Global keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Add keyboard navigation when modal is open
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  }, []);

  const contextValue: SearchContextType = {
    isOpen,
    setIsOpen,
    query,
    setQuery,
    results,
    isLoading,
    recentSearches,
    highlightedIndex,
    navigateToResult,
    saveRecentSearch,
    clearRecentSearches
  };

  return (
    <SearchContext.Provider value={contextValue}>
      {children}
    </SearchContext.Provider>
  );
};

export const useSearchContext = () => {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error('useSearchContext must be used within a SearchProvider');
  }
  return context;
};
