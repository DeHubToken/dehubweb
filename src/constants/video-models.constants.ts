/**
 * Video Generation Models Configuration
 * Premium models available via Replicate API and fal.ai
 */

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
  /** Provider for the model (defaults to 'replicate') */
  provider?: 'replicate' | 'fal';
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
  /** Whether the model supports seed for reproducibility */
  supportsSeed?: boolean;
  /** Short tips/help for using this model effectively */
  tips?: string[];
  /** Available aspect ratios */
  aspectRatios?: string[];
}

/**
 * Markup percentage for video generation (100% = 2x cost)
 */
export const VIDEO_GENERATION_MARKUP = 1.0; // 100% markup

/**
 * Calculate the final cost in USD with markup
 */
export const getVideoCostUsd = (model: VideoModel, durationSeconds?: number): number => {
  if (model.perSecondCostUsd && durationSeconds) {
    return model.perSecondCostUsd * durationSeconds * (1 + VIDEO_GENERATION_MARKUP);
  }
  return model.baseCostUsd * (1 + VIDEO_GENERATION_MARKUP);
};

/**
 * Calculate the cost in DHB tokens
 */
export const getVideoCostDhb = (model: VideoModel, dhbPriceUsd: number, durationSeconds?: number): number => {
  if (dhbPriceUsd <= 0) return 0;
  const costUsd = getVideoCostUsd(model, durationSeconds);
  return costUsd / dhbPriceUsd;
};

export const VIDEO_MODELS: Record<string, VideoModel> = {
  'kling-2.6-pro': {
    id: 'kling-2.6-pro',
    name: 'Kling 2.6 Pro',
    description: 'Top-tier cinematic with native audio',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5-10s',
    tier: 'premium',
    emoji: '🎬',
    baseCostUsd: 1.10,
    hasAudio: true,
    minDuration: 5,
    maxDuration: 10,
    defaultDuration: 5,
    supportsNegativePrompt: true,
    supportsSeed: true,
    aspectRatios: ['16:9', '9:16', '1:1'],
    tips: [
      '🎬 Best for cinematic, high-fidelity scenes',
      '🖼️ Attach an image to animate it into a video',
      '🔇 Generates native audio automatically',
      '⏱️ 10s duration gives smoother motion arcs',
      '🎯 Use negative prompts to avoid unwanted elements',
    ],
  },
  'luma-ray2': {
    id: 'luma-ray2',
    name: 'Luma Ray 2',
    description: 'Photorealistic, dreamy aesthetic (720p)',
    supports: ['text-to-video'],
    duration: '5s',
    tier: 'premium',
    emoji: '✨',
    baseCostUsd: 0.65,
    aspectRatios: ['16:9', '9:16', '1:1', '3:4', '4:3'],
    tips: [
      '✨ Excels at dreamy, artistic aesthetics',
      '📝 Text-to-video only — describe your scene vividly',
      '🎨 Great for abstract, surreal, or nature scenes',
      '📐 Try different aspect ratios for variety',
    ],
  },
  'runway-gen4': {
    id: 'runway-gen4',
    name: 'Runway Gen-4 Turbo',
    description: 'Animate images (requires image)',
    supports: ['image-to-video'],
    duration: '5-10s',
    tier: 'premium',
    emoji: '🚀',
    baseCostUsd: 0.50,
    minDuration: 5,
    maxDuration: 10,
    defaultDuration: 10,
    aspectRatios: ['16:9', '9:16', '1:1'],
    tips: [
      '🖼️ Requires an image — attach one to animate it',
      '🚀 Best-in-class image animation quality',
      '📸 Works great with photos, illustrations, AI art',
      '💡 Describe the motion you want in your prompt',
    ],
  },
  'minimax-video': {
    id: 'minimax-video',
    name: 'Minimax Video-01',
    description: 'Fast generation, great quality',
    supports: ['text-to-video', 'image-to-video'],
    duration: '6s',
    tier: 'standard',
    emoji: '⚡',
    baseCostUsd: 0.22,
    tips: [
      '⚡ Fast generation at an affordable price',
      '🖼️ Attach an image for image-to-video mode',
      '📝 Keep prompts concise for best results',
      '💰 Great value for quick iterations',
    ],
  },
  'ltx-video': {
    id: 'ltx-video',
    name: 'LTX Video',
    description: 'Fast and efficient',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5s',
    tier: 'fast',
    emoji: '💨',
    baseCostUsd: 0.085,
    supportsSeed: true,
    supportsNegativePrompt: true,
    tips: [
      '💨 Fastest & cheapest option for quick tests',
      '🔁 Use seed to iterate on the same scene',
      '🎯 Negative prompts help refine output',
      '💡 Perfect for rapid prototyping ideas',
    ],
  },
  'seedance-1.5-pro': {
    id: 'seedance-1.5-pro',
    name: 'Seedance 1.5 Pro',
    description: 'ByteDance cinematic with native audio',
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
    tips: [
      '🌊 Cinematic quality with native audio',
      '🖼️ Attach an image to animate it',
      '📺 Supports 720p resolution',
      '⏱️ Flexible 2-12s duration range',
      '🔁 Lock a seed for consistent iterations',
    ],
  },
  'seedance-2.0': {
    id: 'seedance-2.0',
    name: 'Seedance 2.0',
    description: 'Latest ByteDance model, superior quality & audio',
    supports: ['text-to-video', 'image-to-video'],
    duration: '4-15s',
    tier: 'premium',
    emoji: '🌊',
    baseCostUsd: 1.55,
    perSecondCostUsd: 0.31,
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
    tips: [
      '👤 Upload face photos for character consistency across videos',
      '🎵 Upload audio for lip-sync animation',
      '🎬 Set start + end frames for controlled transitions',
      '🎨 Upload a video to restyle it with a new prompt',
      '🔁 Lock a seed to iterate without randomness',
      '📺 1080p for maximum quality, 480p for speed',
    ],
  },
  'seedance-2.0-fast': {
    id: 'seedance-2.0-fast',
    name: 'Seedance 2.0 Fast',
    description: 'Faster generation, slightly lower quality',
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
    tips: [
      '⚡ Same features as Seedance 2.0 but faster & cheaper',
      '👤 Upload face photos for character consistency',
      '🎵 Upload audio for lip-sync animation',
      '🎬 Set start + end frames for controlled transitions',
      '🔁 Lock a seed to iterate without randomness',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Expanded catalogue, all on fal.ai.
  //
  // Every price below was read off that model's own fal.ai page and expressed
  // on the basis fal actually bills. Where fal bills per second the model
  // carries perSecondCostUsd, so a 15s render is not sold at the 5s price.
  // The shared 100% markup is applied on top by getVideoCostUsd.
  // ─────────────────────────────────────────────────────────────────────────
  'veo-3.1': {
    id: 'veo-3.1',
    name: 'Veo 3.1',
    description: 'Google flagship, ultra-realistic with audio',
    supports: ['text-to-video', 'image-to-video'],
    duration: '4-8s',
    tier: 'premium',
    emoji: '🎥',
    baseCostUsd: 2.0,
    perSecondCostUsd: 0.4,
    defaultDuration: 4,
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8],
    hasAudio: true,
    supportsResolution: true,
    provider: 'fal',
    aspectRatios: ['16:9', '9:16'],
    tips: [
      '🎥 The most convincing realism available, with native audio',
      '🖼️ Attach an image to animate it',
      '💸 Priced per second — 8s costs twice a 4s',
      '📺 Worth running at 1080p',
    ],
  },
  'veo-3.1-fast': {
    id: 'veo-3.1-fast',
    name: 'Veo 3.1 Fast',
    description: 'Veo look, a quarter of the price',
    supports: ['text-to-video', 'image-to-video'],
    duration: '4-8s',
    tier: 'standard',
    emoji: '⚡',
    baseCostUsd: 0.75,
    perSecondCostUsd: 0.15,
    defaultDuration: 4,
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8],
    hasAudio: true,
    supportsResolution: true,
    provider: 'fal',
    aspectRatios: ['16:9', '9:16'],
    tips: [
      '⚡ Where to start on Veo — iterate here, finish on 3.1',
      '🖼️ Attach an image to animate it',
      '🔊 Native audio included',
    ],
  },
  'kling-3.0': {
    id: 'kling-3.0',
    name: 'Kling 3.0 Pro',
    description: 'Multi-shot, audio sync, long takes',
    supports: ['text-to-video', 'image-to-video'],
    duration: '3-15s',
    tier: 'premium',
    emoji: '🎞️',
    baseCostUsd: 0.84,
    perSecondCostUsd: 0.168,
    defaultDuration: 5,
    minDuration: 3,
    maxDuration: 15,
    hasAudio: true,
    supportsNegativePrompt: true,
    provider: 'fal',
    aspectRatios: ['16:9', '9:16', '1:1'],
    tips: [
      '🎞️ Holds a shot together over longer durations than most',
      '🖼️ Attach an image to animate it',
      '⏱️ Up to 15 seconds in one generation',
      '🎯 Negative prompts work well here',
    ],
  },
  'kling-3.0-standard': {
    id: 'kling-3.0-standard',
    name: 'Kling 3.0 Standard',
    description: 'Same model, lighter render tier',
    supports: ['text-to-video', 'image-to-video'],
    duration: '3-15s',
    tier: 'standard',
    emoji: '🎬',
    baseCostUsd: 0.63,
    perSecondCostUsd: 0.126,
    defaultDuration: 5,
    minDuration: 3,
    maxDuration: 15,
    hasAudio: true,
    supportsNegativePrompt: true,
    provider: 'fal',
    aspectRatios: ['16:9', '9:16', '1:1'],
    tips: [
      '🎬 Kling 3.0 at three quarters the price',
      '🖼️ Attach an image to animate it',
      '⏱️ Up to 15 seconds',
    ],
  },
  'hailuo-2.3': {
    id: 'hailuo-2.3',
    name: 'MiniMax Hailuo 2.3',
    description: 'Natural physics and facial emotion',
    supports: ['text-to-video', 'image-to-video'],
    duration: '6s',
    tier: 'premium',
    emoji: '🌀',
    baseCostUsd: 0.49,
    provider: 'fal',
    aspectRatios: ['16:9', '9:16', '1:1'],
    tips: [
      '🌀 Best-in-class body mechanics and sense of weight',
      '😀 Strong facial performance — good for characters',
      '🖼️ Attach an image to animate it',
    ],
  },
  'hailuo-2.3-fast': {
    id: 'hailuo-2.3-fast',
    name: 'Hailuo 2.3 Fast',
    description: 'Quicker, cheaper Hailuo',
    supports: ['image-to-video'],
    duration: '6s',
    tier: 'standard',
    emoji: '💨',
    baseCostUsd: 0.33,
    provider: 'fal',
    aspectRatios: ['16:9', '9:16', '1:1'],
    tips: [
      '💨 Same physics, faster turnaround',
      '🖼️ Requires an image — attach one to animate',
    ],
  },
  'wan-2.6': {
    id: 'wan-2.6',
    name: 'Wan 2.6',
    description: 'Character-consistent with synced audio',
    supports: ['image-to-video'],
    duration: '5-10s',
    tier: 'premium',
    emoji: '🎭',
    baseCostUsd: 0.5,
    perSecondCostUsd: 0.1,
    defaultDuration: 5,
    minDuration: 5,
    maxDuration: 15,
    allowedDurations: [5, 10, 15],
    hasAudio: true,
    supportsResolution: true,
    provider: 'fal',
    aspectRatios: ['16:9', '9:16', '1:1'],
    tips: [
      '🎭 Holds a character’s identity across the whole clip',
      '🖼️ Requires an image — attach one to animate',
      '🔊 Audio is generated in sync',
      '📺 720p or 1080p only on this one',
    ],
  },
  'wan-2.5': {
    id: 'wan-2.5',
    name: 'Wan 2.5',
    description: 'Open-weight, stylised and experimental',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5-10s',
    tier: 'standard',
    emoji: '🌈',
    baseCostUsd: 0.5,
    perSecondCostUsd: 0.1,
    defaultDuration: 5,
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 10],
    supportsResolution: true,
    supportsNegativePrompt: true,
    provider: 'fal',
    aspectRatios: ['16:9', '9:16', '1:1'],
    tips: [
      '🌈 Leans stylised rather than photoreal',
      '🖼️ Attach an image to animate it',
      '💰 480p is a third of the 1080p price',
    ],
  },
  'luma-ray2-flash': {
    id: 'luma-ray2-flash',
    name: 'Luma Ray 2 Flash',
    description: 'Dreamy Luma aesthetic, budget tier',
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
    tips: [
      '✨ Great for abstract, surreal and nature scenes',
      '🖼️ Attach an image to animate it',
      '💰 A quarter the price of full Ray 2',
    ],
  },
  'pixverse-v5': {
    id: 'pixverse-v5',
    name: 'PixVerse V5',
    description: 'Stylised and anime-leaning motion',
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
    tips: [
      '🎨 The one to reach for on anime and illustrated looks',
      '🖼️ Attach an image to animate it',
      '⏱️ 8s costs double 5s',
    ],
  },
  'ltx-13b': {
    id: 'ltx-13b',
    name: 'LTX Video 13B',
    description: 'Cheapest per second, fast drafts',
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
    tips: [
      '🪶 By far the cheapest way to test an idea',
      '🔁 Lock a seed and iterate on the same scene',
      '🖼️ Attach an image to animate it',
    ],
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
