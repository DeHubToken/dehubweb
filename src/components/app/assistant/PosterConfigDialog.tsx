/**
 * PosterConfigDialog
 * ==================
 * Pre-generation config drawer for DeHub-branded posters.
 * Lets users pick dimensions, style archetype, DeHub roadmap features to spotlight,
 * link inclusions, and tagline — all auto-populated from their prompt where possible.
 * Keeps Exo typography + DeHub branding locked in on the backend prompt.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { cn } from '@/lib/utils';

export type LogoVariant = 'primary' | 'icon' | 'both';

export interface PosterConfig {
  dimension: 'square' | 'portrait' | 'landscape' | 'story';
  style: string;
  features: string[];
  tagline: string;
  includeSocials: boolean;
  includeWebsite: boolean;
  extraNotes: string;
  logoVariant: LogoVariant;
  finalPrompt: string;
}

interface PosterConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userPrompt: string;
  onConfirm: (config: PosterConfig) => void;
}

// ─── Dimension presets ───
const DIMENSIONS: { value: PosterConfig['dimension']; label: string; hint: string; icon: string }[] = [
  { value: 'square', label: 'Square', hint: '1:1 · IG post', icon: '⬛' },
  { value: 'portrait', label: 'Poster', hint: '2:3 · story / flyer', icon: '📱' },
  { value: 'landscape', label: 'Banner', hint: '3:2 · X / YouTube', icon: '🖼️' },
  { value: 'story', label: 'Story', hint: '9:16 · IG story', icon: '📲' },
];

// ─── Style archetypes (matches server templates, but user-facing labels) ───
const STYLES: { value: string; label: string; desc: string }[] = [
  { value: 'auto', label: '🎲 Surprise me', desc: 'Random top-tier archetype' },
  { value: 'apple-keynote', label: '🍎 Apple Keynote', desc: 'Minimal product hero, dramatic lighting' },
  { value: 'a24-film', label: '🎞️ A24 Film Poster', desc: 'Cinematic, grainy, moody' },
  { value: 'cyberpunk', label: '🌆 Cyberpunk Street', desc: 'Neon rain, glitch, futuristic' },
  { value: 'liquid-glass', label: '💧 Liquid Glass', desc: 'Frosted, translucent, premium' },
  { value: 'cosmic', label: '🌌 Cosmic Scale', desc: 'Nebulas, stars, epic scale' },
  { value: 'nike-campaign', label: '👟 Nike Campaign', desc: 'Bold, motion, athletic' },
  { value: 'luxury-watch', label: '⌚ Luxury Ad', desc: 'Macro detail, black backdrop' },
  { value: 'rave-flyer', label: '🔊 Rave Flyer', desc: 'Chaotic, energetic, underground' },
  { value: 'brutalist', label: '🧱 Brutalist Type', desc: 'Massive text, Swiss grid' },
  { value: 'magazine', label: '📖 Magazine Cover', desc: 'Editorial, character-led' },
  { value: 'sci-fi-keyart', label: '🚀 Sci-Fi Key Art', desc: 'Blockbuster movie poster' },
  { value: 'vaporwave', label: '🌴 Vaporwave', desc: 'Retro pastel, dreamy' },
  { value: 'product-teaser', label: '📦 Product Teaser', desc: 'Mysterious launch reveal' },
  { value: 'concert-tour', label: '🎤 Concert Tour', desc: 'Stage haze, spotlights' },
];

// ─── DeHub roadmap features (from Q1–Q4 2026 roadmap) ───
const FEATURES: { value: string; label: string; blurb: string }[] = [
  { value: 'lcs-tge', label: '🎮 Last Chad Standing TGE', blurb: 'Open beta + March 2026 TGE launch' },
  { value: 'apple-store', label: '📱 Apple App Store', blurb: 'Native iOS launch' },
  { value: 'lp-farming', label: '🌾 LP Farming', blurb: 'Community yields on Base' },
  { value: 'dhb-staking', label: '💎 DHB Staking on Base', blurb: 'Stake DHB, earn rewards' },
  { value: 'ai-toolkits', label: '🤖 AI Toolkits', blurb: 'Auto tips, engagement, guidance' },
  { value: 'ad-stack', label: '🎯 Advertising Stack', blurb: 'Wallet-based targeting' },
  { value: 'fiat-offramp', label: '💵 Fiat Off-Ramp', blurb: 'Token-to-cash conversion' },
  { value: 'sdks', label: '🛠️ Developer SDKs', blurb: 'Mini apps + games' },
  { value: 'multi-posting', label: '📢 Multi-Posting', blurb: 'Post to all web2+3 socials' },
  { value: 'streaming', label: '🎬 Streaming Aggregation', blurb: 'All major platforms in one' },
  { value: 'tv-console', label: '📺 TV & Console Apps', blurb: 'Living room takeover' },
  { value: 'vr-hub', label: '🥽 V/AR Profile Hub', blurb: 'Immersive identity' },
];

// ─── Auto-detection from user prompt ───

function detectDimension(prompt: string): PosterConfig['dimension'] {
  const lower = prompt.toLowerCase();
  if (/\b(square|1:1|instagram post|ig post)\b/.test(lower)) return 'square';
  if (/\b(banner|wide|landscape|hero|cover|16:9|youtube|3:2|twitter header|x header)\b/.test(lower)) return 'landscape';
  if (/\b(story|9:16|reel|tiktok|ig story|instagram story)\b/.test(lower)) return 'story';
  return 'portrait';
}

function detectStyle(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (/\bapple|keynote|minimal(ist)?\b/.test(lower)) return 'apple-keynote';
  if (/\ba24|cinematic|film|movie\b/.test(lower)) return 'a24-film';
  if (/\bcyberpunk|neon|futur/.test(lower)) return 'cyberpunk';
  if (/\bliquid glass|frosted|translucent\b/.test(lower)) return 'liquid-glass';
  if (/\bcosmic|space|nebula|galaxy|stars\b/.test(lower)) return 'cosmic';
  if (/\bnike|athletic|sport\b/.test(lower)) return 'nike-campaign';
  if (/\bluxury|premium ad|watch ad\b/.test(lower)) return 'luxury-watch';
  if (/\brave|flyer|underground|club\b/.test(lower)) return 'rave-flyer';
  if (/\bbrutalist|swiss|helvetica\b/.test(lower)) return 'brutalist';
  if (/\bmagazine|editorial|cover story\b/.test(lower)) return 'magazine';
  if (/\bsci[- ]?fi|key ?art|blockbuster\b/.test(lower)) return 'sci-fi-keyart';
  if (/\bvaporwave|retro|80s|synthwave\b/.test(lower)) return 'vaporwave';
  if (/\bproduct|launch|teaser|reveal\b/.test(lower)) return 'product-teaser';
  if (/\bconcert|tour|stage\b/.test(lower)) return 'concert-tour';
  return 'auto';
}

function detectFeatures(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const hits: string[] = [];
  if (/\b(lcs|last chad|tge)\b/.test(lower)) hits.push('lcs-tge');
  if (/\b(apple|app store|ios)\b/.test(lower)) hits.push('apple-store');
  if (/\b(lp farm|liquidity|yield)\b/.test(lower)) hits.push('lp-farming');
  if (/\b(staking|stake dhb)\b/.test(lower)) hits.push('dhb-staking');
  if (/\bai (toolkit|tools?|assistant|agent)\b/.test(lower)) hits.push('ai-toolkits');
  if (/\b(ad|advertis)/.test(lower)) hits.push('ad-stack');
  if (/\b(off[- ]?ramp|fiat)\b/.test(lower)) hits.push('fiat-offramp');
  if (/\bsdk|developer\b/.test(lower)) hits.push('sdks');
  if (/\bmulti[- ]?post|cross[- ]?post\b/.test(lower)) hits.push('multi-posting');
  if (/\bstream(ing)?\b/.test(lower)) hits.push('streaming');
  if (/\btv app|console\b/.test(lower)) hits.push('tv-console');
  if (/\bvr|ar|metaverse|profile hub\b/.test(lower)) hits.push('vr-hub');
  return hits;
}

function detectTagline(prompt: string): string {
  const quoted = prompt.match(/["']([^"']{4,60})["']/);
  if (quoted) return quoted[1].trim();
  const tag = prompt.match(/(?:tagline|headline|says?)\s*[:\-]\s*["']?([^"'\n,.]{4,60})["']?/i);
  if (tag) return tag[1].trim();
  return '';
}

function detectSocials(prompt: string): boolean {
  return /\b(socials?|social links|links|handles?|follow us|find us)\b/i.test(prompt);
}

function detectWebsite(prompt: string): boolean {
  return /\b(website|url|dehub\.io|domain|link to site)\b/i.test(prompt);
}

// ─── Prompt builder ───

function buildFinalPrompt(cfg: Omit<PosterConfig, 'finalPrompt'>, userPrompt: string): string {
  const parts: string[] = [];
  parts.push(userPrompt.trim());

  const dim = DIMENSIONS.find(d => d.value === cfg.dimension);
  if (dim) parts.push(`Format: ${dim.label} (${dim.hint}).`);

  if (cfg.style && cfg.style !== 'auto') {
    const style = STYLES.find(s => s.value === cfg.style);
    if (style) parts.push(`Style archetype: ${style.label.replace(/^[^\w]+/, '')} — ${style.desc}.`);
  }

  if (cfg.features.length) {
    const featureLabels = cfg.features
      .map(f => FEATURES.find(x => x.value === f))
      .filter(Boolean)
      .map(f => `${f!.label.replace(/^[^\w]+/, '')} (${f!.blurb})`);
    parts.push(`Spotlight DeHub feature(s): ${featureLabels.join('; ')}.`);
  }

  if (cfg.tagline) parts.push(`Include the tagline: "${cfg.tagline}" — rendered in Exo, pure white.`);

  const linkBits: string[] = [];
  if (cfg.includeWebsite) linkBits.push('dehub.io');
  if (cfg.includeSocials) linkBits.push('x.com/dehub_official', 't.me/dehub_dhb', 'discord.gg/dehub');
  if (linkBits.length) {
    parts.push(`Include these links at the bottom in small Exo Light, pure white, generous letter-spacing: ${linkBits.join(' · ')}.`);
  }

  if (cfg.extraNotes.trim()) parts.push(cfg.extraNotes.trim());

  return parts.join(' ');
}

export function PosterConfigDialog({ open, onOpenChange, userPrompt, onConfirm }: PosterConfigDialogProps) {
  const [dimension, setDimension] = useState<PosterConfig['dimension']>('portrait');
  const [style, setStyle] = useState('auto');
  const [features, setFeatures] = useState<string[]>([]);
  const [tagline, setTagline] = useState('');
  const [includeSocials, setIncludeSocials] = useState(false);
  const [includeWebsite, setIncludeWebsite] = useState(false);
  const [extraNotes, setExtraNotes] = useState('');

  useEffect(() => {
    if (!open || !userPrompt) return;
    setDimension(detectDimension(userPrompt));
    setStyle(detectStyle(userPrompt));
    setFeatures(detectFeatures(userPrompt));
    setTagline(detectTagline(userPrompt));
    setIncludeSocials(detectSocials(userPrompt));
    setIncludeWebsite(detectWebsite(userPrompt));
    setExtraNotes('');
  }, [open, userPrompt]);

  const toggleFeature = useCallback((value: string) => {
    setFeatures(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  }, []);

  const previewPrompt = useMemo(
    () => buildFinalPrompt({ dimension, style, features, tagline, includeSocials, includeWebsite, extraNotes }, userPrompt),
    [dimension, style, features, tagline, includeSocials, includeWebsite, extraNotes, userPrompt]
  );

  const handleConfirm = useCallback(() => {
    onConfirm({
      dimension,
      style,
      features,
      tagline,
      includeSocials,
      includeWebsite,
      extraNotes,
      finalPrompt: previewPrompt,
    });
  }, [dimension, style, features, tagline, includeSocials, includeWebsite, extraNotes, previewPrompt, onConfirm]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="border-t border-white/10">
        <DrawerHeader className="border-b border-white/10 pb-3">
          <DrawerTitle className="text-white flex items-center gap-2 text-base" style={{ fontFamily: 'Exo, Exo 2, sans-serif', letterSpacing: '0.02em' }}>
            🎨 DeHub Poster Studio
          </DrawerTitle>
          <p className="text-white/40 text-xs mt-1">Customize dimensions, style &amp; content — Exo typography and DeHub branding stay locked in.</p>
        </DrawerHeader>

        <div className="p-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Dimensions */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-2 block uppercase tracking-wider">Dimensions</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DIMENSIONS.map(d => (
                <button
                  key={d.value}
                  onClick={() => setDimension(d.value)}
                  className={cn(
                    'py-2.5 px-2 rounded-xl text-xs font-medium border transition-colors text-left',
                    dimension === d.value
                      ? 'border-white/30 bg-white/10 text-white'
                      : 'border-white/5 bg-white/[0.02] text-white/40 hover:text-white/60 hover:bg-white/5'
                  )}
                >
                  <div className="text-base leading-none mb-1">{d.icon}</div>
                  <div className="font-semibold">{d.label}</div>
                  <div className="text-[10px] text-white/40 mt-0.5">{d.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Style */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-2 block uppercase tracking-wider">Style Archetype</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-white/25 transition-colors"
              style={{ fontFamily: 'Exo, Exo 2, sans-serif' }}
            >
              {STYLES.map(s => (
                <option key={s.value} value={s.value} className="bg-black text-white">
                  {s.label} — {s.desc}
                </option>
              ))}
            </select>
          </div>

          {/* Roadmap features */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-2 block uppercase tracking-wider">
              Spotlight a Feature <span className="text-white/25 normal-case tracking-normal">(from our roadmap)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {FEATURES.map(f => {
                const active = features.includes(f.value);
                return (
                  <button
                    key={f.value}
                    onClick={() => toggleFeature(f.value)}
                    title={f.blurb}
                    className={cn(
                      'py-1.5 px-2.5 rounded-lg text-[11px] font-medium border transition-colors',
                      active
                        ? 'border-white/30 bg-white/15 text-white'
                        : 'border-white/5 bg-white/[0.02] text-white/50 hover:text-white/80 hover:bg-white/5'
                    )}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tagline */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-1.5 block uppercase tracking-wider">Tagline / Headline <span className="text-white/25 normal-case tracking-normal">(optional)</span></label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. Own your feed. Own your future."
              maxLength={60}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors"
              style={{ fontFamily: 'Exo, Exo 2, sans-serif', letterSpacing: '0.02em' }}
            />
          </div>

          {/* Link toggles */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-2 block uppercase tracking-wider">Include Links</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setIncludeWebsite(v => !v)}
                className={cn(
                  'py-2 px-3 rounded-xl text-xs font-medium border transition-colors flex items-center justify-between',
                  includeWebsite
                    ? 'border-white/30 bg-white/10 text-white'
                    : 'border-white/5 bg-white/[0.02] text-white/40 hover:text-white/60 hover:bg-white/5'
                )}
              >
                <span>🌐 Website</span>
                <span className="text-[10px] text-white/50">dehub.io</span>
              </button>
              <button
                onClick={() => setIncludeSocials(v => !v)}
                className={cn(
                  'py-2 px-3 rounded-xl text-xs font-medium border transition-colors flex items-center justify-between',
                  includeSocials
                    ? 'border-white/30 bg-white/10 text-white'
                    : 'border-white/5 bg-white/[0.02] text-white/40 hover:text-white/60 hover:bg-white/5'
                )}
              >
                <span>💬 Socials</span>
                <span className="text-[10px] text-white/50">X · TG · Discord</span>
              </button>
            </div>
          </div>

          {/* Extra notes */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-1.5 block uppercase tracking-wider">Extra Direction <span className="text-white/25 normal-case tracking-normal">(optional)</span></label>
            <textarea
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
              placeholder="e.g. Add a subtle magenta glow. Show a hand holding a phone."
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 pt-2 flex gap-2 border-t border-white/10">
          <button
            onClick={() => onOpenChange(false)}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-white/60 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <LiquidGlassBubble2
            label="Generate Poster"
            onClick={handleConfirm}
            width="auto"
            height="40px"
            className="flex-1 [&>div]:!py-2 [&>div]:!px-4 [&_span]:!text-sm [&_span]:!font-semibold"
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
