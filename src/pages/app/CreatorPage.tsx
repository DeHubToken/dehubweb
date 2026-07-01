import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import dehubLogo from '@/assets/dehub-logo-white.png';
import showcaseImage from '@/assets/creator-studio-showcase.jpg';
import {
  ArrowUpRight,
  Blocks,
  Bot,
  Clapperboard,
  Crown,
  Film,
  ImageIcon,
  Languages,
  Megaphone,
  Mic2,
  Music2,
  PanelsTopLeft,
  PenTool,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Preset = 'image' | 'edit' | 'video' | 'song' | 'poster' | 'skills' | 'chat' | 'voice';
type ToolAction = { kind: 'assistant'; preset: Preset } | { kind: 'navigate'; to: string };

interface Tool {
  id: string;
  name: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'Image' | 'Video' | 'Audio' | 'Studio' | 'Agents';
  badge?: 'TEST' | 'NEW' | 'TRENDING';
  action: ToolAction;
}

const navItems = ['Explore', 'Image', 'Video', 'Audio', 'Studio', 'Marketing', 'Agents', 'Apps'] as const;
const categories = ['All', 'Image', 'Video', 'Audio', 'Studio', 'Agents'] as const;

const heroCards = [
  {
    id: 'poster-flow',
    title: 'DEHUB POSTER STUDIO',
    subtitle: 'Brand-safe campaign images from one prompt',
    kind: 'prompt',
    action: { kind: 'assistant', preset: 'poster' } satisfies ToolAction,
  },
  {
    id: 'video-timeline',
    title: 'CINEMA STUDIO',
    subtitle: 'Generate clips, cut scenes, export edits',
    kind: 'timeline',
    action: { kind: 'navigate', to: '/editor' } satisfies ToolAction,
  },
  {
    id: 'skill-library',
    title: 'SKILLS LIBRARY',
    subtitle: 'Reusable creative systems and brand brains',
    kind: 'poster',
    action: { kind: 'assistant', preset: 'skills' } satisfies ToolAction,
  },
  {
    id: 'agents',
    title: 'AI AGENTS',
    subtitle: 'Chat, create, publish, remix and automate',
    kind: 'mist',
    action: { kind: 'assistant', preset: 'chat' } satisfies ToolAction,
  },
];

const tools: Tool[] = [
  {
    id: 'poster',
    name: 'DeHub Poster',
    label: 'Brand',
    description: 'Campaign posters, launch assets and social posts with DeHub logo rules.',
    icon: Megaphone,
    category: 'Studio',
    badge: 'TEST',
    action: { kind: 'assistant', preset: 'poster' },
  },
  {
    id: 'image',
    name: 'Image Generator',
    label: 'Image',
    description: 'High-quality visuals, product scenes, thumbnails and references.',
    icon: ImageIcon,
    category: 'Image',
    action: { kind: 'assistant', preset: 'image' },
  },
  {
    id: 'video',
    name: 'Video Generator',
    label: 'Video',
    description: 'Cinematic clips from text, references and creator prompts.',
    icon: Film,
    category: 'Video',
    badge: 'NEW',
    action: { kind: 'assistant', preset: 'video' },
  },
  {
    id: 'skills',
    name: 'Skills',
    label: 'Agents',
    description: 'Save reusable prompts, models, assets and workflows.',
    icon: Blocks,
    category: 'Agents',
    badge: 'TEST',
    action: { kind: 'assistant', preset: 'skills' },
  },
  {
    id: 'edit',
    name: 'Image Edit',
    label: 'Image',
    description: 'Upload a shot, describe the change, preserve the intent.',
    icon: Wand2,
    category: 'Image',
    action: { kind: 'assistant', preset: 'edit' },
  },
  {
    id: 'song',
    name: 'Song Studio',
    label: 'Audio',
    description: 'Tracks, hooks, lyrics and production prompts in one flow.',
    icon: Music2,
    category: 'Audio',
    action: { kind: 'assistant', preset: 'song' },
  },
  {
    id: 'voice',
    name: 'Voice Assistant',
    label: 'Audio',
    description: 'Hands-free creation, search and publishing controls.',
    icon: Mic2,
    category: 'Audio',
    action: { kind: 'assistant', preset: 'voice' },
  },
  {
    id: 'chat',
    name: 'Creative Chat',
    label: 'Agents',
    description: 'Talk through concepts, captions, briefs and launch plans.',
    icon: Bot,
    category: 'Agents',
    action: { kind: 'assistant', preset: 'chat' },
  },
  {
    id: 'characters',
    name: 'Characters',
    label: 'Studio',
    description: 'Reference saved characters across image and video prompts.',
    icon: PenTool,
    category: 'Studio',
    action: { kind: 'navigate', to: '/app/settings?tab=characters' },
  },
  {
    id: 'subtitles',
    name: 'Subtitles',
    label: 'Video',
    description: 'Caption and translate videos across the full language stack.',
    icon: Languages,
    category: 'Video',
    action: { kind: 'navigate', to: '/app/tv' },
  },
  {
    id: 'editor',
    name: 'Video Editor',
    label: 'Studio',
    description: 'Timeline editing, layers, text, audio and browser export.',
    icon: Clapperboard,
    category: 'Video',
    action: { kind: 'navigate', to: '/editor' },
  },
  {
    id: 'automations',
    name: 'AI Agents',
    label: 'Agents',
    description: 'Autonomous creative workflows connected to DeHub actions.',
    icon: Sparkles,
    category: 'Agents',
    badge: 'TRENDING',
    action: { kind: 'navigate', to: '/app/agents' },
  },
];

export default function CreatorPage() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<typeof categories[number]>('All');
  const [activeNav, setActiveNav] = useState<typeof navItems[number]>('Explore');

  const visibleTools = useMemo(
    () => activeCategory === 'All' ? tools : tools.filter(tool => tool.category === activeCategory),
    [activeCategory]
  );

  const runAction = (action: ToolAction) => {
    if (action.kind === 'navigate') {
      navigate(action.to);
      return;
    }

    navigate(`/app/assistant#preset=${action.preset}`);
  };

  return (
    <>
      <SEOHead
        title="DeHub Creator Studio — AI Creative Tools"
        description="DeHub Creator Studio brings image, video, posters, music, skills, characters and AI agents into one native creative landing page."
        url="https://dehub.io/creator"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'DeHub Creator Studio',
          url: 'https://dehub.io/creator',
          applicationCategory: 'MultimediaApplication',
          operatingSystem: 'Web',
          description: 'Native AI creator studio for DeHub image, video, music, posters, skills and agents.',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        }}
      />

      <main className="min-h-screen bg-[#090a0b] text-white overflow-x-hidden">
        <h1 className="sr-only">DeHub Creator Studio</h1>

        <div className="sticky top-0 z-50">
          <div className="relative flex h-8 items-center justify-center bg-[#d7ff00] px-10 text-center text-[12px] font-black uppercase tracking-[0.08em] text-black">
            <span>Launch creative campaigns faster with DeHub AI tools</span>
            <span className="ml-2 hidden rounded px-2 py-0.5 text-[10px] font-black italic text-white sm:inline-flex bg-[#ff2c91]">TEST STUDIO</span>
            <button
              type="button"
              onClick={() => navigate('/app')}
              aria-label="Close creator banner"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-black/80 hover:text-black"
            >
              ×
            </button>
          </div>

          <header className="border-b border-white/8 bg-[#090a0b]/95 px-3 py-3 backdrop-blur-xl sm:px-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/app')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-black"
                aria-label="Open DeHub app"
              >
                <img src={dehubLogo} alt="DeHub" className="h-5 w-5 object-contain invert" />
              </button>

              <nav className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {navItems.map((item, index) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setActiveNav(item);
                      if (item !== 'Explore') {
                        const match = categories.find(category => category === item);
                        if (match) setActiveCategory(match);
                      }
                    }}
                    className={cn(
                      'relative shrink-0 text-[14px] font-medium tracking-wide transition-colors',
                      activeNav === item ? 'text-[#d7ff00]' : 'text-white/55 hover:text-white'
                    )}
                  >
                    {index === 4 && <span className="mr-2 text-white/40">••</span>}
                    {item}
                    {(item === 'Studio' || item === 'Agents') && (
                      <span className="ml-1 rounded bg-[#d7ff00] px-1.5 py-0.5 text-[9px] font-black uppercase leading-none text-black">New</span>
                    )}
                  </button>
                ))}
              </nav>

              <div className="hidden items-center gap-2 sm:flex">
                <button
                  type="button"
                  onClick={() => navigate('/premium')}
                  className="relative rounded-lg bg-white/8 px-4 py-2 text-sm font-semibold text-white hover:bg-white/12"
                >
                  Pricing
                  <span className="absolute -bottom-2 left-4 rounded bg-[#ff2c91] px-1.5 py-0.5 text-[9px] font-black leading-none text-white">30% OFF</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/app')}
                  className="rounded-lg bg-white/8 px-4 py-2 text-sm font-semibold text-[#d7ff00] hover:bg-white/12"
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/app')}
                  className="rounded-lg bg-[#d7ff00] px-4 py-2 text-sm font-bold text-black hover:brightness-95"
                >
                  Sign up
                </button>
              </div>
            </div>
          </header>
        </div>

        <section className="px-3 py-4 sm:px-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {heroCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => runAction(card.action)}
                className="group overflow-hidden rounded-lg text-left"
              >
                <MediaCardVisual kind={card.kind} />
                <div className="pt-3">
                  <h2 className="text-sm font-black uppercase leading-tight text-white">{card.title}</h2>
                  <p className="mt-1 truncate text-sm text-white/45">{card.subtitle}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-3 px-3 pb-6 sm:px-4 lg:grid-cols-[0.38fr_1fr]">
          <button
            type="button"
            onClick={() => runAction({ kind: 'assistant', preset: 'poster' })}
            className="relative min-h-[264px] overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.24),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03)_50%,rgba(215,255,0,0.22))] p-4 text-left shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          >
            <span className="inline-flex rounded bg-[#ff2c91] px-2 py-1 text-[10px] font-black italic text-white">TEST STUDIO</span>
            <div className="mt-7 max-w-[300px] text-3xl font-black uppercase leading-[1.02] tracking-tight text-white sm:text-4xl">
              Make every launch look expensive
            </div>
            <p className="mt-4 max-w-[270px] text-sm text-white/70">Posters, promos, thumbnails and launch cards using the DeHub brand system.</p>
            <div className="absolute bottom-4 left-4 rounded-xl bg-white px-6 py-3 text-sm font-black text-black">Make DeHub Poster</div>
            <div className="absolute bottom-6 right-4 h-36 w-32 rotate-6 rounded-xl border border-white/20 bg-black/70 p-3 shadow-2xl">
              <div className="mb-3 h-3 w-16 rounded-full bg-[#d7ff00]" />
              <div className="h-16 rounded-lg bg-white/15" />
              <div className="mt-3 h-2 w-full rounded-full bg-white/30" />
              <div className="mt-2 h-2 w-2/3 rounded-full bg-white/20" />
            </div>
          </button>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => runAction(tool.action)}
                  className="group relative min-h-[128px] rounded-2xl border border-white/8 bg-[#1b1c1f] p-5 text-left transition-colors hover:bg-[#222327]"
                >
                  {tool.badge && (
                    <span className={cn(
                      'absolute right-3 top-3 rounded px-1.5 py-0.5 text-[9px] font-black uppercase italic leading-none',
                      tool.badge === 'TEST' ? 'bg-white text-black' : tool.badge === 'TRENDING' ? 'bg-[#ff2c91] text-white' : 'bg-[#d7ff00] text-black'
                    )}>
                      {tool.badge}
                    </span>
                  )}
                  <div className="mb-6 flex items-center gap-3">
                    <Icon className="h-6 w-6 text-white/85" />
                    <span className="rounded-full bg-white/8 px-2 py-1 text-xs text-white/60">{tool.label}</span>
                  </div>
                  <div className="pr-8">
                    <h3 className="text-lg font-black text-white">{tool.name}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/45">{tool.description}</p>
                  </div>
                  <ArrowUpRight className="absolute bottom-4 right-4 h-4 w-4 text-white/30 transition-colors group-hover:text-white" />
                </button>
              );
            })}
          </div>
        </section>

        <section className="px-3 pb-4 sm:px-4">
          <div className="mb-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={cn(
                  'shrink-0 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors',
                  activeCategory === category ? 'bg-white text-black' : 'bg-white/8 text-white/55 hover:text-white'
                )}
              >
                {category}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => navigate('/editor')}
            className="group relative block w-full overflow-hidden rounded-[28px] border border-white/10 bg-black text-left shadow-[0_-20px_80px_rgba(255,255,255,0.05)]"
          >
            <img
              src={showcaseImage}
              alt="DeHub creator studio interface inside a laptop display"
              width={1920}
              height={1080}
              className="h-[420px] w-full object-cover object-center opacity-90 transition-transform duration-500 group-hover:scale-[1.015] sm:h-[560px] lg:h-[680px]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
            <div className="absolute left-5 top-5 rounded bg-[#d7ff00] px-4 py-2 text-4xl font-black italic leading-none text-black sm:right-8 sm:left-auto sm:text-6xl">4K</div>
            <div className="absolute bottom-6 left-5 max-w-3xl sm:bottom-10 sm:left-8">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white/80 backdrop-blur-xl">
                <PanelsTopLeft className="h-4 w-4" /> Creator workspace
              </div>
              <p className="text-5xl font-black uppercase leading-[0.92] tracking-tight text-white sm:text-7xl lg:text-8xl">
                One studio for every creative drop
              </p>
            </div>
          </button>
        </section>

        <section className="grid gap-3 px-3 pb-10 sm:px-4 lg:grid-cols-3">
          <FeatureStrip icon={Crown} title="Premium campaigns" copy="Poster, video, image and audio assets built around the same idea." />
          <FeatureStrip icon={Sparkles} title="Creator memory" copy="Characters, skills and brand rules stay available across prompts." />
          <FeatureStrip icon={ArrowUpRight} title="Connected to DeHub" copy="Jump from a tool into assistant, editor, TV, agents or settings." />
        </section>
      </main>
    </>
  );
}

function MediaCardVisual({ kind }: { kind: string }) {
  if (kind === 'timeline') {
    return (
      <div className="relative h-[288px] overflow-hidden rounded-lg bg-[#f7f7f2] p-4 text-black">
        <div className="h-36 rounded-lg bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.8),transparent_18%),linear-gradient(135deg,#171717,#5d5246_45%,#161616)]" />
        <div className="mt-3 grid h-24 grid-cols-12 gap-px overflow-hidden rounded bg-black/5">
          {Array.from({ length: 48 }).map((_, i) => <span key={i} className="bg-black/[0.045]" />)}
        </div>
        <div className="absolute bottom-10 left-1/2 w-56 -translate-x-1/2 rounded-xl bg-white/60 p-4 shadow-xl backdrop-blur-xl">
          <div className="mb-3 h-2 w-28 rounded-full bg-black/20" />
          <div className="flex items-center justify-between">
            <span className="h-5 w-5 rounded bg-black/10" />
            <span className="h-6 w-6 rounded-full bg-[#ff6b3d]" />
          </div>
        </div>
      </div>
    );
  }

  if (kind === 'poster') {
    return (
      <div className="relative h-[288px] overflow-hidden rounded-lg bg-[linear-gradient(135deg,#171717,#3a3a3a_42%,#101010)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.26),transparent_28%)]" />
        <div className="absolute bottom-10 left-10 text-[46px] font-black uppercase leading-none tracking-tighter text-white/90">Creator<br />Drop</div>
        <div className="absolute right-6 top-8 rounded bg-[#d7ff00] px-2 py-1 text-xl font-black text-black">4K</div>
      </div>
    );
  }

  if (kind === 'mist') {
    return (
      <div className="relative h-[288px] overflow-hidden rounded-lg bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_28%),linear-gradient(135deg,#b6c1c8,#1d2327_48%,#020303)]">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-black to-transparent" />
        <img src={dehubLogo} alt="DeHub" className="absolute bottom-12 left-10 h-12 w-auto opacity-90" />
      </div>
    );
  }

  return (
    <div className="relative h-[288px] overflow-hidden rounded-lg bg-[radial-gradient(circle_at_35%_20%,rgba(255,255,255,0.6),transparent_24%),linear-gradient(135deg,#e9e6df,#777_45%,#111)]">
      <div className="absolute inset-0 bg-gradient-to-r from-black/15 via-transparent to-black/70" />
      <div className="absolute bottom-11 left-1/2 w-[245px] -translate-x-1/2 rounded-2xl border border-white/20 bg-black/55 p-4 shadow-2xl backdrop-blur-xl">
        <div className="mb-4 h-2 w-32 rounded-full bg-white/80" />
        <div className="flex items-center justify-between">
          <span className="text-lg font-light text-white">＋</span>
          <span className="text-[10px] font-semibold text-white/70">DeHub AI</span>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#d7ff00] text-xs font-black text-black">↑</span>
        </div>
      </div>
    </div>
  );
}

function FeatureStrip({ icon: Icon, title, copy }: { icon: React.ComponentType<{ className?: string }>; title: string; copy: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#1b1c1f] p-5">
      <Icon className="mb-5 h-6 w-6 text-white" />
      <h3 className="text-lg font-black text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/45">{copy}</p>
    </div>
  );
}