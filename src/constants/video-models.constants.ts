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
}

export const VIDEO_MODELS: Record<string, VideoModel> = {
  'kling-2.6-pro': {
    id: 'kling-2.6-pro',
    name: 'Kling 2.6 Pro',
    description: 'Top-tier cinematic with native audio',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5-10s',
    tier: 'premium',
    emoji: '🎬',
  },
  'luma-ray2': {
    id: 'luma-ray2',
    name: 'Luma Ray 2',
    description: 'Photorealistic, dreamy aesthetic (720p)',
    supports: ['text-to-video'],
    duration: '5s',
    tier: 'premium',
    emoji: '✨',
  },
  'runway-gen4': {
    id: 'runway-gen4',
    name: 'Runway Gen-4 Turbo',
    description: 'Animate images (requires image)',
    supports: ['image-to-video'],
    duration: '10s',
    tier: 'premium',
    emoji: '🚀',
  },
  'minimax-video': {
    id: 'minimax-video',
    name: 'Minimax Video-01',
    description: 'Fast generation, great quality',
    supports: ['text-to-video', 'image-to-video'],
    duration: '6s',
    tier: 'standard',
    emoji: '⚡',
  },
  'ltx-video': {
    id: 'ltx-video',
    name: 'LTX Video',
    description: 'Fast and efficient',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5s',
    tier: 'fast',
    emoji: '💨',
  },
};

export const VIDEO_MODEL_OPTIONS = Object.values(VIDEO_MODELS);
export type VideoModelKey = keyof typeof VIDEO_MODELS;
