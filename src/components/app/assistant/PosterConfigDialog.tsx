import { translateCopy as _translateCopy } from '@/i18n/copy';
import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  { value: 'square', get label() { return _translateCopy("copy.c11092bc0861", { defaultValue: "Square" }); }, hint: '1:1 · IG post', icon: '⬛' },
  { value: 'portrait', get label() { return _translateCopy("copy.1ba76ea7e3d9", { defaultValue: "Poster" }); }, hint: '2:3 · story / flyer', icon: '📱' },
  { value: 'landscape', get label() { return _translateCopy("copy.b7f4d98f98d5", { defaultValue: "Banner" }); }, hint: '3:2 · X / YouTube', icon: '🖼️' },
  { value: 'story', get label() { return _translateCopy("copy.e9e509dcd358", { defaultValue: "Story" }); }, hint: '9:16 · IG story', icon: '📲' },
];

// ─── Style archetypes (matches server templates, but user-facing labels) ───
const STYLES: { value: string; label: string; desc: string }[] = [
  { value: 'dehub-template', get label() { return _translateCopy("copy.6bb795fea2b8", { defaultValue: "🎯 DeHub Banner" }); }, desc: 'On-brand chrome icon + silver headline (like our blog banners)' },
  { value: 'auto', get label() { return _translateCopy("copy.eb1bb7452892", { defaultValue: "🎲 Surprise me" }); }, desc: 'Random top-tier archetype' },
  { value: 'apple-keynote', get label() { return _translateCopy("copy.ca01201adaea", { defaultValue: "🍎 Apple Keynote" }); }, desc: 'Minimal product hero, dramatic lighting' },
  { value: 'a24-film', get label() { return _translateCopy("copy.edd50297ca4a", { defaultValue: "🎞️ A24 Film Poster" }); }, desc: 'Cinematic, grainy, moody' },
  { value: 'cyberpunk', get label() { return _translateCopy("copy.b534bb26caf1", { defaultValue: "🌆 Cyberpunk Street" }); }, desc: 'Neon rain, glitch, futuristic' },
  { value: 'liquid-glass', get label() { return _translateCopy("copy.f8cfb761cc4d", { defaultValue: "💧 Liquid Glass" }); }, desc: 'Frosted, translucent, premium' },
  { value: 'cosmic', get label() { return _translateCopy("copy.83f29355454f", { defaultValue: "🌌 Cosmic Scale" }); }, desc: 'Nebulas, stars, epic scale' },
  { value: 'nike-campaign', get label() { return _translateCopy("copy.7151bc120e24", { defaultValue: "👟 Nike Campaign" }); }, desc: 'Bold, motion, athletic' },
  { value: 'luxury-watch', get label() { return _translateCopy("copy.878af03d5968", { defaultValue: "⌚ Luxury Ad" }); }, desc: 'Macro detail, black backdrop' },
  { value: 'rave-flyer', get label() { return _translateCopy("copy.16cc0ff62e43", { defaultValue: "🔊 Rave Flyer" }); }, desc: 'Chaotic, energetic, underground' },
  { value: 'brutalist', get label() { return _translateCopy("copy.4330842d94b7", { defaultValue: "🧱 Brutalist Type" }); }, desc: 'Massive text, Swiss grid' },
  { value: 'magazine', get label() { return _translateCopy("copy.bf2f3ecac4d0", { defaultValue: "📖 Magazine Cover" }); }, desc: 'Editorial, character-led' },
  { value: 'sci-fi-keyart', get label() { return _translateCopy("copy.eec45791cfff", { defaultValue: "🚀 Sci-Fi Key Art" }); }, desc: 'Blockbuster movie poster' },
  { value: 'vaporwave', get label() { return _translateCopy("copy.d5e76a61b86a", { defaultValue: "🌴 Vaporwave" }); }, desc: 'Retro pastel, dreamy' },
  { value: 'product-teaser', get label() { return _translateCopy("copy.1784371d756d", { defaultValue: "📦 Product Teaser" }); }, desc: 'Mysterious launch reveal' },
  { value: 'concert-tour', get label() { return _translateCopy("copy.d9c930ee7f28", { defaultValue: "🎤 Concert Tour" }); }, desc: 'Stage haze, spotlights' },
];

// ─── Logo variants ───
const LOGO_VARIANTS: { value: LogoVariant; label: string; hint: string }[] = [
  { value: 'primary', get label() { return _translateCopy("copy.d5fda981cc4a", { defaultValue: "Wordmark" }); }, hint: 'Long-form DeHub logo' },
  { value: 'icon', get label() { return _translateCopy("copy.a35abcd6dac9", { defaultValue: "Icon" }); }, hint: 'Compact D-mark' },
  { value: 'both', get label() { return _translateCopy("copy.b6c1d862f9f7", { defaultValue: "Both" }); }, hint: 'Wordmark + icon lockup' },
];

// ─── DeHub features (sourced from every dapp + docs page, not just roadmap) ───
const FEATURE_GROUPS: { group: string; items: { value: string; label: string; blurb: string }[] }[] = [
  {
    group: 'Social & Feed',
    items: [
      { value: 'unified-feed', get label() { return _translateCopy("copy.dd05b3bca137", { defaultValue: "📰 Unified Feed" }); }, blurb: 'Web2 + web3 social in one home' },
      { value: 'communities', get label() { return _translateCopy("copy.269ad0d90f5a", { defaultValue: "👥 Communities" }); }, blurb: 'Token-gated groups & channels' },
      { value: 'stories', get label() { return _translateCopy("copy.50c8afc2eec1", { defaultValue: "📸 Stories" }); }, blurb: 'Ephemeral daily posts' },
      { value: 'shorts', get label() { return _translateCopy("copy.365075d796de", { defaultValue: "🎞️ Shorts" }); }, blurb: 'Vertical short-form video' },
      { value: 'multi-posting', get label() { return _translateCopy("copy.db9897e168fa", { defaultValue: "📢 Multi-Posting" }); }, blurb: 'Cross-post to X, TG, Discord, IG' },
    ],
  },
  {
    group: 'Live & Media',
    items: [
      { value: 'livestream', get label() { return _translateCopy("copy.38fddb1a5217", { defaultValue: "📡 Livestreaming" }); }, blurb: 'Native + aggregated streams' },
      { value: 'streaming-agg', get label() { return _translateCopy("copy.3098854985e6", { defaultValue: "🎬 Streaming Aggregation" }); }, blurb: 'All major platforms in one' },
      { value: 'stages', get label() { return _translateCopy("copy.2da0741cd536", { defaultValue: "🎙️ Stages" }); }, blurb: 'Audio rooms with AI TTS hosts' },
      { value: 'radio', get label() { return _translateCopy("copy.a0b9c4ce5f29", { defaultValue: "📻 DeHub Radio" }); }, blurb: '24/7 crypto radio' },
      { value: 'tv-console', get label() { return _translateCopy("copy.e169e0f5f7cd", { defaultValue: "📺 TV & Console Apps" }); }, blurb: 'Living room takeover' },
      { value: 'editor', get label() { return _translateCopy("copy.03bbf31aa251", { defaultValue: "🎬 In-Browser Video Editor" }); }, blurb: 'Multi-track studio at /editor' },
    ],
  },
  {
    group: 'Chat & Comms',
    items: [
      { value: 'dm-tipped', get label() { return _translateCopy("copy.5e0be69e7d7d", { defaultValue: "💌 Tipped DMs" }); }, blurb: 'End-to-end encrypted, tip-per-message' },
      { value: 'e2e', get label() { return _translateCopy("copy.ebd7731d3536", { defaultValue: "🔒 E2E Encryption" }); }, blurb: 'Zero-knowledge chats' },
      { value: 'voice-video', get label() { return _translateCopy("copy.fc56fd22af80", { defaultValue: "🎥 Voice & Video Calls" }); }, blurb: 'WebRTC calling' },
      { value: 'voice-notes', get label() { return _translateCopy("copy.dfdd2f096f81", { defaultValue: "🎤 Voice Notes" }); }, blurb: 'Waveform-visualised messages' },
    ],
  },
  {
    group: 'Token & DeFi',
    items: [
      { value: 'dhb-staking', get label() { return _translateCopy("copy.0039cdece89a", { defaultValue: "💎 Token Staking (Base)" }); }, blurb: 'Stake tokens, earn rewards' },
      { value: 'lp-farming', get label() { return _translateCopy("copy.ffd397381778", { defaultValue: "🌾 LP Farming" }); }, blurb: 'Provide liquidity, earn yield' },
      { value: 'token-bridge', get label() { return _translateCopy("copy.5441d9dc54f6", { defaultValue: "🌉 Token Bridge" }); }, blurb: 'BNB ↔ Base cross-chain' },
      { value: 'governance', get label() { return _translateCopy("copy.7e9ecb6a5eff", { defaultValue: "🗳️ Governance" }); }, blurb: 'On-chain proposals & voting' },
      { value: 'token-utility', get label() { return _translateCopy("copy.e3e81d3d76cf", { defaultValue: "🪙 Token Utility" }); }, blurb: 'Fees, boosts, gating, tipping' },
      { value: 'fiat-onramp', get label() { return _translateCopy("copy.6818215dba2d", { defaultValue: "💳 Fiat On-Ramp" }); }, blurb: 'Card → USDC → tokens' },
      { value: 'fiat-offramp', get label() { return _translateCopy("copy.b295e355b543", { defaultValue: "💵 Fiat Off-Ramp" }); }, blurb: 'Token-to-cash conversion' },
      { value: 'uniswap-swap', get label() { return _translateCopy("copy.831e71a8e8c6", { defaultValue: "🔄 In-App Swap" }); }, blurb: 'Uniswap V3, one click' },
      { value: 'wallet', get label() { return _translateCopy("copy.e54d786a7b76", { defaultValue: "👛 Cross-Chain Wallet" }); }, blurb: 'BNB + Base aggregated' },
    ],
  },
  {
    group: 'Marketplace & Commerce',
    items: [
      { value: 'stores', get label() { return _translateCopy("copy.50d8d34a787b", { defaultValue: "🛍️ DeHub Stores" }); }, blurb: 'P2P commerce in tokens on Base' },
      { value: 'fractions', get label() { return _translateCopy("copy.6ee5630c9dde", { defaultValue: "🧩 Fractions" }); }, blurb: 'Fractional NFT marketplace' },
      { value: 'work', get label() { return _translateCopy("copy.fb673c9c986e", { defaultValue: "🧑‍💻 DeHub Bounties" }); }, blurb: 'Escrow bounties: social, clips, contracts' },
      { value: 'tipping', get label() { return _translateCopy("copy.2b13f4c55720", { defaultValue: "💸 Tipping" }); }, blurb: 'Reward creators on any post' },
      { value: 'premium', get label() { return _translateCopy("copy.1205929886b3", { defaultValue: "👑 DeHub Extra" }); }, blurb: 'Premium tiers with cashback' },
    ],
  },
  {
    group: 'AI & Creator Tools',
    items: [
      { value: 'ai-assistant', get label() { return _translateCopy("copy.24a657b7384e", { defaultValue: "🤖 AI Assistant" }); }, blurb: 'DeHub-aware chat + skills' },
      { value: 'ai-image', get label() { return _translateCopy("copy.fea1030abae5", { defaultValue: "🖼️ AI Image Gen" }); }, blurb: 'GPT-image-2 & Nano Banana 2' },
      { value: 'ai-video', get label() { return _translateCopy("copy.7209e5080253", { defaultValue: "🎥 AI Video Gen" }); }, blurb: 'Per-second billed clips' },
      { value: 'ai-toolkits', get label() { return _translateCopy("copy.706d522aacec", { defaultValue: "🧰 AI Toolkits" }); }, blurb: 'Auto tips, engagement, guidance' },
      { value: 'characters', get label() { return _translateCopy("copy.457e30a6a1e9", { defaultValue: "🎭 Characters" }); }, blurb: '@mention reusable AI personas' },
      { value: 'skills', get label() { return _translateCopy("copy.b3b61e24c8f8", { defaultValue: "🧠 User Skills" }); }, blurb: 'Personal AI knowledge packs' },
      { value: 'affiliate', get label() { return _translateCopy("copy.4d675ad7e188", { defaultValue: "🤝 20% Affiliate" }); }, blurb: '2-tier referral revenue share' },
    ],
  },
  {
    group: 'Games & DePIN',
    items: [
      { value: 'lcs-tge', get label() { return _translateCopy("copy.94e2d0eda8c8", { defaultValue: "🎮 Last Chad Standing TGE" }); }, blurb: 'March 2026 launch' },
      { value: 'games-hub', get label() { return _translateCopy("copy.1925f0dffb3b", { defaultValue: "🕹️ Games Hub" }); }, blurb: 'Web3-native mini games' },
      { value: 'depin', get label() { return _translateCopy("copy.5b560f273940", { defaultValue: "🛰️ DePIN" }); }, blurb: 'Decentralized physical infra' },
      { value: 'sdks', get label() { return _translateCopy("copy.226d010f636d", { defaultValue: "🛠️ Developer SDKs" }); }, blurb: 'Build mini apps & games' },
    ],
  },
  {
    group: 'Growth & Reach',
    items: [
      { value: 'ad-stack', get label() { return _translateCopy("copy.4f97987243b4", { defaultValue: "🎯 Advertising Stack" }); }, blurb: 'Wallet-based targeting' },
      { value: 'apple-store', get label() { return _translateCopy("copy.748d190d59af", { defaultValue: "📱 Apple App Store" }); }, blurb: 'Native iOS launch' },
      { value: 'blog', get label() { return _translateCopy("copy.104272ba3fd3", { defaultValue: "✍️ Blog" }); }, blurb: 'Long-form + SEO content' },
      { value: 'events', get label() { return _translateCopy("copy.58114cd29d10", { defaultValue: "📅 Events" }); }, blurb: 'IRL & virtual RSVPs' },
      { value: 'vr-hub', get label() { return _translateCopy("copy.c6db0784ded4", { defaultValue: "🥽 V/AR Profile Hub" }); }, blurb: 'Immersive identity' },
    ],
  },
];

const FEATURES = FEATURE_GROUPS.flatMap(g => g.items);

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
  // Default to the on-brand DeHub template banner unless the user explicitly asked
  // for one of the cinematic scene archetypes above.
  return 'dehub-template';
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

  const logoNote =
    cfg.logoVariant === 'icon'
      ? 'Reserve clear negative space for the DeHub icon mark (compact D-symbol) only — do not draw the wordmark.'
      : cfg.logoVariant === 'both'
      ? 'Reserve clear negative space for a DeHub lockup combining the icon mark and the long-form wordmark side-by-side or stacked.'
      : 'Reserve clear negative space for the DeHub long-form wordmark logo.';
  parts.push(logoNote);

  if (cfg.style && cfg.style !== 'auto' && cfg.style !== 'dehub-template') {
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

  if (cfg.tagline) parts.push(`Reserve clean negative space above the bottom logo area for a short headline — do NOT render any headline text yourself; the real headline is composited afterward.`);

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
  const { t: _copy } = _useCopy();
  const [dimension, setDimension] = useState<PosterConfig['dimension']>('portrait');
  const [style, setStyle] = useState('dehub-template');
  const [features, setFeatures] = useState<string[]>([]);
  const [tagline, setTagline] = useSurfaceDraft("components/app/assistant/PosterConfigDialog.tsx:tagline", '');
  const [includeSocials, setIncludeSocials] = useState(false);
  const [includeWebsite, setIncludeWebsite] = useState(false);
  const [extraNotes, setExtraNotes] = useSurfaceDraft("components/app/assistant/PosterConfigDialog.tsx:extraNotes", '');
  const [logoVariant, setLogoVariant] = useState<LogoVariant>('primary');

  useEffect(() => {
    if (!open || !userPrompt) return;
    setDimension(detectDimension(userPrompt));
    setStyle(detectStyle(userPrompt));
    setFeatures(detectFeatures(userPrompt));
    setTagline.initialize(detectTagline(userPrompt));
    setIncludeSocials(detectSocials(userPrompt));
    setIncludeWebsite(detectWebsite(userPrompt));
    setExtraNotes.initialize('');
    const lower = userPrompt.toLowerCase();
    if (/\bicon|symbol|mark|d-mark|small logo\b/.test(lower)) setLogoVariant('icon');
    else if (/\bboth logos?|lockup|icon\s*\+\s*wordmark|wordmark\s*\+\s*icon\b/.test(lower)) setLogoVariant('both');
    else setLogoVariant('primary');
  }, [open, userPrompt, setExtraNotes, setTagline]);

  const toggleFeature = useCallback((value: string) => {
    setFeatures(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  }, []);

  const previewPrompt = useMemo(
    () => buildFinalPrompt({ dimension, style, features, tagline, includeSocials, includeWebsite, extraNotes, logoVariant }, userPrompt),
    [dimension, style, features, tagline, includeSocials, includeWebsite, extraNotes, logoVariant, userPrompt]
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
      logoVariant,
      finalPrompt: previewPrompt,
    });
  }, [dimension, style, features, tagline, includeSocials, includeWebsite, extraNotes, logoVariant, previewPrompt, onConfirm]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="border-t border-white/10">
        <DrawerHeader className="border-b border-white/10 pb-3">
          <DrawerTitle className="text-white flex items-center gap-2 text-base" style={{ fontFamily: 'Exo, Exo 2, sans-serif', letterSpacing: '0.02em' }}>{_copy("copy.6decaedff6c1", { defaultValue: "🎨 DeHub Poster Studio" })}</DrawerTitle>
          <p className="text-white/40 text-xs mt-1">{_copy("copy.297102fe982b", { defaultValue: "Customize dimensions, style & content — Exo typography and DeHub branding stay locked in." })}</p>
        </DrawerHeader>

        <div className="p-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Dimensions */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-2 block uppercase tracking-wider">{_copy("copy.914182d5e25f", { defaultValue: "Dimensions" })}</label>
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
            <label className="text-xs font-medium text-white/60 mb-2 block uppercase tracking-wider">{_copy("copy.e12e4ed58e74", { defaultValue: "Style Archetype" })}</label>
            <Select value={style} onValueChange={setStyle}>
              <SelectTrigger
                className="w-full h-auto px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white hover:bg-white/[0.07] focus:ring-0 focus:ring-offset-0 focus:border-white/25 transition-colors [&>svg]:opacity-70 [&>svg]:ml-2"
                style={{ fontFamily: 'Exo, Exo 2, sans-serif' }}
              >
                <SelectValue placeholder={_copy("copy.cba3a8fc4421", { defaultValue: "Select style…" })} />
              </SelectTrigger>
              <SelectContent
                position="popper"
                side="bottom"
                sideOffset={6}
                align="start"
                className="max-h-[50vh] w-[var(--radix-select-trigger-width)] rounded-2xl bg-black/70 backdrop-blur-[24px] border border-white/10 shadow-2xl"
              >
                {STYLES.map(s => (
                  <SelectItem
                    key={s.value}
                    value={s.value}
                    className="rounded-xl px-3 py-2 text-sm text-white/90 focus:bg-white/10 focus:text-white data-[state=checked]:bg-white/10"
                  >
                    <span className="font-medium">{s.label}</span>
                    <span className="text-white/40"> — {s.desc}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Logo variant */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-2 block uppercase tracking-wider">{_copy("copy.db08e3de9713", { defaultValue: "Logo Variant" })}</label>
            <div className="grid grid-cols-3 gap-2">
              {LOGO_VARIANTS.map(v => (
                <button
                  key={v.value}
                  onClick={() => setLogoVariant(v.value)}
                  className={cn(
                    'py-2.5 px-2 rounded-xl text-xs font-medium border transition-colors text-left',
                    logoVariant === v.value
                      ? 'border-white/30 bg-white/10 text-white'
                      : 'border-white/5 bg-white/[0.02] text-white/40 hover:text-white/60 hover:bg-white/5'
                  )}
                >
                  <div className="font-semibold">{v.label}</div>
                  <div className="text-[10px] text-white/40 mt-0.5">{v.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Feature spotlight (grouped from every dapp + docs page) */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-2 block uppercase tracking-wider">{_copy("copy.fd71b3ee1178", { defaultValue: "Spotlight Features " })}<span className="text-white/25 normal-case tracking-normal">{_copy("copy.112a5da99805", { defaultValue: "(from our dapp & docs)" })}</span>
            </label>
            <div className="space-y-3">
              {FEATURE_GROUPS.map(group => (
                <div key={group.group}>
                  <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5">{group.group}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map(f => {
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
              ))}
            </div>
          </div>


          {/* Tagline */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-1.5 block uppercase tracking-wider">{_copy("copy.306c6c8dd0db", { defaultValue: "Tagline / Headline " })}<span className="text-white/25 normal-case tracking-normal">{_copy("copy.0059798b7f70", { defaultValue: "(optional)" })}</span></label>
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
            <label className="text-xs font-medium text-white/60 mb-2 block uppercase tracking-wider">{_copy("copy.18170f516593", { defaultValue: "Include Links" })}</label>
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
                <span>{_copy("copy.3f2f76bef710", { defaultValue: "🌐 Website" })}</span>
                <span className="text-[10px] text-white/50">{_copy("copy.ca7842e53ac8", { defaultValue: "dehub.io" })}</span>
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
                <span>{_copy("copy.4e7a2f77ce7b", { defaultValue: "💬 Socials" })}</span>
                <span className="text-[10px] text-white/50">{_copy("copy.667a759ed273", { defaultValue: "X · TG · Discord" })}</span>
              </button>
            </div>
          </div>

          {/* Extra notes */}
          <div>
            <label className="text-xs font-medium text-white/60 mb-1.5 block uppercase tracking-wider">{_copy("copy.3fb5e9de9981", { defaultValue: "Extra Direction " })}<span className="text-white/25 normal-case tracking-normal">{_copy("copy.0059798b7f70", { defaultValue: "(optional)" })}</span></label>
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
          >{_copy("copy.19766ed6ccb2", { defaultValue: "Cancel" })}</button>
          <LiquidGlassBubble2
            label={_copy("copy.c595e334dd5d", { defaultValue: "Generate Poster" })}
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
