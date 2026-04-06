/**
 * fal.ai AI Tools Configuration
 * All tools use DHB pay-per-use with 100% markup
 */

export interface AiToolModel {
  id: string;
  tool: string; // edge function tool key
  name: string;
  description: string;
  emoji: string;
  category: AiToolCategory;
  tier: 'premium' | 'standard' | 'fast';
  /** Base cost in USD (before markup) */
  baseCostUsd: number;
  /** Whether the tool requires an image input */
  requiresImage?: boolean;
  /** Whether the tool requires audio input */
  requiresAudio?: boolean;
}

export type AiToolCategory = 'music' | 'music-video' | 'tts' | 'background-removal' | 'upscale' | 'speech-to-text';

/**
 * Markup percentage (100% = 2x cost)
 */
export const AI_TOOLS_MARKUP = 1.0;

export const getToolCostUsd = (model: AiToolModel): number => {
  return model.baseCostUsd * (1 + AI_TOOLS_MARKUP);
};

export const getToolCostDhb = (model: AiToolModel, dhbPriceUsd: number): number => {
  if (dhbPriceUsd <= 0) return 0;
  return getToolCostUsd(model) / dhbPriceUsd;
};

export const AI_TOOL_MODELS: Record<string, AiToolModel> = {
  // ─── Music Generation ───
  'minimax-music': {
    id: 'minimax-music',
    tool: 'minimax-music',
    name: 'MiniMax Music 2.0',
    description: 'Full songs with lyrics & vocals',
    emoji: '🎵',
    category: 'music',
    tier: 'premium',
    baseCostUsd: 0.165,
  },
  'ace-step': {
    id: 'ace-step',
    tool: 'ace-step',
    name: 'ACE-Step',
    description: 'Fast music, great for instrumentals',
    emoji: '🎶',
    category: 'music',
    tier: 'standard',
    baseCostUsd: 0.05,
  },

  // ─── Music Video (Music + Video combined) ───
  'music-video-standard': {
    id: 'music-video-standard',
    tool: 'music-video-standard',
    name: 'Music Video (Standard)',
    description: 'MiniMax Music + Minimax Video',
    emoji: '🎬',
    category: 'music-video',
    tier: 'standard',
    baseCostUsd: 0.385, // music $0.165 + video $0.22
  },
  'music-video-premium': {
    id: 'music-video-premium',
    tool: 'music-video-premium',
    name: 'Music Video (Premium)',
    description: 'MiniMax Music + Seedance 2.0',
    emoji: '🎬',
    category: 'music-video',
    tier: 'premium',
    baseCostUsd: 0.865, // music $0.165 + video $0.70
  },

  // ─── Text-to-Speech ───
  'dia-tts': {
    id: 'dia-tts',
    tool: 'dia-tts',
    name: 'Dia TTS',
    description: 'Ultra-realistic dialogue & speech',
    emoji: '🗣️',
    category: 'tts',
    tier: 'premium',
    baseCostUsd: 0.04,
  },

  // ─── Background Removal ───
  'birefnet': {
    id: 'birefnet',
    tool: 'birefnet',
    name: 'BiRefNet',
    description: 'Professional background removal',
    emoji: '✂️',
    category: 'background-removal',
    tier: 'fast',
    baseCostUsd: 0.02,
    requiresImage: true,
  },

  // ─── Image Upscaling ───
  'creative-upscaler': {
    id: 'creative-upscaler',
    tool: 'creative-upscaler',
    name: 'Creative Upscaler',
    description: 'AI-enhanced upscaling with detail',
    emoji: '🔍',
    category: 'upscale',
    tier: 'premium',
    baseCostUsd: 0.08,
    requiresImage: true,
  },
  'aura-sr': {
    id: 'aura-sr',
    tool: 'aura-sr',
    name: 'AuraSR',
    description: 'Fast 4x upscale',
    emoji: '⚡',
    category: 'upscale',
    tier: 'fast',
    baseCostUsd: 0.04,
    requiresImage: true,
  },

  // ─── Speech-to-Text ───
  'whisper': {
    id: 'whisper',
    tool: 'whisper',
    name: 'Whisper',
    description: 'Speech transcription & translation',
    emoji: '📝',
    category: 'speech-to-text',
    tier: 'standard',
    baseCostUsd: 0.03,
    requiresAudio: true,
  },
};

export const AI_TOOL_OPTIONS = Object.values(AI_TOOL_MODELS);

export const getToolsByCategory = (category: AiToolCategory): AiToolModel[] =>
  AI_TOOL_OPTIONS.filter(t => t.category === category);

export const CATEGORY_LABELS: Record<AiToolCategory, { label: string; emoji: string; color: string }> = {
  'music': { label: 'Music Generation', emoji: '🎵', color: 'purple' },
  'music-video': { label: 'Music Video', emoji: '🎬', color: 'purple' },
  'tts': { label: 'Text-to-Speech', emoji: '🗣️', color: 'cyan' },
  'background-removal': { label: 'Background Removal', emoji: '✂️', color: 'green' },
  'upscale': { label: 'Image Upscaling', emoji: '🔍', color: 'amber' },
  'speech-to-text': { label: 'Speech-to-Text', emoji: '📝', color: 'blue' },
};
