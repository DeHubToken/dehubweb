/**
 * CreatorPage — DeHub Creator Studio (/creator)
 * ============================================
 * Higgsfield-style AI studio hub. One place that surfaces every AI feature
 * on DeHub: image, edit, video, poster, characters, music, skills, voice,
 * translate/subtitles. Each tile is a promoted entry point that either
 * launches the Assistant with a preset prompt/action, opens a dedicated
 * modal on the Assistant, or navigates to a related feature page.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import {
  ImageIcon,
  Wand2,
  Video,
  Music2,
  Palette,
  UserSquare2,
  Brain,
  MessageSquare,
  Mic,
  Languages,
  Sparkles,
  ArrowUpRight,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ToolAction =
  | { kind: 'assistant'; preset?: 'image' | 'edit' | 'video' | 'song' | 'poster' | 'skills' | 'chat' | 'voice' }
  | { kind: 'navigate'; to: string };

interface Tool {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'Image' | 'Video' | 'Audio' | 'Brand' | 'Agents';
  test?: boolean;
  featured?: boolean;
  action: ToolAction;
}

const TOOLS: Tool[] = [
  {
    id: 'image',
    name: 'Image Generator',
    tagline: 'Text → photoreal image',
    description: 'GPT-image-2 & Nano Banana 2. Character references, style transfer, high fidelity.',
    icon: ImageIcon,
    category: 'Image',
    featured: true,
    action: { kind: 'assistant', preset: 'image' },
  },
  {
    id: 'poster',
    name: 'DeHub Poster Studio',
    tagline: 'Branded posters & social cards',
    description: '15 marketing archetypes, auto-brand rules, logo lockup composited pixel-perfect.',
    icon: Palette,
    category: 'Brand',
    featured: true,
    test: true,
    action: { kind: 'assistant', preset: 'poster' },
  },
  {
    id: 'video',
    name: 'Video Generator',
    tagline: 'Text → cinematic clip',
    description: 'Per-second billing, ref-image conditioning, up to 12s HD output.',
    icon: Video,
    category: 'Video',
    featured: true,
    action: { kind: 'assistant', preset: 'video' },
  },
  {
    id: 'edit',
    name: 'Image Editor',
    tagline: 'Edit any image with words',
    description: 'Upload a reference, describe the change, keep the composition — inpainting via Nano Banana.',
    icon: Wand2,
    category: 'Image',
    action: { kind: 'assistant', preset: 'edit' },
  },
  {
    id: 'song',
    name: 'Song Studio',
    tagline: 'Full tracks from a prompt',
    description: 'Genre, mood, vocals, lyrics. 30s previews, up to 3 minute masters.',
    icon: Music2,
    category: 'Audio',
    action: { kind: 'assistant', preset: 'song' },
  },
  {
    id: 'characters',
    name: 'Characters',
    tagline: 'Reference characters with @slug',
    description: 'Save personas, faces, style refs — mention them in any prompt for consistent results.',
    icon: UserSquare2,
    category: 'Image',
    action: { kind: 'navigate', to: '/app/settings?tab=characters' },
  },
  {
    id: 'skills',
    name: 'Skills Library',
    tagline: 'GPTs & Projects, DeHub-native',
    description: 'Reusable AI recipes: system prompts, refs, preferred model. Browse or ship your own.',
    icon: Brain,
    category: 'Agents',
    test: true,
    action: { kind: 'assistant', preset: 'skills' },
  },
  {
    id: 'chat',
    name: 'Chat Assistant',
    tagline: 'Universal DeHub AI',
    description: 'Search, swap, tip, post, launch — chat once, do anything on-chain and on-app.',
    icon: MessageSquare,
    category: 'Agents',
    action: { kind: 'assistant', preset: 'chat' },
  },
  {
    id: 'voice',
    name: 'Voice Assistant',
    tagline: 'Hands-free AI',
    description: 'Push-to-talk realtime voice with ambient noise cancel. Credits per minute.',
    icon: Mic,
    category: 'Audio',
    action: { kind: 'assistant', preset: 'voice' },
  },
  {
    id: 'subtitles',
    name: 'Video Subtitles & Translate',
    tagline: 'Auto CC in 110 languages',
    description: 'Transcribe any DeHub video, translate on demand, cached per language.',
    icon: Languages,
    category: 'Video',
    action: { kind: 'navigate', to: '/app/tv' },
  },
  {
    id: 'agents',
    name: 'AI Agents',
    tagline: 'Autonomous on-chain bots',
    description: 'Build agents with MCP tools, wallet permissions, and community deployment.',
    icon: Sparkles,
    category: 'Agents',
    action: { kind: 'navigate', to: '/app/agents' },
  },
  {
    id: 'editor',
    name: 'Video Editor',
    tagline: 'In-browser NLE',
    description: 'Multi-track timeline, canvas composite, WebCodecs export. Drop clips, cut, ship.',
    icon: Zap,
    category: 'Video',
    action: { kind: 'navigate', to: '/editor' },
  },
];

const CATEGORIES = ['All', 'Image', 'Video', 'Audio', 'Brand', 'Agents'] as const;

export default function CreatorPage() {
  const navigate = useNavigate();
  const [active, setActive] = useMemoState<typeof CATEGORIES[number]>('All');

  const featured = useMemo(() => TOOLS.filter(t => t.featured), []);
  const grid = useMemo(
    () => (active === 'All' ? TOOLS : TOOLS.filter(t => t.category === active)),
    [active]
  );

  const runAction = (t: Tool) => {
    if (t.action.kind === 'navigate') {
      navigate(t.action.to);
      return;
    }
    // Route to assistant with a preset hash the AssistantPage listens for.
    const preset = t.action.preset ?? 'chat';
    navigate(`/app/assistant#preset=${preset}`);
  };

  return (
    <>
      <SEOHead
        title="DeHub Creator Studio — AI Image, Video, Poster, Song & Agents"
        description="One studio for every DeHub AI tool: image generation, video, poster studio, song creation, characters, skills, voice, subtitles and autonomous agents."
        url="https://dehub.io/creator"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'DeHub Creator Studio',
          url: 'https://dehub.io/creator',
          applicationCategory: 'MultimediaApplication',
          operatingSystem: 'Web',
          description: 'AI-powered creator studio for image, video, audio, and brand asset generation on DeHub.',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        }}
      />

      <div className="min-h-screen w-full text-white">
        <h1 className="sr-only">DeHub Creator Studio</h1>

        {/* Hero */}
        <section className="relative overflow-hidden border-b border-white/5">
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.08),transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_60%,rgba(255,255,255,0.05),transparent_55%)]" />
            <div className="absolute inset-0 bg-black/40 backdrop-blur-3xl" />
          </div>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-widest text-white/70 mb-5">
              <Sparkles className="w-3 h-3" /> Creator Studio
            </div>
            <h2 className="text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.05] max-w-3xl">
              Every AI tool on DeHub,{' '}
              <span className="text-white/50">in one studio.</span>
            </h2>
            <p className="mt-4 text-base sm:text-lg text-white/60 max-w-2xl">
              Generate images, videos, posters, songs. Save characters and skills. Ship agents. All native. All on-chain-ready.
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {featured.map(t => (
                <LiquidGlassBubble2
                  key={t.id}
                  label={`${categoryEmoji(t.category)} ${t.name}`}
                  onClick={() => runAction(t)}
                  width="auto"
                  height="40px"
                  className="[&>div]:!px-4 [&_span]:!text-sm"
                />
              ))}
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-8">
          <div className="flex gap-1 rounded-2xl bg-white/5 border border-white/10 p-1 w-fit overflow-x-auto">
            {CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => setActive(c)}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap',
                  active === c ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </section>

        {/* Tool grid */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {grid.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => runAction(t)}
                  className="group text-left rounded-3xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] backdrop-blur-xl p-5 transition-all hover:border-white/20 relative overflow-hidden"
                >
                  {/* subtle top-right glow */}
                  <div className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full bg-white/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />

                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {t.test && (
                        <span className="text-[9px] font-bold tracking-wider bg-white text-black rounded px-1.5 py-[2px] leading-none">
                          TEST
                        </span>
                      )}
                      <ArrowUpRight className="w-4 h-4 text-white/40 group-hover:text-white transition-colors" />
                    </div>
                  </div>

                  <div className="text-xs uppercase tracking-widest text-white/40 mb-1">{t.category}</div>
                  <h3 className="text-lg font-semibold text-white mb-1">{t.name}</h3>
                  <p className="text-xs text-white/70 mb-2">{t.tagline}</p>
                  <p className="text-xs text-white/50 leading-relaxed">{t.description}</p>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

function categoryEmoji(c: Tool['category']): string {
  switch (c) {
    case 'Image': return '🖼️';
    case 'Video': return '🎥';
    case 'Audio': return '🎵';
    case 'Brand': return '🎨';
    case 'Agents': return '🧠';
  }
}

// Tiny local useState shim to avoid another import above.
function useMemoState<T>(initial: T): [T, (v: T) => void] {
  const [v, setV] = (require('react') as typeof import('react')).useState<T>(initial);
  return [v, setV];
}
