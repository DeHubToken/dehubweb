/**
 * Video Generation Models Configuration
 * Premium models available via Replicate API
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
  /** Whether the model supports native audio generation */
  hasAudio?: boolean;
  /** Whether the model supports negative prompts */
  supportsNegativePrompt?: boolean;
  /** Whether the model supports resolution selection */
  supportsResolution?: boolean;
  /** Provider for the model (defaults to 'replicate') */
  provider?: 'replicate' | 'fal';
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
    baseCostUsd: 1.10, // Average of 5s ($0.80) and 10s ($1.40)
    hasAudio: true,
  },
  'luma-ray2': {
    id: 'luma-ray2',
    name: 'Luma Ray 2',
    description: 'Photorealistic, dreamy aesthetic (720p)',
    supports: ['text-to-video'],
    duration: '5s',
    tier: 'premium',
    emoji: '✨',
    baseCostUsd: 0.65, // ~$0.50-0.80 average
  },
  'runway-gen4': {
    id: 'runway-gen4',
    name: 'Runway Gen-4 Turbo',
    description: 'Animate images (requires image)',
    supports: ['image-to-video'],
    duration: '10s',
    tier: 'premium',
    emoji: '🚀',
    baseCostUsd: 0.50, // $0.50 for 10s
  },
  'minimax-video': {
    id: 'minimax-video',
    name: 'Minimax Video-01',
    description: 'Fast generation, great quality',
    supports: ['text-to-video', 'image-to-video'],
    duration: '6s',
    tier: 'standard',
    emoji: '⚡',
    baseCostUsd: 0.22, // ~$0.15-0.30 average
  },
  'ltx-video': {
    id: 'ltx-video',
    name: 'LTX Video',
    description: 'Fast and efficient',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5s',
    tier: 'fast',
    emoji: '💨',
    baseCostUsd: 0.085, // ~$0.085
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
  },
  'seedance-2.0': {
    id: 'seedance-2.0',
    name: 'Seedance 2.0',
    description: 'Latest ByteDance model, superior quality & audio',
    supports: ['text-to-video', 'image-to-video'],
    duration: '4-15s',
    tier: 'premium',
    emoji: '🌊',
    baseCostUsd: 1.55, // fallback for 5s
    perSecondCostUsd: 0.31,
    defaultDuration: 5,
    minDuration: 4,
    maxDuration: 15,
    hasAudio: true,
    supportsNegativePrompt: true,
    supportsResolution: true,
    provider: 'fal',
  },
};

export const VIDEO_MODEL_OPTIONS = Object.values(VIDEO_MODELS);
export type VideoModelKey = keyof typeof VIDEO_MODELS;
