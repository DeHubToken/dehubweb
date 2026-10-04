import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { SEOHead } from '@/components/SEOHead';
import { PricingSection } from '@/components/pricing/PricingSection';
import { SubscriptionCreditsPill } from '@/components/app/credits/SubscriptionCreditsWidget';
import { CreatorStudio } from '@/components/app/creator/studio/CreatorStudio';
import { ModelMarquee } from '@/components/app/creator/ModelMarquee';
import dehubIcon from '@/assets/dehub-logo-compact.png';
import {
  ArrowUpRight,
  Blocks,
  Bot,
  Clapperboard,
  Film,
  ImageIcon,
  Megaphone,
  Mic2,
  Music2,
  PanelsTopLeft,
  PenTool,
  Sparkles,
  Wand2,
  Workflow,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CreatorBento, CreatorHeroWall, MediumDoors, loadCreatorGallery, thumbUrl, type GalleryItem } from '@/components/app/creator/CreatorStage';

const accent = '#e5e7eb';
const hot = '#ff2c91';
// Metallic liquid glass surface — replaces the old lime green accent for backgrounds
const metallicBg =
  'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(228,228,231,0.85) 22%, rgba(161,161,170,0.75) 50%, rgba(212,212,216,0.85) 78%, rgba(255,255,255,0.92) 100%)';
const metallicStyle: React.CSSProperties = {
  backgroundImage: metallicBg,
  backgroundColor: 'rgba(228,228,231,0.6)',
  backdropFilter: 'blur(14px) saturate(160%)',
  WebkitBackdropFilter: 'blur(14px) saturate(160%)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.12), 0 4px 18px rgba(0,0,0,0.35)',
};

type Preset = 'image' | 'edit' | 'video' | 'song' | 'poster' | 'skills' | 'chat' | 'voice';
type ToolAction = { kind: 'assistant'; preset: Preset } | { kind: 'navigate'; to: string };

interface Tool {
  id: string;
  nameKey: string;
  labelKey: string;
  descriptionKey: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'Image' | 'Video' | 'Audio' | 'Studio' | 'Agents';
  badge?: 'TRENDING' | 'NEW';
  action: ToolAction;
}

const navItems = ['Explore', 'Image', 'Video', 'Audio', 'Studio', 'Marketing', 'Agents', 'Apps'] as const;
const categories = ['All', 'Image', 'Video', 'Audio', 'Studio', 'Agents'] as const;

/*
 * The nav and category values double as filter keys — `activeCategory === category`
 * decides which tools render — so they stay English and are translated only at
 * the point they are drawn.
 */
const NAV_KEYS: Record<string, string> = {
  Explore: 'creator.navExplore',
  Image: 'creator.navImage',
  Video: 'creator.navVideo',
  Audio: 'creator.navAudio',
  Studio: 'creator.navStudio',
  Marketing: 'creator.navMarketing',
  Agents: 'creator.navAgents',
  Apps: 'creator.navApps',
  All: 'creator.navAll',
};

const tools: Tool[] = [
  {
    id: 'builder',
    nameKey: 'creator.toolBuilder',
    labelKey: 'creator.navApps',
    descriptionKey: 'creator.toolBuilderDesc',
    icon: PanelsTopLeft,
    category: 'Studio',
    action: { kind: 'navigate', to: '/builder' },
  },
  {
    id: 'poster',
    nameKey: 'creator.toolPoster',
    labelKey: 'creator.labelBrand',
    descriptionKey: 'creator.toolPosterDesc',
    icon: Megaphone,
    category: 'Studio',
    action: { kind: 'assistant', preset: 'poster' },
  },
  {
    id: 'image',
    nameKey: 'creator.toolImageGenerator',
    labelKey: 'creator.navImage',
    descriptionKey: 'creator.toolImageGeneratorDesc',
    icon: ImageIcon,
    category: 'Image',
    action: { kind: 'assistant', preset: 'image' },
  },
  {
    id: 'video',
    nameKey: 'creator.toolVideoGenerator',
    labelKey: 'creator.navVideo',
    descriptionKey: 'creator.toolVideoGeneratorDesc',
    icon: Film,
    category: 'Video',
    action: { kind: 'assistant', preset: 'video' },
  },
  {
    id: 'skills',
    nameKey: 'creator.toolSkills',
    labelKey: 'creator.navAgents',
    descriptionKey: 'creator.toolSkillsDesc',
    icon: Blocks,
    category: 'Agents',
    action: { kind: 'assistant', preset: 'skills' },
  },
  {
    id: 'edit',
    nameKey: 'creator.toolImageEdit',
    labelKey: 'creator.navImage',
    descriptionKey: 'creator.toolImageEditDesc',
    icon: Wand2,
    category: 'Image',
    action: { kind: 'assistant', preset: 'edit' },
  },
  {
    id: 'song',
    nameKey: 'creator.toolSongStudio',
    labelKey: 'creator.navAudio',
    descriptionKey: 'creator.toolSongStudioDesc',
    icon: Music2,
    category: 'Audio',
    action: { kind: 'assistant', preset: 'song' },
  },
  {
    id: 'voice',
    nameKey: 'creator.toolVoiceAssistant',
    labelKey: 'creator.navAudio',
    descriptionKey: 'creator.toolVoiceAssistantDesc',
    icon: Mic2,
    category: 'Audio',
    action: { kind: 'assistant', preset: 'voice' },
  },
  {
    id: 'chat',
    nameKey: 'creator.toolCreativeChat',
    labelKey: 'creator.navAgents',
    descriptionKey: 'creator.toolCreativeChatDesc',
    icon: Bot,
    category: 'Agents',
    action: { kind: 'assistant', preset: 'chat' },
  },
  {
    id: 'characters',
    nameKey: 'creator.toolCharacters',
    labelKey: 'creator.navStudio',
    descriptionKey: 'creator.toolCharactersDesc',
    icon: PenTool,
    category: 'Studio',
    action: { kind: 'navigate', to: '/app/settings?tab=characters' },
  },

  {
    id: 'editor',
    nameKey: 'creator.toolVideoEditor',
    labelKey: 'creator.navStudio',
    descriptionKey: 'creator.toolVideoEditorDesc',
    icon: Clapperboard,
    category: 'Video',
    action: { kind: 'navigate', to: '/editor' },
  },
  {
    id: 'automations',
    nameKey: 'creator.toolAgentFlows',
    labelKey: 'creator.navAgents',
    descriptionKey: 'creator.toolAgentFlowsDesc',
    icon: Sparkles,
    category: 'Agents',
    badge: 'TRENDING',
    action: { kind: 'navigate', to: '/app/agents' },
  },
  {
    id: 'flow',
    nameKey: 'creator.toolFlow',
    labelKey: 'creator.navStudio',
    descriptionKey: 'creator.toolFlowDesc',
    icon: Workflow,
    category: 'Studio',
    badge: 'NEW',
    action: { kind: 'navigate', to: '/creator/flow' },
  },
];

export default function CreatorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, openLoginModal } = useAuth();
  const [activeCategory, setActiveCategory] = useState<typeof categories[number]>('All');
  const [activeNav, setActiveNav] = useState<typeof navItems[number]>('Explore');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  /**
   * The studio composer parks directly under this header once it scrolls past,
   * so it needs the header's live height — dismissing the promo banner changes
   * it by 32px, and a hard-coded offset would leave a gap or a clipped bar.
   */
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(60);

  const openEditor = useCallback(() => navigate('/editor'), [navigate]);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderHeight(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visibleTools = useMemo(
    () => activeCategory === 'All' ? tools : tools.filter(tool => tool.category === activeCategory),
    [activeCategory]
  );

  const runAction = (action: ToolAction) => {
    if (action.kind === 'navigate') {
      const url = action.to;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        navigate(url);
      }
      return;
    }

    navigate(`/app/assistant#preset=${action.preset}`);
  };

  const pickNavigation = (item: typeof navItems[number]) => {
    setActiveNav(item);
    if (item === 'Image' || item === 'Video' || item === 'Audio') {
      setActiveCategory(item);
      window.dispatchEvent(new CustomEvent('creator:mode', { detail: item.toLowerCase() }));
    } else if (item === 'Explore') {
      setActiveCategory('All');
      document.querySelector('[data-creator-composer]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (item === 'Apps') navigate('/builder');
    else if (item === 'Agents') navigate('/app/agents');
    else if (item === 'Marketing') {
      setActiveCategory('Image');
      window.dispatchEvent(new CustomEvent('creator:preset', { detail: 'ad-headline' }));
    }
    else {
      setActiveCategory('Studio');
      document.querySelector('[data-creator-tools]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <>
      {/* Page metadata lives in CreatorEditorHost: /creator and /editor stay
          co-mounted, so a Helmet here would keep applying while this page is
          hidden and would overwrite the editor's title. */}
      {/* overflow-x-CLIP, not hidden. `hidden` on one axis computes the other
          from `visible` to `auto`, which quietly made this element a scroll
          container — one that never scrolls, because the page scrolls on
          `body`. Every `position: sticky` inside then had no scrollport to
          react to and simply rode the content off the top of the screen, the
          header included. `clip` contains the same horizontal overflow while
          leaving overflow-y `visible`, so sticky resolves against `body`. */}
      {/* relative z-[1]: the theme canvases (Hazy, Cosmic, ...) are fixed
          layers at z-0, so a static <main> painted UNDER them and every
          unpositioned heading and label vanished, leaving big empty gaps.
          data-glass-page lets the canvas through on those themes. */}
      <main data-creator-page data-glass-page className="relative z-[1] min-h-screen overflow-x-clip text-white" style={{ backgroundColor: '#090a0b' }}>
        <h1 className="sr-only">{t('creator.srHeading')}</h1>

        <div ref={headerRef} className="sticky top-0 z-50">
        {!bannerDismissed && (
          <div className="relative flex h-8 items-center justify-center px-10 text-center text-[12px] font-black uppercase tracking-[0.08em] text-black" style={metallicStyle}>
            <span>{t('creator.bannerCopy')}</span>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              aria-label={t('creator.closeBanner')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-black/80 hover:text-black"
            >
              ×
            </button>
          </div>
        )}

          <header data-clear-top-bar className="border-b border-white/10 px-3 py-3 backdrop-blur-xl sm:px-4" style={{ backgroundColor: 'rgba(9,10,11,0.95)' }}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/app')}
                className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] hover:bg-white/[0.10]"
                aria-label={t('creator.openApp')}
              >
                <div
                  className="h-5 w-5 bg-cover bg-center bg-no-repeat transition-transform duration-200 group-hover:scale-105"
                  style={{
                    backgroundImage: metallicBg,
                    maskImage: `url(${dehubIcon})`,
                    WebkitMaskImage: `url(${dehubIcon})`,
                    maskSize: 'contain',
                    WebkitMaskSize: 'contain',
                    maskRepeat: 'no-repeat',
                    WebkitMaskRepeat: 'no-repeat',
                    maskPosition: 'center',
                    WebkitMaskPosition: 'center',
                  }}
                />
              </button>

              <nav className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {navItems.map((item, index) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => pickNavigation(item)}
                    aria-pressed={activeNav === item}
                    className={cn(
                      'relative shrink-0 inline-flex items-start gap-1 text-[14px] font-medium tracking-wide transition-colors',
                      activeNav === item ? '' : 'text-white/55 hover:text-white'
                    )}
                    style={activeNav === item ? { color: accent } : undefined}
                  >
                    {index === 4 && <span className="mr-2 text-white/40">••</span>}
                    {t(NAV_KEYS[item])}
                  </button>
                ))}
              </nav>

              {isAuthenticated && (
                // Subscription tokens: the balance AI generation here is paid from.
                <SubscriptionCreditsPill />
              )}
              <div className="hidden items-center gap-2 sm:flex">
                <button
                  type="button"
                  onClick={() => navigate('/premium')}
                  className="relative rounded-lg bg-white/[0.08] px-4 py-2 text-sm font-semibold text-white hover:bg-white/[0.12]"
                >
                  {t('creator.pricing')}
                  <span className="absolute -bottom-2 left-4 rounded px-1.5 py-0.5 text-[9px] font-black leading-none text-white" style={{ backgroundColor: hot }}>{t('creator.thirtyOff')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/editor')}
                  className="rounded-lg bg-white/[0.08] px-4 py-2 text-sm font-semibold text-white hover:bg-white/[0.12]"
                >
                  {t('creator.editor')}
                </button>
                {/* Signed-in people get here from the app, so no "My account" /
                    "Open app" buttons; the logo still goes back to /app. */}
                {!isAuthenticated && (
                  <>
                    <button
                      type="button"
                      onClick={() => openLoginModal()}
                      className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15"
                      style={{ color: accent }}
                    >
                      {t('creator.login')}
                    </button>
                    <button
                      type="button"
                      onClick={() => openLoginModal()}
                      className="rounded-lg px-4 py-2 text-sm font-bold text-black hover:brightness-95"
                      style={metallicStyle}
                    >
                      {t('creator.signUp')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </header>
        </div>

        {/* The hero's wall of community work sits behind the studio's headline and composer. */}
        <CreatorHeroWall />
        <CreatorStudio onOpenEditor={openEditor} stickyTop={headerHeight} />
        <div>
        <MediumDoors />

        <div style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 520px' }}>
          <CommunityGallery />
        </div>

        <CreatorBento />

        <section className="px-3 pb-4 sm:px-4">
          <ModelMarquee />
        </section>

        <div data-creator-tools className="scroll-mt-28">
        <section className="px-3 pb-6 sm:px-4">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-exo text-[22px] font-black tracking-tight text-white sm:text-[28px]">{t('creator.moreTools')}</h2>
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  aria-pressed={activeCategory === category}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors backdrop-blur-xl',
                    activeCategory === category ? 'border-white/70 bg-white/20 text-white' : 'border-white/12 bg-white/[0.06] text-white/60 hover:text-white'
                  )}
                >
                  {t(NAV_KEYS[category])}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">

            {visibleTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => runAction(tool.action)}
                  className="group relative min-h-[128px] rounded-[22px] border border-white/12 bg-white/[0.06] p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-2xl backdrop-saturate-150 transition hover:-translate-y-0.5 hover:bg-white/[0.1]"
                >
                  {tool.badge && (
                    <span
                      className="absolute right-3 top-3 rounded px-1.5 py-0.5 text-[9px] font-black uppercase italic leading-none text-white"
                      style={{ backgroundColor: hot }}
                    >
                      {tool.badge}
                    </span>
                  )}
                  <div className="mb-6 flex items-center gap-3">
                    <Icon className="h-6 w-6 text-white/[0.85]" />
                    <span className="rounded-full bg-white/[0.08] px-2 py-1 text-xs text-white/60">{t(tool.labelKey)}</span>
                  </div>
                  <div className="pr-8">
                    <h3 className="text-lg font-black text-white">{t(tool.nameKey)}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/45">{t(tool.descriptionKey)}</p>
                  </div>
                  <ArrowUpRight className="absolute bottom-4 right-4 h-4 w-4 text-white/30 transition-colors group-hover:text-white" />
                </button>
              );
            })}
          </div>
        </section>
        </div>

        <div style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 600px' }}>
          <PricingSection />
        </div>

        </div>
      </main>
    </>
  );
}

const PAGE_SIZE = 18;

// Match the grid breakpoints on the gallery (2 / sm:3 / md:4 / lg:6 columns).
function getGalleryColumns(): number {
  if (typeof window === 'undefined') return 4;
  const w = window.innerWidth;
  if (w >= 1024) return 6;
  if (w >= 768) return 4;
  if (w >= 640) return 3;
  return 2;
}

const GalleryTile = memo(function GalleryTile({ item, onOpen }: { item: GalleryItem; onOpen: (i: GalleryItem) => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement | null>(null);
  const [visible, setVisible] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = !!item.video_url;
  const url = item.video_url || item.image_url || '';

  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisible(true);
      } else {
        videoRef.current?.pause();
      }
    }, { rootMargin: '300px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onOpen(item)}
      className="group relative block aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/5"
    >
      {visible && (isVideo ? (
        <video
          ref={videoRef}
          src={`${url}#t=0.1`}
          muted
          loop
          onMouseEnter={event => void event.currentTarget.play().catch(() => {})}
          onMouseLeave={event => event.currentTarget.pause()}
          playsInline
          preload="metadata"
          className="h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <img
          src={thumbUrl(url, 400)}
          alt={t('creator.aiGenerationCommunityAlt')}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-105"
        />
      ))}
      {isVideo && (
        <span data-keep-dark className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-black uppercase text-white backdrop-blur">
          Video
        </span>
      )}
    </button>
  );
});

const CommunityGallery = memo(function CommunityGallery() {
  const { t } = useTranslation();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(() => Math.ceil(getGalleryColumns() * 1.5));
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  // Defer RPC until the section is close to viewport → keeps LCP fast.
  useEffect(() => {
    if (!sectionRef.current || inView) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setInView(true);
        io.disconnect();
      }
    }, { rootMargin: '600px' });
    io.observe(sectionRef.current);
    return () => io.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView || loaded) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await loadCreatorGallery();
        if (cancelled) return;
        setItems(data);
      } finally {
        if (!cancelled) { setLoading(false); setLoaded(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [inView, loaded]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    const releaseScroll = lockBodyScroll('CreatorPage');
    return () => { window.removeEventListener('keydown', onKey); releaseScroll(); };
  }, [lightbox]);

  const shown = items.slice(0, visibleCount);

  return (
    <section ref={sectionRef} className="px-3 pb-10 sm:px-4">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">{t('creator.communityFeed')}</div>
          <h2 className="mt-1 font-exo text-[22px] font-black tracking-tight text-white sm:text-[28px]">
            {t('creator.madeOnDehub')}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-white/50">
            {t('creator.userCreationsCopy')}
          </p>
        </div>
        <span className="hidden shrink-0 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase text-black sm:inline-flex" style={metallicStyle}>
          {t('creator.live')}
        </span>
      </div>

      {!inView || loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: Math.ceil(getGalleryColumns() * 1.5) }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[22px] border border-white/12 bg-white/[0.06] p-10 text-center text-sm text-white/50 backdrop-blur-2xl">
          {t('creator.noCreationsYet')}
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {shown.map((item) => (
              <GalleryTile key={item.id} item={item} onOpen={setLightbox} />
            ))}
          </div>
          {visibleCount < items.length && (
            <button
              type="button"
              onClick={() => setVisibleCount((count) => Math.min(count + PAGE_SIZE, items.length))}
              className="mx-auto mt-4 block rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-white/75 hover:bg-white/10 hover:text-white"
            >
              {t('common.loadMore')}
            </button>
          )}
        </div>
      )}



      {/* Keep the viewer above page containment and the sticky composer. */}
      {lightbox && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            aria-label={t('creator.close')}
            data-keep-dark
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-xs font-bold uppercase text-white hover:bg-white/10"
          >
            {t('creator.close')}
          </button>
          <div className="max-h-[92vh] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
            {lightbox.video_url ? (
              <video
                src={lightbox.video_url}
                controls
                autoPlay
                loop
                playsInline
                className="max-h-[92vh] max-w-[92vw] rounded-xl"
              />
            ) : (
              <img
                src={lightbox.image_url || ''}
                alt={t('creator.aiGenerationAlt')}
                className="max-h-[92vh] max-w-[92vw] rounded-xl object-contain"
              />
            )}
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
});
