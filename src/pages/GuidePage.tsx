import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight, Lightbulb, Menu, X,
  Home, PenSquare, ThumbsUp, Search, User, MessageCircle,
  Bot, Bell, Wallet, Landmark, Trophy, LayoutDashboard,
  Vote, Bookmark, Settings, ArrowLeftRight, Music, Tv,
  BookOpen, ShoppingCart, LogIn
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

// Guide screenshots
import screenshotLanding from "@/assets/guide/landing.png";
import screenshotHomeFeed from "@/assets/guide/home-feed.png";
import screenshotExplore from "@/assets/guide/explore.png";
import screenshotMessages from "@/assets/guide/messages.png";
import screenshotAssistant from "@/assets/guide/assistant.png";
import screenshotNotifications from "@/assets/guide/notifications.png";
import screenshotLeaderboard from "@/assets/guide/leaderboard.png";
import screenshotBookmarks from "@/assets/guide/bookmarks.png";
import screenshotSettings from "@/assets/guide/settings.png";
import screenshotGovernance from "@/assets/guide/governance.png";
import screenshotCommandCentre from "@/assets/guide/command-centre.png";
import screenshotTv from "@/assets/guide/tv.png";
import { SEOHead } from "@/components/SEOHead";
import { ThemedIcon } from "@/components/app/war/WarHudIcon";
import { useFeedSwallowClip } from "@/hooks/use-feed-swallow-clip";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface GuideSection {
  id: string;
  title: string;
  icon: React.ElementType;
  intro: string;
  steps: string[];
  tips?: string[];
  screenshot?: string;
}

/** Copy lives in the locale files under guide.sections.<id>; steps and tips
 *  are numbered from 1, so the counts here must match en.json. */
interface GuideSectionDef {
  id: string;
  icon: React.ElementType;
  screenshot?: string;
  steps: number;
  tips?: number;
}

const sectionDefs: GuideSectionDef[] = [
  { id: "getting-started", icon: LogIn, screenshot: screenshotLanding, steps: 6, tips: 3 },
  { id: "home-feed", icon: Home, screenshot: screenshotHomeFeed, steps: 7, tips: 3 },
  { id: "creating-posts", icon: PenSquare, screenshot: screenshotHomeFeed, steps: 9, tips: 3 },
  { id: "interacting-with-posts", icon: ThumbsUp, screenshot: screenshotHomeFeed, steps: 8, tips: 3 },
  { id: "explore-search", icon: Search, screenshot: screenshotExplore, steps: 6, tips: 2 },
  { id: "profile", icon: User, screenshot: screenshotHomeFeed, steps: 7, tips: 2 },
  { id: "messages", icon: MessageCircle, screenshot: screenshotMessages, steps: 6, tips: 2 },
  { id: "ai-assistant", icon: Bot, screenshot: screenshotAssistant, steps: 6, tips: 3 },
  { id: "notifications", icon: Bell, screenshot: screenshotNotifications, steps: 5, tips: 2 },
  { id: "wallet", icon: Wallet, screenshot: screenshotCommandCentre, steps: 6, tips: 2 },
  { id: "staking", icon: Landmark, screenshot: screenshotCommandCentre, steps: 6, tips: 3 },
  { id: "leaderboard", icon: Trophy, screenshot: screenshotLeaderboard, steps: 7, tips: 2 },
  { id: "command-centre", icon: LayoutDashboard, screenshot: screenshotCommandCentre, steps: 4, tips: 1 },
  { id: "governance", icon: Vote, screenshot: screenshotGovernance, steps: 6, tips: 3 },
  { id: "bookmarks", icon: Bookmark, screenshot: screenshotBookmarks, steps: 4, tips: 2 },
  { id: "settings", icon: Settings, screenshot: screenshotSettings, steps: 5, tips: 2 },
  { id: "posting-allowance", icon: PenSquare, steps: 6, tips: 4 },
  { id: "reactions-and-safety", icon: ThumbsUp, steps: 6, tips: 3 },
  { id: "stages", icon: MessageCircle, steps: 6, tips: 4 },
  { id: "communities", icon: Landmark, steps: 5, tips: 2 },
  { id: "arcade", icon: Trophy, steps: 4, tips: 2 },
  { id: "bounties-stores", icon: ShoppingCart, steps: 5, tips: 3 },
  { id: "creator-studio", icon: PenSquare, steps: 5, tips: 3 },
  { id: "buying-dhb", icon: ShoppingCart, screenshot: screenshotCommandCentre, steps: 7, tips: 3 },
  { id: "bridge", icon: ArrowLeftRight, screenshot: screenshotCommandCentre, steps: 7, tips: 3 },
  { id: "music-tv", icon: Music, screenshot: screenshotTv, steps: 6, tips: 2 },
  { id: "post-info", icon: BookOpen, screenshot: screenshotHomeFeed, steps: 6, tips: 3 },
  { id: "buying-fractions", icon: ShoppingCart, screenshot: screenshotHomeFeed, steps: 7, tips: 3 },
  { id: "selling-fractions", icon: Landmark, screenshot: screenshotHomeFeed, steps: 7, tips: 3 },
  { id: "minting-posts", icon: PenSquare, screenshot: screenshotHomeFeed, steps: 6, tips: 4 },
  { id: "glossary", icon: BookOpen, steps: 4, tips: 2 },
];

const numbered = (n = 0) => Array.from({ length: n }, (_, i) => i + 1);

function buildSections(t: TFunction): GuideSection[] {
  return sectionDefs.map(d => {
    const base = `guide.sections.${d.id}`;
    return {
      id: d.id,
      icon: d.icon,
      screenshot: d.screenshot,
      title: t(`${base}.title`),
      intro: t(`${base}.intro`),
      steps: numbered(d.steps).map(i => t(`${base}.steps.${i}`)),
      tips: d.tips ? numbered(d.tips).map(i => t(`${base}.tips.${i}`)) : undefined,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Search utilities                                                   */
/* ------------------------------------------------------------------ */

/** Tokenize query into lowercase words for multi-term matching */
function tokenize(raw: string): string[] {
  return raw.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Score a section against search tokens. Higher = better match.
 *  Returns 0 if any token has no match (AND logic). */
function scoreSection(section: GuideSection, tokens: string[]): number {
  if (tokens.length === 0) return 1; // no filter

  const titleLower = section.title.toLowerCase();
  const introLower = section.intro.toLowerCase();
  const stepsLower = section.steps.map(s => s.toLowerCase());
  const tipsLower = (section.tips || []).map(t => t.toLowerCase());
  const allText = [titleLower, introLower, ...stepsLower, ...tipsLower];

  let total = 0;
  for (const token of tokens) {
    let tokenScore = 0;
    // Title match is worth 10x
    if (titleLower.includes(token)) tokenScore += 10;
    // Intro match worth 3x
    if (introLower.includes(token)) tokenScore += 3;
    // Steps/tips match worth 1x each
    for (const text of [...stepsLower, ...tipsLower]) {
      if (text.includes(token)) tokenScore += 1;
    }
    if (tokenScore === 0) return 0; // AND logic: every token must hit
    total += tokenScore;
  }
  return total;
}

/** Highlight matching tokens in text */
const HighlightText: React.FC<{ text: string; tokens: string[] }> = ({ text, tokens }) => {
  if (tokens.length === 0) return <>{text}</>;

  // Build a regex that matches any token
  const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-400/20 text-yellow-300 rounded-sm px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

const ScreenshotImage = ({ src, alt }: { src?: string; alt: string }) => {
  const { t } = useTranslation();
  if (!src) {
    return (
      <div className="w-full h-48 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center text-white/30 text-sm select-none mt-4">
        {t("guide.screenshotComingSoon")}
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-xl overflow-hidden border border-white/10">
      <img src={src} alt={alt} className="w-full h-auto" loading="lazy" />
    </div>
  );
};

const SectionCard = React.forwardRef<HTMLDivElement, { section: GuideSection; tokens: string[] }>(
  ({ section, tokens }, ref) => {
    const { t } = useTranslation();
    const Icon = section.icon;
    return (
      <div
        ref={ref}
        id={section.id}
        className="bg-white/5 backdrop-blur-[24px] border border-white/10 rounded-2xl p-6 md:p-8 scroll-mt-24"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-white">
            <HighlightText text={section.title} tokens={tokens} />
          </h2>
        </div>

        <p className="text-white/70 mb-6 leading-relaxed">
          <HighlightText text={section.intro} tokens={tokens} />
        </p>

        <div className="space-y-3 mb-6">
          {section.steps.map((step, i) => (
            <div key={i} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/60 mt-0.5">
                {i + 1}
              </span>
              <p className="text-white/80 text-sm leading-relaxed">
                <HighlightText text={step} tokens={tokens} />
              </p>
            </div>
          ))}
        </div>

        {section.tips && section.tips.length > 0 && (
          <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-semibold text-yellow-400">{t("guide.proTips")}</span>
            </div>
            <ul className="space-y-1.5">
              {section.tips.map((tip, i) => (
                <li key={i} className="text-sm text-white/60 flex gap-2">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-yellow-400/50" />
                  <span><HighlightText text={tip} tokens={tokens} /></span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ScreenshotImage src={section.screenshot} alt={t("guide.screenshotAlt", { title: section.title })} />
      </div>
    );
  }
);
SectionCard.displayName = "SectionCard";

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

const GuidePage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const sections = useMemo(() => buildSections(t), [t, i18n.language]);
  const [activeId, setActiveId] = useState(sectionDefs[0].id);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(searchQuery, 200);
  const tokens = useMemo(() => tokenize(debouncedQuery), [debouncedQuery]);

  // Swallow the guide content at the sticky header pill's top edge under the
  // glass themes, exactly like the home feed cuts at its nav pill.
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  // Filter & rank sections by search relevance
  const filteredSections = useMemo(() => {
    if (tokens.length === 0) return sections;
    return sections
      .map(s => ({ section: s, score: scoreSection(s, tokens) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.section);
  }, [tokens, sections]);

  // Keyboard shortcut: Cmd/Ctrl+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchQuery("");
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
    );

    filteredSections.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [filteredSections]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileNavOpen(false);
  };

  const isSearching = tokens.length > 0;

  return (
    <>
      <SEOHead
        title="DeHub Guide — Visual Walkthrough of the App"
        description="A visual walkthrough of DeHub: feeds, messaging, wallet, staking, governance and more. See every screen and learn how the decentralized social platform works."
        url="https://dehub.io/guide"
      />
    <div data-glass-page className="min-h-screen bg-black text-white">
      {/* Sticky nav pill */}
      <div data-feed-nav-outer className="sticky top-0 z-50 bg-black px-4 md:px-8 pt-2 pb-0 max-w-7xl mx-auto">
        <div data-page-bento className="bg-zinc-900 rounded-2xl px-3 md:px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <Link to="/app" className="flex items-center gap-2 text-white/70 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium hidden sm:inline">{t("guide.backToApp")}</span>
            </Link>
            <div className="text-lg font-bold hidden sm:block">{t("guide.headerTitle")}</div>

            {/* Search bar */}
            <div className="relative flex-1 max-w-xs mx-3 sm:mx-0 sm:flex-none sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("guide.searchPlaceholder")}
                className="w-full h-9 pl-9 pr-16 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.08] transition-all"
              />
              {searchQuery ? (
                <button
                  onClick={() => { setSearchQuery(""); searchInputRef.current?.focus(); }}
                  aria-label={t("guide.clearSearch")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              ) : (
                <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5 text-[10px] text-white/20 font-mono">
                  <span className="px-1 py-0.5 rounded bg-white/5 border border-white/10">⌘K</span>
                </kbd>
              )}
            </div>

            <button
              className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-white/5"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              aria-label={mobileNavOpen ? t("guide.closeNavigation") : t("guide.toggleNavigation")}
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-x-0 top-16 bottom-0 z-40 bg-black/95 backdrop-blur-xl overflow-y-auto p-4">
          <nav className="space-y-1">
            {filteredSections.map(s => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-colors ${
                    activeId === s.id ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {s.title}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      <div className="max-w-7xl mx-auto flex gap-8 px-4 md:px-8 py-8">
        {/* Desktop TOC sidebar */}
        <aside className="hidden md:block w-60 shrink-0">
          <nav className="sticky top-24 space-y-0.5 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2 scrollbar-thin">
            {filteredSections.map(s => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-left transition-all ${
                    activeId === s.id
                      ? "bg-white/10 text-white font-medium"
                      : "text-white/40 hover:text-white/70 hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{s.title}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main ref={contentRef} className="flex-1 min-w-0 space-y-6 pb-20">
          {/* Hero */}
          {!isSearching && (
            <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-2xl p-6 md:p-10 mb-2">
              <h1 className="text-3xl md:text-4xl font-bold mb-3">
                {t("guide.heroTitle")}
              </h1>
              <p className="text-white/60 text-lg leading-relaxed max-w-2xl">
                {t("guide.heroBody")}
              </p>
            </div>
          )}

          {/* Search results count */}
          {isSearching && (
            <div className="flex items-center gap-2 text-sm text-white/40 px-1">
              <Search className="w-3.5 h-3.5" />
              <span>
                {filteredSections.length === 0
                  ? t("guide.noResultsFor", { query: debouncedQuery })
                  : t("guide.sectionsMatching", { count: filteredSections.length, query: debouncedQuery })
                }
              </span>
              <button
                onClick={() => setSearchQuery("")}
                className="ml-auto text-white/30 hover:text-white/60 underline underline-offset-2 text-xs"
              >
                {t("guide.clearSearch")}
              </button>
            </div>
          )}

          {/* Empty state */}
          {isSearching && filteredSections.length === 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
              <ThemedIcon icon="search" alt="" className="w-14 h-14 object-contain mx-auto mb-4 opacity-55" />
              <p className="text-white/40 text-sm mb-2">{t("guide.noMatchingSections")}</p>
              <p className="text-white/20 text-xs">{t("guide.tryDifferentKeywords")}</p>
            </div>
          )}

          {filteredSections.map(s => (
            <SectionCard key={s.id} section={s} tokens={tokens} />
          ))}
        </main>
      </div>
    </div>
    </>
  );
};

export default GuidePage;
