import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Book, ChevronRight, Menu, X, Search, Home, FileText, Settings, Code, Database, Shield, Zap, Users, ExternalLink, ChevronDown, Coins, Github, Phone } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { SearchTrigger } from '@/components/search/SearchTrigger';
import { useTextHighlight } from '@/hooks/useTextHighlight';
import { useDocsSearch } from '@/hooks/useDocsSearch';
import { DarkModeToggle } from '@/components/DarkModeToggle';
import { LanguageSelector } from '@/components/LanguageSelector';
import { useLanguage } from '@/contexts/LanguageContext';
import dehubCoinIcon from '@/assets/dehub-coin.png';

// Navigation key mapping for translations
const getMenuItems = (t: (key: string) => string) => [{
  title: t('nav.main'),
  titleKey: 'Main',
  items: [{
    title: t('nav.home'),
    path: '/docs',
    icon: '🏠'
  }, {
    title: t('nav.overview'),
    path: '/docs/overview',
    icon: '📋'
  }, {
    title: t('nav.dapp'),
    path: '/docs/dapps',
    icon: '🖥️'
  }, {
    title: t('nav.games'),
    path: '/docs/games',
    icon: '🎮'
  }, {
    title: t('nav.token'),
    path: '/docs/token',
    icon: dehubCoinIcon,
    isImage: true,
    hasSubmenu: true,
    submenuItems: [{
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
    title: t('nav.depin'),
    path: '/docs/depin',
    icon: '🔧'
  }, {
    title: t('nav.e2eEncryption'),
    path: '/docs/e2e-encryption',
    icon: '🔐'
  }, {
    title: t('nav.aiToolkits'),
    path: '/docs/ai-toolkits',
    icon: '🤖'
  }, {
    title: t('nav.advertising'),
    path: '/docs/advertising',
    icon: '📺'
  }, {
    title: t('nav.team'),
    path: '/docs/team',
    icon: '👥'
  }, {
    title: t('nav.security'),
    path: '/docs/security',
    icon: '🔒'
  }, {
    title: t('nav.roadmap'),
    path: '/docs/roadmap',
    icon: '🗺️'
  }, {
    title: t('nav.brandAssets'),
    path: '/docs/brand-assets',
    icon: '🏷️'
  }, {
    title: t('nav.legalDisclaimer'),
    path: '/docs/terms',
    icon: '⚖️'
  }, {
    title: t('nav.termsOfService'),
    path: '/docs/terms-of-service',
    icon: '📋'
  }, {
    title: t('nav.privacyPolicy'),
    path: '/docs/privacy',
    icon: '🔒'
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
      icon: '📝'
    },
    {
      title: t('nav.faq'),
      path: '/docs/faq',
      icon: '❓'
    },
    {
      title: t('nav.donate'),
      path: '/docs/donate',
      icon: '❤️'
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
  const toggleSubmenu = (itemTitle: string) => {
    setExpandedMenus(prev => ({
      ...prev,
      [itemTitle]: !prev[itemTitle]
    }));
  };
  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card/90 backdrop-blur-sm border-b border-border sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 h-16">
          {/* Mobile Layout */}
          <div className="flex items-center lg:hidden w-full">
            {/* Left: Hamburger Menu & Home */}
            <div className="flex items-center">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-md hover:bg-muted transition-colors">
                <Menu className="w-5 h-5 text-foreground" />
              </button>
              <a href="https://dehub.io/app" className="p-2 rounded-md hover:bg-muted transition-colors">
                <Home className="w-6 h-6 text-foreground" />
              </a>
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
            <Link to="/docs" className="flex items-center space-x-2 font-bold text-xl text-foreground">
              <img src="/lovable-uploads/bca432dc-7ef2-4a07-99b6-fac376265184.png" alt="DeHub Logo" className="w-6 h-6 dark:invert" />
            </Link>
            <a href="https://dehub.io/app" className="p-2 rounded-lg hover:bg-muted transition-colors" title="Go to DeHub App">
              <Home className="w-6 h-6 text-foreground" />
            </a>
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
        {/* Sidebar */}
        <aside className={`
          fixed lg:sticky lg:top-16 inset-y-0 lg:inset-y-auto left-0 z-30 w-64 h-screen lg:h-[calc(100vh-4rem)] bg-card/95 backdrop-blur-sm border-r border-border transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
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
              <div className="flex-shrink-0"><DarkModeToggle /></div>
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
                                  {item.isImage ? <img src={item.icon} alt={item.title} className={`w-4 h-4 ${item.title !== 'App' && item.title !== 'CoinGecko' && item.title !== 'Twitter' ? 'dark:invert' : ''} ${item.title === 'Twitter' ? 'invert dark:invert-0' : ''}`} /> : <span className="text-base">{item.icon}</span>}
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
                                            <Link to={subItem.path} onClick={closeSidebar} className={`
                                                flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200
                                                ${isActivePath(subItem.path) ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}
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
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-20 lg:hidden" onClick={closeSidebar} />}

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="max-w-4xl mx-auto px-6 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>;
};

export const DocsLayout = () => {
  return <DocsLayoutContent />;
};

