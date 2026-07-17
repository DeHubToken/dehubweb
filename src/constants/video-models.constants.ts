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
};

export const VIDEO_MODEL_OPTIONS = Object.values(VIDEO_MODELS);
export type VideoModelKey = keyof typeof VIDEO_MODELS;
