import { translateCopy as _translateCopy } from '@/i18n/copy';
/**
 * Video Generation Models Configuration
 * Premium models available via Replicate API and fal.ai
 */

import { CREATOR_FAL_VIDEO_MODELS } from '../../supabase/functions/_shared/creator-fal-catalog';
import { VENICE_VIDEO_MODELS, isVeniceVideo } from '../../supabase/functions/_shared/venice-catalog';

export interface VideoModel {
  id: string;
  name: string;
  description: string;
  supports: ('text-to-video' | 'image-to-video')[];
  duration: string;
  tier: 'premium' | 'standard' | 'fast';
  emoji: string;
  /** Base cost in USD (before markup) — used for flat-rate models */
  baseCostUsd: number;
  /** Per-second cost in USD (before markup) — used for per-second billing models */
  perSecondCostUsd?: number;
  /** Default duration in seconds for per-second models */
  defaultDuration?: number;
  /** Min duration in seconds */
  minDuration?: number;
  /** Max duration in seconds */
  maxDuration?: number;
  /**
   * Closed set of durations the provider accepts, when it is not a free range.
   *
   * Several fal families type `duration` as an enum, so an in-between value is
   * rejected outright. Where this is set the UI offers exactly these values
   * instead of a stepper — otherwise someone pays for 5 seconds of Veo and gets
   * billed for a request the provider refuses, or silently rendered 4.
   */
  allowedDurations?: number[];
  /** Whether the model supports native audio generation */
  hasAudio?: boolean;
  /** Whether the model supports negative prompts */
  supportsNegativePrompt?: boolean;
  /** Whether the model supports resolution selection */
  supportsResolution?: boolean;
  /**
   * Resolutions this model actually renders, when it is not the usual trio.
   *
   * Seedance 2.5 tops out at 720p, so offering 1080p would take payment for a
   * resolution the provider silently downgrades. Unset means 480p/720p/1080p.
   */
  resolutions?: string[];
  /** Provider for the model (defaults to 'replicate') */
  provider?: 'replicate' | 'fal' | 'venice';
  /** Whether the model supports reference images (character/style consistency) */
  supportsReferenceImages?: boolean;
  /** Max number of reference images */
  maxReferenceImages?: number;
  /** Whether the model supports end frame image */
  supportsEndFrame?: boolean;
  /** Whether the model supports audio-driven video (lip-sync) */
  supportsAudioInput?: boolean;
  /** Whether the model supports video-to-video restyling */
  supportsVideoInput?: boolean;
  requiresVideoInput?: boolean;
  referenceMode?: 'edit' | 'motion';
  /** Whether the model supports seed for reproducibility */
  supportsSeed?: boolean;
  /** Short tips/help for using this model effectively */
  tips?: string[];
  /** Available aspect ratios */
  aspectRatios?: string[];
}

/**
 * Markup percentage for video generation (20% = 1.2x cost). Display only —
 * the server quotes the real charge from supabase/functions/_shared/ai-pricing.ts,
 * so keep the two in step by hand.
 */
export const VIDEO_GENERATION_MARKUP = 0.2; // 20% markup

/**
 * Per-model markup bands, mirroring MARKUP_OVERRIDES in ai-pricing.ts. This
 * mirror is load-bearing, not cosmetic: VideoPaywallModal prices its confirm
 * screen and its can-afford check from these constants, so a band applied on
 * the server alone would show a price ~8% under the debit and wave through
 * users the server then rejects with 402.
 */
export const VIDEO_MARKUP_OVERRIDES: Record<string, number> = {
  'veo-3.1-fast': 0.3,
  'veo-3.1': 0.3,
};

/**
 * Calculate the final cost in USD with markup
 */
export const getVideoCostUsd = (model: VideoModel, durationSeconds?: number): number => {
  if (isVeniceVideo(model.id)) return model.baseCostUsd;
  const markup = VIDEO_MARKUP_OVERRIDES[model.id] ?? VIDEO_GENERATION_MARKUP;
  if (model.perSecondCostUsd && durationSeconds) {
    return model.perSecondCostUsd * durationSeconds * (1 + markup);
  }
  return model.baseCostUsd * (1 + markup);
};

/**
 * Calculate the cost in DHB tokens
 */
export const getVideoCostDhb = (model: VideoModel, dhbPriceUsd: number, durationSeconds?: number): number => {
  if (dhbPriceUsd <= 0) return 0;
  const costUsd = getVideoCostUsd(model, durationSeconds);
  return costUsd / dhbPriceUsd;
};

/** The resolutions a model offers, falling back to the common trio. */
export const getVideoResolutions = (model: VideoModel | undefined): string[] =>
  model?.resolutions ?? ['480p', '720p', '1080p'];

export const VIDEO_MODELS: Record<string, VideoModel> = {
  ...Object.fromEntries(Object.entries(VENICE_VIDEO_MODELS).map(([id, model]) => [id, {
    id, name: model.name, description: 'Live Venice quote · zero DeHub markup',
    supports: [model.imageRequired ? 'image-to-video' as const : 'text-to-video' as const],
    duration: '5–15s', tier: 'standard' as const, emoji: '◈', baseCostUsd: 0,
    defaultDuration: 5, minDuration: 5, maxDuration: 15, allowedDurations: [5, 10, 15],
    hasAudio: false, supportsResolution: true, resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1'], provider: 'venice' as const,
    supportsNegativePrompt: false,
  }])),
  ...CREATOR_FAL_VIDEO_MODELS,
  'seedance-2.5': {
    id: 'seedance-2.5',
    name: 'Seedance 2.5',
    get description() { return _translateCopy("copy.b8c339f21031", { defaultValue: "ByteDance flagship — 30s takes, best prompt adherence" }); },
    supports: ['text-to-video', 'image-to-video'],
    duration: '4-30s',
    tier: 'premium',
    emoji: '🌊',
    // kie.ai's 720p rate, where this now renders. 480p is roughly half, but
    // the composer is charged on the ceiling so a resolution switch can never
    // go underwater.
    baseCostUsd: 1.575,
    perSecondCostUsd: 0.315,
    defaultDuration: 5,
    minDuration: 4,
    maxDuration: 30,
    hasAudio: true,
    // The 2.5 schema has no negative_prompt field, and fal 422s unknown keys.
    supportsNegativePrompt: false,
    supportsResolution: true,
    resolutions: ['480p', '720p'],
    provider: 'fal',
    supportsReferenceImages: true,
    maxReferenceImages: 9,
    supportsEndFrame: true,
    supportsSeed: true,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    get tips() {
      return [
        _translateCopy("copy.1202a152d5a7", { defaultValue: "🌊 The strongest all-rounder here — start on this one" }),
        _translateCopy("copy.e9dc7adbfd92", { defaultValue: "⏱️ Up to 30 seconds in a single pass, twice Seedance 2.0" }),
        _translateCopy("copy.32cba4a53adb", { defaultValue: "🖼️ Attach an image to animate it, or set a start and end frame" }),
        _translateCopy("copy.bb59f9125f09", { defaultValue: "👤 Reference images hold a character or product across the clip" }),
        _translateCopy("copy.e41c2119f8fc", { defaultValue: "🔊 Audio is generated jointly with the picture, so lip sync lands" }),
        _translateCopy("copy.9c72701f5a0a", { defaultValue: "📺 720p is the ceiling — 480p halves the cost" }),
      ];
    },
  },
  'kling-2.6-pro': {
    id: 'kling-2.6-pro',
    name: 'Kling 2.6 Pro',
    get description() { return _translateCopy("copy.4bddb1751509", { defaultValue: "Top-tier cinematic with native audio" }); },
    supports: ['text-to-video', 'image-to-video'],
    duration: '5-10s',
    tier: 'premium',
    emoji: '🎬',
    baseCostUsd: 1.10,
    hasAudio: true,
    minDuration: 5,
    maxDuration: 10,
    // Replicate takes 5 or 10 only and rejects anything between.
    allowedDurations: [5, 10],
    defaultDuration: 5,
    supportsNegativePrompt: true,
    supportsSeed: true,
    aspectRatios: ['16:9', '9:16', '1:1'],
    get tips() {
      return [
        _translateCopy("copy.c3dcb2e92bdd", { defaultValue: "🎬 Best for cinematic, high-fidelity scenes" }),
        _translateCopy("copy.401f701bb337", { defaultValue: "🖼️ Attach an image to animate it into a video" }),
        _translateCopy("copy.1a9548da66c3", { defaultValue: "🔇 Generates native audio automatically" }),
        _translateCopy("copy.cff6a12bbd2a", { defaultValue: "⏱️ 10s duration gives smoother motion arcs" }),
        _translateCopy("copy.9c3aebc376ac", { defaultValue: "🎯 Use negative prompts to avoid unwanted elements" }),
      ];
    },
  },
  'luma-ray2': {
    id: 'luma-ray2',
    name: 'Luma Ray 2',
    get description() { return _translateCopy("copy.897e18877075", { defaultValue: "Photorealistic, dreamy aesthetic (720p)" }); },
    supports: ['text-to-video'],
    duration: '5s',
    tier: 'premium',
    emoji: '✨',
    baseCostUsd: 0.65,
    aspectRatios: ['16:9', '9:16', '1:1', '3:4', '4:3'],
    get tips() {
      return [
        _translateCopy("copy.84c963d0d0aa", { defaultValue: "✨ Excels at dreamy, artistic aesthetics" }),
        _translateCopy("copy.b16813224510", { defaultValue: "📝 Text-to-video only — describe your scene vividly" }),
        _translateCopy("copy.6018fc0a180e", { defaultValue: "🎨 Great for abstract, surreal, or nature scenes" }),
        _translateCopy("copy.f2f36b3c349f", { defaultValue: "📐 Try different aspect ratios for variety" }),
      ];
    },
  },
  'runway-gen4': {
    id: 'runway-gen4',
    name: 'Runway Gen-4 Turbo',
    get description() { return _translateCopy("copy.3385bf19ecf6", { defaultValue: "Animate images (requires image)" }); },
    supports: ['image-to-video'],
    duration: '5-10s',
    tier: 'premium',
    emoji: '🚀',
    baseCostUsd: 0.50,
    minDuration: 5,
    maxDuration: 10,
    // Replicate takes 5 or 10 only and rejects anything between.
    allowedDurations: [5, 10],
    defaultDuration: 10,
    aspectRatios: ['16:9', '9:16', '1:1'],
    get tips() {
      return [
        _translateCopy("copy.730dfbcdb279", { defaultValue: "🖼️ Requires an image — attach one to animate it" }),
        _translateCopy("copy.2431127c6c54", { defaultValue: "🚀 Best-in-class image animation quality" }),
        _translateCopy("copy.f96b156f47b2", { defaultValue: "📸 Works great with photos, illustrations, AI art" }),
        _translateCopy("copy.f24b37b0fb8e", { defaultValue: "💡 Describe the motion you want in your prompt" }),
      ];
    },
  },
  'minimax-video': {
    id: 'minimax-video',
    name: 'Minimax Video-01',
    get description() { return _translateCopy("copy.f508a0cf129e", { defaultValue: "Fast generation, great quality" }); },
    supports: ['text-to-video', 'image-to-video'],
    duration: '6s',
    tier: 'standard',
    emoji: '⚡',
    baseCostUsd: 0.22,
    get tips() {
      return [
        _translateCopy("copy.bfb11ed80e67", { defaultValue: "⚡ Fast generation at an affordable price" }),
        _translateCopy("copy.8943e37a9f6f", { defaultValue: "🖼️ Attach an image for image-to-video mode" }),
        _translateCopy("copy.17d5c18b44b7", { defaultValue: "📝 Keep prompts concise for best results" }),
        _translateCopy("copy.5ec12d01e69b", { defaultValue: "💰 Great value for quick iterations" }),
      ];
    },
  },
  'ltx-video': {
    id: 'ltx-video',
    name: 'LTX Video',
    get description() { return _translateCopy("copy.8884959c3902", { defaultValue: "Fast and efficient" }); },
    supports: ['text-to-video', 'image-to-video'],
    duration: '5s',
    tier: 'fast',
    emoji: '💨',
    baseCostUsd: 0.085,
    supportsSeed: true,
    supportsNegativePrompt: true,
    get tips() {
      return [
        _translateCopy("copy.18eb2e8a02b2", { defaultValue: "💨 Fastest & cheapest option for quick tests" }),
        _translateCopy("copy.df370662c4a6", { defaultValue: "🔁 Use seed to iterate on the same scene" }),
        _translateCopy("copy.513bb874b9d3", { defaultValue: "🎯 Negative prompts help refine output" }),
        _translateCopy("copy.bdb289c47571", { defaultValue: "💡 Perfect for rapid prototyping ideas" }),
      ];
    },
  },
  'seedance-1.5-pro': {
    id: 'seedance-1.5-pro',
    name: 'Seedance 1.5 Pro',
    get description() { return _translateCopy("copy.ee76a220959c", { defaultValue: "ByteDance cinematic with native audio" }); },
    supports: ['text-to-video', 'image-to-video'],
    duration: '2-12s',
    tier: 'premium',
    emoji: '🌊',
    baseCostUsd: 0.65,
    hasAudio: true,
    minDuration: 2,
    maxDuration: 12,
    defaultDuration: 5,
    supportsNegativePrompt: true,
    supportsResolution: true,
    supportsSeed: true,
    aspectRatios: ['16:9', '9:16', '1:1'],
    get tips() {
      return [
        _translateCopy("copy.d444f9499ffc", { defaultValue: "🌊 Cinematic quality with native audio" }),
        _translateCopy("copy.2a0b2a2c6dc1", { defaultValue: "🖼️ Attach an image to animate it" }),
        _translateCopy("copy.70d52cba6985", { defaultValue: "📺 Supports 720p resolution" }),
        _translateCopy("copy.6b22cd35ed6f", { defaultValue: "⏱️ Flexible 2-12s duration range" }),
        _translateCopy("copy.b014009b335a", { defaultValue: "🔁 Lock a seed for consistent iterations" }),
      ];
    },
  },
  'seedance-2.0': {
    id: 'seedance-2.0',
    name: 'Seedance 2.0',
    get description() { return _translateCopy("copy.c5a1d3b9268d", { defaultValue: "Latest ByteDance model, superior quality & audio" }); },
    supports: ['text-to-video', 'image-to-video'],
    duration: '4-15s',
    tier: 'premium',
    emoji: '🌊',
    // kie.ai's 720p rate, where this now renders.
    baseCostUsd: 0.825,
    perSecondCostUsd: 0.165,
    defaultDuration: 5,
    minDuration: 4,
    maxDuration: 15,
    hasAudio: true,
    supportsNegativePrompt: true,
    supportsResolution: true,
    resolutions: ['480p', '720p'],
    provider: 'fal',
    supportsReferenceImages: true,
    maxReferenceImages: 9,
    supportsEndFrame: true,
    supportsAudioInput: true,
    supportsVideoInput: true,
    supportsSeed: true,
    aspectRatios: ['16:9', '9:16', '1:1'],
    get tips() {
      return [
        _translateCopy("copy.1928372ee940", { defaultValue: "👤 Upload face photos for character consistency across videos" }),
        _translateCopy("copy.cec7465fbd73", { defaultValue: "🎵 Upload audio for lip-sync animation" }),
        _translateCopy("copy.5458c46e4c3d", { defaultValue: "🎬 Set start + end frames for controlled transitions" }),
        _translateCopy("copy.af5821c6714e", { defaultValue: "🎨 Upload a video to restyle it with a new prompt" }),
        _translateCopy("copy.265a1587a724", { defaultValue: "🔁 Lock a seed to iterate without randomness" }),
        _translateCopy("copy.f991c9ed6f9f", { defaultValue: "📺 720p is the ceiling — 480p for speed" }),
      ];
    },
  },
  'seedance-2.0-fast': {
    id: 'seedance-2.0-fast',
    name: 'Seedance 2.0 Fast',
    get description() { return _translateCopy("copy.f4a56d3cb00f", { defaultValue: "Faster generation, slightly lower quality" }); },
    supports: ['text-to-video', 'image-to-video'],
    duration: '4-15s',
    tier: 'standard',
    emoji: '⚡',
    baseCostUsd: 0.80,
    perSecondCostUsd: 0.16,
    defaultDuration: 5,
    minDuration: 4,
    maxDuration: 15,
    hasAudio: true,
    supportsNegativePrompt: true,
    supportsResolution: true,
    provider: 'fal',
    supportsReferenceImages: true,
    maxReferenceImages: 9,
    supportsEndFrame: true,
    supportsAudioInput: true,
    supportsVideoInput: true,
    supportsSeed: true,
    aspectRatios: ['16:9', '9:16', '1:1'],
    get tips() {
      return [
        _translateCopy("copy.be205011d048", { defaultValue: "⚡ Same features as Seedance 2.0 but faster & cheaper" }),
        _translateCopy("copy.bd98369b2f2c", { defaultValue: "👤 Upload face photos for character consistency" }),
        _translateCopy("copy.cec7465fbd73", { defaultValue: "🎵 Upload audio for lip-sync animation" }),
        _translateCopy("copy.5458c46e4c3d", { defaultValue: "🎬 Set start + end frames for controlled transitions" }),
        _translateCopy("copy.265a1587a724", { defaultValue: "🔁 Lock a seed to iterate without randomness" }),
      ];
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Expanded catalogue.
  //
  // Every price below is the rate of the provider the job actually runs on —
  // kie.ai where generate-video routes there (Veo, Kling, Seedance, Wan),
  // fal.ai for the rest — expressed on the basis that provider bills. Where
  // billing is per second the model carries perSecondCostUsd, so a 15s render
  // is not sold at the 5s price; the Veos are flat per video on kie, so they
  // deliberately carry no perSecondCostUsd. The default 20% markup — or the
  // model's VIDEO_MARKUP_OVERRIDES band — is applied on top by getVideoCostUsd.
  // ─────────────────────────────────────────────────────────────────────────
  'veo-3.1': {
    id: 'veo-3.1',
    name: 'Veo 3.1',
    get description() { return _translateCopy("copy.8e831aaaa051", { defaultValue: "Google flagship, ultra-realistic with audio" }); },
    supports: ['text-to-video', 'image-to-video'],
    duration: '4-8s',
    tier: 'premium',
    emoji: '🎥',
    // kie.ai bills Veo flat per video, so there is no perSecondCostUsd here.
    baseCostUsd: 1.275,
    defaultDuration: 4,
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8],
    hasAudio: true,
    supportsResolution: true,
    resolutions: ['720p', '1080p'],
    provider: 'fal',
    aspectRatios: ['16:9', '9:16'],
    get tips() {
      return [
        _translateCopy("copy.a46573483313", { defaultValue: "🎥 The most convincing realism available, with native audio" }),
        _translateCopy("copy.2a0b2a2c6dc1", { defaultValue: "🖼️ Attach an image to animate it" }),
        _translateCopy("copy.ef7a51cc6c7f", { defaultValue: "💸 One flat price whatever the length — 8s costs the same as 4s" }),
        _translateCopy("copy.bba4b4b1c9c1", { defaultValue: "📺 Worth running at 1080p" }),
      ];
    },
  },
  'veo-3.1-fast': {
    id: 'veo-3.1-fast',
    name: 'Veo 3.1 Fast',
    get description() { return _translateCopy("copy.d593de2ed999", { defaultValue: "Veo look, a quarter of the price" }); },
    supports: ['text-to-video', 'image-to-video'],
    duration: '4-8s',
    tier: 'standard',
    emoji: '⚡',
    // kie.ai bills Veo flat per video, so there is no perSecondCostUsd here.
    baseCostUsd: 0.325,
    defaultDuration: 4,
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8],
    hasAudio: true,
    supportsResolution: true,
    resolutions: ['720p', '1080p'],
    provider: 'fal',
    aspectRatios: ['16:9', '9:16'],
    get tips() {
      return [
        _translateCopy("copy.6ea7b41550d1", { defaultValue: "⚡ Where to start on Veo — iterate here, finish on 3.1" }),
        _translateCopy("copy.2a0b2a2c6dc1", { defaultValue: "🖼️ Attach an image to animate it" }),
        _translateCopy("copy.be567a4c5484", { defaultValue: "🔊 Native audio included" }),
      ];
    },
  },
  'kling-3.0': {
    id: 'kling-3.0',
    name: 'Kling 3.0 Pro',
    get description() { return _translateCopy("copy.e2741c299499", { defaultValue: "Multi-shot, audio sync, long takes" }); },
    supports: ['text-to-video', 'image-to-video'],
    duration: '3-15s',
    tier: 'premium',
    emoji: '🎞️',
    // kie.ai's pro-with-audio rate, where this now renders.
    baseCostUsd: 0.675,
    perSecondCostUsd: 0.135,
    defaultDuration: 5,
    minDuration: 3,
    maxDuration: 15,
    hasAudio: true,
    supportsNegativePrompt: true,
    provider: 'fal',
    aspectRatios: ['16:9', '9:16', '1:1'],
    get tips() {
      return [
        _translateCopy("copy.46a61505dcff", { defaultValue: "🎞️ Holds a shot together over longer durations than most" }),
        _translateCopy("copy.2a0b2a2c6dc1", { defaultValue: "🖼️ Attach an image to animate it" }),
        _translateCopy("copy.5493bc5ab5d9", { defaultValue: "⏱️ Up to 15 seconds in one generation" }),
        _translateCopy("copy.45959396fd77", { defaultValue: "🎯 Negative prompts work well here" }),
      ];
    },
  },
  'kling-3.0-standard': {
    id: 'kling-3.0-standard',
    name: 'Kling 3.0 Standard',
    get description() { return _translateCopy("copy.b50840a8facb", { defaultValue: "Same model, lighter render tier" }); },
    supports: ['text-to-video', 'image-to-video'],
    duration: '3-15s',
    tier: 'standard',
    emoji: '🎬',
    // kie.ai's std-with-audio rate, where this now renders.
    baseCostUsd: 0.5,
    perSecondCostUsd: 0.1,
    defaultDuration: 5,
    minDuration: 3,
    maxDuration: 15,
    hasAudio: true,
    supportsNegativePrompt: true,
    provider: 'fal',
    aspectRatios: ['16:9', '9:16', '1:1'],
    get tips() {
      return [
        _translateCopy("copy.d7b0416afe3d", { defaultValue: "🎬 Kling 3.0 at three quarters the price" }),
        _translateCopy("copy.2a0b2a2c6dc1", { defaultValue: "🖼️ Attach an image to animate it" }),
        _translateCopy("copy.9bbdb1635108", { defaultValue: "⏱️ Up to 15 seconds" }),
      ];
    },
  },
  'kling-2.5-turbo': {
    id: 'kling-2.5-turbo',
    name: 'Kling 2.5 Turbo Pro',
    get description() { return _translateCopy("copy.ea5e0b780f7b", { defaultValue: "Fluid motion and tight prompt precision, no audio" }); },
    supports: ['text-to-video', 'image-to-video'],
    duration: '5s or 10s',
    tier: 'standard',
    emoji: '🌪️',
    // kie.ai's rate: $0.21 for 5s at the same $0.042/s throughout.
    baseCostUsd: 0.21,
    perSecondCostUsd: 0.042,
    defaultDuration: 5,
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 10],
    supportsNegativePrompt: true,
    provider: 'fal',
    aspectRatios: ['16:9', '9:16', '1:1'],
    get tips() {
      return [
        _translateCopy("copy.c58d818026c4", { defaultValue: "🌪️ Smoothest motion of the cheap tiers" }),
        _translateCopy("copy.2a0b2a2c6dc1", { defaultValue: "🖼️ Attach an image to animate it" }),
        _translateCopy("copy.c3a2370d7310", { defaultValue: "🔇 No audio on this one — use Kling 3.0 or Seedance if you need it" }),
        _translateCopy("copy.25892e077570", { defaultValue: "🎯 Negative prompts are honoured" }),
      ];
    },
  },
  'hailuo-2.3': {
    id: 'hailuo-2.3',
    name: 'MiniMax Hailuo 2.3',
    get description() { return _translateCopy("copy.c1cc166082bf", { defaultValue: "Natural physics and facial emotion" }); },
    supports: ['text-to-video', 'image-to-video'],
    duration: '6s',
    tier: 'premium',
    emoji: '🌀',
    baseCostUsd: 0.49,
    provider: 'fal',
    aspectRatios: ['16:9', '9:16', '1:1'],
    get tips() {
      return [
        _translateCopy("copy.9b4a676d824a", { defaultValue: "🌀 Best-in-class body mechanics and sense of weight" }),
        _translateCopy("copy.e07101e47c58", { defaultValue: "😀 Strong facial performance — good for characters" }),
        _translateCopy("copy.2a0b2a2c6dc1", { defaultValue: "🖼️ Attach an image to animate it" }),
      ];
    },
  },
  'hailuo-2.3-fast': {
    id: 'hailuo-2.3-fast',
    name: 'Hailuo 2.3 Fast',
    get description() { return _translateCopy("copy.970971377727", { defaultValue: "Quicker, cheaper Hailuo" }); },
    supports: ['image-to-video'],
    duration: '6s',
    tier: 'standard',
    emoji: '💨',
    baseCostUsd: 0.33,
    provider: 'fal',
    aspectRatios: ['16:9', '9:16', '1:1'],
    get tips() {
      return [
        _translateCopy("copy.70c8bb68d882", { defaultValue: "💨 Same physics, faster turnaround" }),
        _translateCopy("copy.5139cfcbeae0", { defaultValue: "🖼️ Requires an image — attach one to animate" }),
      ];
    },
  },
  'wan-2.6': {
    id: 'wan-2.6',
    name: 'Wan 2.6',
    get description() { return _translateCopy("copy.cc65f4a45ebf", { defaultValue: "Character-consistent with synced audio" }); },
    supports: ['image-to-video'],
    duration: '5-10s',
    tier: 'premium',
    emoji: '🎭',
    // kie.ai's 1080p ceiling — 720p renders cost us a third less than this.
    baseCostUsd: 0.525,
    perSecondCostUsd: 0.105,
    defaultDuration: 5,
    minDuration: 5,
    maxDuration: 15,
    allowedDurations: [5, 10, 15],
    hasAudio: true,
    supportsResolution: true,
    provider: 'fal',
    aspectRatios: ['16:9', '9:16', '1:1'],
    get tips() {
      return [
        _translateCopy("copy.445309f6cea6", { defaultValue: "🎭 Holds a character’s identity across the whole clip" }),
        _translateCopy("copy.5139cfcbeae0", { defaultValue: "🖼️ Requires an image — attach one to animate" }),
        _translateCopy("copy.1c5dd60a911b", { defaultValue: "🔊 Audio is generated in sync" }),
        _translateCopy("copy.4016dc0dc4f9", { defaultValue: "📺 720p or 1080p only on this one" }),
      ];
    },
  },
  'wan-2.5': {
    id: 'wan-2.5',
    name: 'Wan 2.5',
    get description() { return _translateCopy("copy.a525541f3e90", { defaultValue: "Open-weight, stylised and experimental" }); },
    supports: ['text-to-video', 'image-to-video'],
    duration: '5-10s',
    tier: 'standard',
    emoji: '🌈',
    // kie.ai's 1080p ceiling — 720p renders cost us 40% less than this.
    baseCostUsd: 0.5,
    perSecondCostUsd: 0.1,
    defaultDuration: 5,
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 10],
    supportsResolution: true,
    resolutions: ['720p', '1080p'],
    supportsNegativePrompt: true,
    provider: 'fal',
    aspectRatios: ['16:9', '9:16', '1:1'],
    get tips() {
      return [
        _translateCopy("copy.e45c8c46328a", { defaultValue: "🌈 Leans stylised rather than photoreal" }),
        _translateCopy("copy.2a0b2a2c6dc1", { defaultValue: "🖼️ Attach an image to animate it" }),
      ];
    },
  },
  'luma-ray2-flash': {
    id: 'luma-ray2-flash',
    name: 'Luma Ray 2 Flash',
    get description() { return _translateCopy("copy.18ecea8f32e4", { defaultValue: "Dreamy Luma aesthetic, budget tier" }); },
    supports: ['text-to-video', 'image-to-video'],
    duration: '5s',
    tier: 'fast',
    emoji: '✨',
    baseCostUsd: 0.2,
    defaultDuration: 5,
    minDuration: 5,
    maxDuration: 9,
    allowedDurations: [5, 9],
    provider: 'fal',
    // Ray 2 accepts no 1:1 — offering it would 422 after payment.
    aspectRatios: ['16:9', '9:16', '4:3', '3:4', '21:9', '9:21'],
    get tips() {
      return [
        _translateCopy("copy.753106470b0a", { defaultValue: "✨ Great for abstract, surreal and nature scenes" }),
        _translateCopy("copy.2a0b2a2c6dc1", { defaultValue: "🖼️ Attach an image to animate it" }),
        _translateCopy("copy.7e59061caf0d", { defaultValue: "💰 A quarter the price of full Ray 2" }),
      ];
    },
  },
  'pixverse-v5': {
    id: 'pixverse-v5',
    name: 'PixVerse V5',
    get description() { return _translateCopy("copy.b19b2e83cbb1", { defaultValue: "Stylised and anime-leaning motion" }); },
    supports: ['text-to-video', 'image-to-video'],
    duration: '5-8s',
    tier: 'standard',
    emoji: '🎨',
    baseCostUsd: 0.2,
    defaultDuration: 5,
    minDuration: 5,
    maxDuration: 8,
    allowedDurations: [5, 8],
    supportsResolution: true,
    supportsNegativePrompt: true,
    provider: 'fal',
    aspectRatios: ['16:9', '9:16', '1:1'],
    get tips() {
      return [
        _translateCopy("copy.5bbdbab529c3", { defaultValue: "🎨 The one to reach for on anime and illustrated looks" }),
        _translateCopy("copy.2a0b2a2c6dc1", { defaultValue: "🖼️ Attach an image to animate it" }),
        _translateCopy("copy.2ae698f884fb", { defaultValue: "⏱️ 8s costs double 5s" }),
      ];
    },
  },
  'ltx-13b': {
    id: 'ltx-13b',
    name: 'LTX Video 13B',
    get description() { return _translateCopy("copy.d2847c1435c7", { defaultValue: "Cheapest per second, fast drafts" }); },
    supports: ['text-to-video', 'image-to-video'],
    duration: '5-10s',
    tier: 'fast',
    emoji: '🪶',
    baseCostUsd: 0.1,
    perSecondCostUsd: 0.02,
    defaultDuration: 5,
    minDuration: 5,
    maxDuration: 10,
    supportsSeed: true,
    supportsNegativePrompt: true,
    provider: 'fal',
    // LTX tops out at 720p, so no resolution chip — it would offer a 1080p
    // this model cannot produce.
    aspectRatios: ['16:9', '9:16', '1:1'],
    get tips() {
      return [
        _translateCopy("copy.08166df65da6", { defaultValue: "🪶 By far the cheapest way to test an idea" }),
        _translateCopy("copy.d3d91f0a3b47", { defaultValue: "🔁 Lock a seed and iterate on the same scene" }),
        _translateCopy("copy.2a0b2a2c6dc1", { defaultValue: "🖼️ Attach an image to animate it" }),
      ];
    },
  },
};

/**
 * Nearest legal duration for a model, rounding down so nobody is charged for
 * more than the provider will render. Free-range models are returned clamped.
 */
export const snapVideoDuration = (model: VideoModel, seconds: number): number => {
  const allowed = model.allowedDurations;
  if (!allowed?.length) {
    return Math.min(model.maxDuration ?? seconds, Math.max(model.minDuration ?? seconds, seconds));
  }
  const eligible = allowed.filter((a) => a <= seconds);
  return eligible.length ? Math.max(...eligible) : Math.min(...allowed);
};

export const VIDEO_MODEL_OPTIONS = Object.values(VIDEO_MODELS);
export type VideoModelKey = keyof typeof VIDEO_MODELS;
