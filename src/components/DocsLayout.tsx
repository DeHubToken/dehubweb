import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { DocsSEO } from '@/components/DocsSEO';
import { docsAsideVariants, docsContentVariants, useIsDesktop } from '@/lib/surface-motion';
import { Book, ChevronRight, Menu, X, Search, FileText, Settings, Code, Database, Shield, Zap, Users, ExternalLink, ChevronDown, Coins, Github, Phone, Home, Monitor, Gamepad2, Tv, Lock, Map, Tag, Newspaper, Scale, PenLine, HelpCircle, Heart } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { SearchTrigger } from '@/components/search/SearchTrigger';
import { useTextHighlight } from '@/hooks/useTextHighlight';
import { useDocsSearch } from '@/hooks/useDocsSearch';
import { DarkModeToggle } from '@/components/DarkModeToggle';
import { LanguageSelector } from '@/components/LanguageSelector';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { getDocsForcedTheme } from '@/lib/docs-theme';
import dehubCoinIcon from '@/assets/dehub-coin.png';

// Navigation key mapping for translations
const getMenuItems = (t: (key: string) => string) => [{
  title: t('nav.main'),
  titleKey: 'Main',
  items: [{
    title: t('nav.home'),
    path: '/docs',
    iconComponent: Home
  }, {
    title: t('nav.overview'),
    path: '/docs/overview',
    iconComponent: FileText
  }, {
    title: t('nav.dapp'),
    path: '/docs/dapps',
    iconComponent: Monitor,
    hasSubmenu: true,
    submenuItems: [{
      title: t('nav.overview'),
      path: '/docs/dapps'
    }, {
      title: t('dapp.tocFeeds'),
      path: '/docs/dapps#feeds'
    }, {
      title: t('dapp.tocUploading'),
      path: '/docs/dapps#uploading'
    }, {
      title: t('dapp.tocTokenised'),
      path: '/docs/dapps#tokenised-uploads'
    }, {
      title: t('dapp.liveStreamingTitle'),
      path: '/docs/dapps#live-streaming'
    }, {
      title: t('dapp.subscriptionsTitle'),
      path: '/docs/dapps#subscriptions'
    }, {
      title: t('dapp.messagesTitle'),
      path: '/docs/dapps#messages'
    }, {
      title: t('dapp.communitiesTitle'),
      path: '/docs/dapps#communities'
    }, {
      title: t('dapp.stagesTitle'),
      path: '/docs/dapps#stages'
    }, {
      title: t('dapp.tvRadioTitle'),
      path: '/docs/dapps#tv-radio'
    }, {
      title: t('dapp.tocWallet'),
      path: '/docs/dapps#wallet'
    }, {
      title: t('dapp.tocBounties'),
      path: '/docs/dapps#work'
    }, {
      title: t('dapp.storesTitle'),
      path: '/docs/dapps#stores'
    }, {
      title: t('dapp.affiliateTitle'),
      path: '/docs/dapps#affiliate'
    }, {
      title: t('dapp.tocAi'),
      path: '/docs/dapps#ai-suite'
    }, {
      title: t('dapp.tocEncryption'),
      path: '/docs/dapps#encryption'
    }, {
      title: t('dapp.tocDepin'),
      path: '/docs/dapps#depin'
    }, {
      title: t('dapp.tocAds'),
      path: '/docs/dapps#advertising'
    }, {
      title: t('dapp.tocRequests'),
      path: '/docs/dapps#feature-requests'
    }, {
      title: t('dapp.tocConnect'),
      path: '/docs/dapps#connect'
    }, {
      title: t('dapp.tocFees'),
      path: '/docs/dapps#fees'
    }]
  }, {
    title: t('nav.games'),
    path: '/docs/games',
    iconComponent: Gamepad2
  }, {
    title: t('nav.token'),
    path: '/docs/token',
    icon: dehubCoinIcon,
    isImage: true,
    hasSubmenu: true,
    submenuItems: [{
      title: t('nav.overview'),
      path: '/docs/token/overview'
    }, {
      title: t('nav.tokenEconomics'),
      path: '/docs/token/economics'
    }, {
      title: t('nav.tokenUtility'),
      path: '/docs/token/utility'
    }, {
      title: t('nav.tokenWhereToBuy'),
      path: '/docs/token/where-to-buy'
    }, {
      title: t('nav.tokenGovernance'),
      path: '/docs/token/governance'
    }, {
      title: t('nav.tokenStake'),
      path: '/docs/token/stake'
    }, {
      title: t('nav.tokenBridge'),
      path: '/docs/token/bridge'
    }]
  }, {
    title: t('nav.advertising'),
    path: '/docs/advertising',
    iconComponent: Tv
  }, {
    title: t('nav.team'),
    path: '/docs/team',
    iconComponent: Users
  }, {
    title: t('nav.security'),
    path: '/docs/security',
    iconComponent: Lock
  }, {
    title: t('nav.roadmap'),
    path: '/docs/roadmap',
    iconComponent: Map
  }, {
    title: t('nav.brandAssets'),
    path: '/docs/brand-assets',
    iconComponent: Tag
  }, {
    title: 'Featured In',
    path: '/docs/featured-in',
    iconComponent: Newspaper
  }, {
    title: t('nav.legalDisclaimer'),
    path: '/docs/terms',
    iconComponent: Scale
  }, {
    title: t('nav.termsOfService'),
    path: '/docs/terms-of-service',
    iconComponent: FileText
  }, {
    title: t('nav.privacyPolicy'),
    path: '/docs/privacy',
    iconComponent: Lock
  }, {
    title: t('nav.contact'),
    path: '/docs/contact',
    iconComponent: Phone,
  }]
}, {
  title: t('nav.keyLinks'),
  titleKey: 'Key Links',
  items: [
    {
      title: 'App',
      path: 'https://dehub.io',
      icon: '/lovable-uploads/dhb-icon-white-logo-2.png',
      external: true,
      isImage: true
    }, {
      title: 'Twitter',
      path: 'https://x.com/dehub_official',
      icon: '/lovable-uploads/4c5f32a0-dc0b-4846-a78d-cd3381206fa9.png',
      external: true,
      isImage: true
    }, {
      title: 'Instagram',
      path: 'https://www.instagram.com/dehub_official/',
      icon: '/lovable-uploads/3fb7f494-e111-4949-b66d-9269f163c74e.png',
      external: true,
      isImage: true
    }, {
      title: 'GitHub',
      path: 'https://github.com/dehubtoken',
      icon: '/lovable-uploads/b39e5777-ed91-489c-a58a-3639ea5bf3bc.png',
      external: true,
      isImage: true
    }, {
      title: 'CoinMarketCap',
      path: 'https://coinmarketcap.com/currencies/dehub/',
      icon: '/lovable-uploads/df505550-7e48-4148-acbb-1617520a6abc.png',
      external: true,
      isImage: true
    }, {
      title: 'CoinGecko',
      path: 'https://www.coingecko.com/en/coins/dehub',
      icon: '/lovable-uploads/coingecko-logo.png',
      external: true,
      isImage: true
    }
  ]
}, {
  title: t('nav.keyInfo'),
  titleKey: 'Key Info',
  items: [
    {
      title: t('nav.blog'),
      path: '/docs/blog',
      iconComponent: PenLine
    },
    {
      title: t('nav.faq'),
      path: '/docs/faq',
      iconComponent: HelpCircle
    },
    {
      title: t('nav.donate'),
      path: '/docs/donate',
      iconComponent: Heart
    }
  ]
}, {
  title: '',
  titleKey: '',
  items: []
}];

const DocsLayoutContent = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<{
    [key: string]: boolean;
  }>({});
  const location = useLocation();
  const { setIsOpen } = useDocsSearch();
  const { t, dir } = useLanguage();
  const { theme: appTheme } = useAppTheme();
  const isDesktop = useIsDesktop();
  // Stable across inner docs navigation so the panel doesn't re-slide when only
  // the reading content changes (it re-slides only on app↔docs surface changes).
  const asideVariants = useMemo(() => docsAsideVariants(isDesktop), [isDesktop]);
  // When the app theme pins the docs surface (canvas glass or clean paper), the
  // local light/dark toggle is a dead control — hide it. Only `system` keeps it.
  const docsThemePinned = getDocsForcedTheme(appTheme) !== undefined;
  const menuItems = getMenuItems(t);
  
  // Initialize text highlighting
  useTextHighlight();

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: 'docs-route-change', path: location.pathname },
        '*'
      );
    }
  }, [location.pathname]);

  const isActivePath = (path: string) => {
    return location.pathname === path;
  };
  // Submenu entries can be in-page anchors (`/docs/dapps#stages`). Compare against
  // pathname + hash so exactly one is highlighted, and so the hash-less "Overview"
  // entry stops looking active the moment you jump to a section.
  const isActiveSubPath = (path: string) => {
    const [subPath, subHash] = path.split('#');
    if (location.pathname !== subPath) return false;
    return subHash ? location.hash === `#${subHash}` : !location.hash;
  };
  // Anchor clicks must still scroll when the hash is unchanged (re-clicking the
  // same entry) or absent (Overview returns to the top of the page).
  const handleSubNavClick = (path: string) => {
    const [subPath, subHash] = path.split('#');
    if (location.pathname !== subPath) return;
    if (subHash) document.getElementById(subHash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const toggleSubmenu = (itemTitle: string) => {
    setExpandedMenus(prev => ({
      ...prev,
      [itemTitle]: !prev[itemTitle]
    }));
  };
  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return <div className="docs-root min-h-screen bg-background">
      {/* Header */}
      <header data-docs-header className="bg-card/90 backdrop-blur-sm border-b border-border sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 h-16">
          {/* Mobile Layout */}
          <div className="flex items-center lg:hidden w-full">
            {/* Left: Hamburger Menu */}
            <div className="flex items-center">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-md hover:bg-muted transition-colors">
                <Menu className="w-5 h-5 text-foreground" />
              </button>
            </div>
            
            {/* Center: Logo */}
            <div className="flex-1 flex justify-center">
              <Link to="/app" className="flex items-center space-x-2 font-bold text-xl text-foreground">
                <img src="/lovable-uploads/bca432dc-7ef2-4a07-99b6-fac376265184.png" alt="DeHub Logo" className="w-6 h-6 dark:invert" />
              </Link>
            </div>
            
            {/* Right: Search Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(true)}
              className="p-2"
            >
              <Search className="w-5 h-5 text-foreground" />
            </Button>
          </div>

          {/* Desktop Layout */}
          <div className="hidden lg:flex items-center space-x-3">
            <Link to="/app" className="flex items-center space-x-2 font-bold text-xl text-foreground">
              <img src="/lovable-uploads/bca432dc-7ef2-4a07-99b6-fac376265184.png" alt="DeHub Logo" className="w-6 h-6 dark:invert" />
            </Link>
          </div>

          {/* Desktop Search Bar - Positioned at far right */}
          <div className="hidden lg:block">
            <div className="w-64">
              <SearchTrigger />
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar — the docs LEFT PANEL. On desktop it slides in from the left
            after the app shell has left (surface transition); framer controls
            the x-transform there, so we drop the class-based transform to avoid
            double-animating. On mobile it stays the class-driven hamburger
            drawer (framer only touches opacity — see docsAsideVariants). */}
        <motion.aside
          data-docs-sidebar
          variants={asideVariants}
          className={`
          fixed lg:sticky lg:top-16 inset-y-0 lg:inset-y-auto left-0 z-30 w-64 h-screen lg:h-[calc(100vh-4rem)] bg-card/95 backdrop-blur-sm border-r border-border
          ${isDesktop ? '' : `transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        `}>
          <div className="h-full flex flex-col">
            {/* Mobile close button */}
            <div className="lg:hidden flex justify-between items-center p-4 border-b border-border">
              <div className="flex-1">
                <SearchTrigger />
              </div>
              <button onClick={closeSidebar} className="p-2 rounded-md hover:bg-muted transition-colors ml-2">
                <X className="w-5 h-5 text-foreground" />
              </button>
            </div>
            
            {/* Dark Mode Toggle & Language Selector at top */}
            <div className="px-4 py-3 border-b border-border flex items-center gap-2 min-w-0">
              {!docsThemePinned && <div className="flex-shrink-0"><DarkModeToggle /></div>}
              <div className="flex-1 min-w-0 overflow-hidden"><LanguageSelector /></div>
            </div>
            
            <ScrollArea className="flex-1 overscroll-contain">
              <div className="py-6">
                <nav className="px-4 space-y-6">
                  {menuItems.map(section => <div key={section.titleKey || section.title}>
                      {section.titleKey !== 'Main' && section.title && <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                          {section.title}
                        </h3>}
                      <ul className="space-y-1">
                        {section.items.map(item => <li key={item.path}>
                            {item.external && (item.path.startsWith('http') || item.path.startsWith('https')) ? <a href={item.path} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-200 text-muted-foreground hover:bg-muted hover:text-foreground">
                                <div className="flex items-center space-x-3">
                                  {item.isImage ? <img src={item.icon} alt={item.title} className={`${item.title === 'App' ? 'w-[1.17rem] h-[1.17rem]' : 'w-4 h-4'} ${item.title !== 'App' && item.title !== 'CoinGecko' && item.title !== 'Twitter' ? 'dark:invert' : ''} ${item.title === 'Twitter' ? 'invert dark:invert-0' : ''}`} /> : <span className="text-base">{item.icon}</span>}
                                  <span>{item.title}</span>
                                </div>
                                <ExternalLink className="w-3 h-3 text-muted-foreground" />
                              </a> : <div>
                                {item.hasSubmenu && item.submenuItems ? <div>
                                    <button onClick={() => toggleSubmenu(item.title)} className={`
                                        w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-200
                                        ${isActivePath(item.path) ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}
                                      `}>
                                      <div className="flex items-center space-x-3">
                                        {item.iconComponent ? <item.iconComponent className="w-4 h-4 text-muted-foreground" /> : item.isImage ? <img src={item.icon} alt={item.title} className="w-4 h-4" /> : <span className="text-base">{item.icon}</span>}
                                        <span>{item.title}</span>
                                      </div>
                                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${expandedMenus[item.title] ? 'rotate-180' : ''}`} />
                                    </button>
                                    {expandedMenus[item.title] && <ul className="ml-6 mt-1 space-y-1">
                                        {item.submenuItems.map(subItem => <li key={subItem.path}>
                                            <Link to={subItem.path} onClick={() => { handleSubNavClick(subItem.path); closeSidebar(); }} className={`
                                                flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200
                                                ${isActiveSubPath(subItem.path) ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}
                                              `}>
                                              <span>{subItem.title}</span>
                                            </Link>
                                          </li>)}
                                      </ul>}
                                  </div> : <Link to={item.path} onClick={closeSidebar} className={`
                                      flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-200
                                      ${isActivePath(item.path) ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}
                                    `}>
                                    <div className="flex items-center space-x-3">
                                      {item.iconComponent ? <item.iconComponent className="w-4 h-4 text-muted-foreground" /> : item.isImage ? <img src={item.icon} alt={item.title} className={`w-4 h-4 ${item.title !== 'App' && item.title !== 'CoinGecko' ? 'dark:invert' : ''}`} /> : <span className="text-base">{item.icon}</span>}
                                      <span>{item.title}</span>
                                    </div>
                                    {item.hasSubmenu && !item.submenuItems && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                                    {item.external && <ExternalLink className="w-3 h-3 text-muted-foreground" />}
                                  </Link>}
                              </div>}
                          </li>)}
                      </ul>
                    </div>)}
                </nav>
              </div>
            </ScrollArea>
          </div>
        </motion.aside>

        {/* Overlay for mobile */}
        {sidebarOpen && <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-20 lg:hidden" onClick={closeSidebar} />}

        {/* Main content — soft fade-up as the docs surface arrives. */}
        <main className="flex-1 min-w-0">
          <DocsSEO />
          <motion.div variants={docsContentVariants} className="max-w-4xl mx-auto px-6 py-8">
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>;
};

export const DocsLayout = () => {
  return <DocsLayoutContent />;
};

