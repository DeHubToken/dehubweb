import { translateCopy as _translateCopy } from '@/i18n/copy';
/**
 * fal.ai AI Tools Configuration
 * All tools use DHB pay-per-use with 20% markup
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

export type AiToolCategory = 'music' | 'tts' | 'background-removal' | 'upscale' | 'speech-to-text';

/**
 * Markup percentage (20% = 1.2x cost)
 */
export const AI_TOOLS_MARKUP = 0.2;

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
    get description() { return _translateCopy("copy.3356505b6f4d", { defaultValue: "Full songs with lyrics & vocals" }); },
    emoji: '🎵',
    category: 'music',
    tier: 'premium',
    baseCostUsd: 0.165,
  },
  'ace-step': {
    id: 'ace-step',
    tool: 'ace-step',
    name: 'ACE-Step',
    get description() { return _translateCopy("copy.fab618372ef2", { defaultValue: "Fast music, great for instrumentals" }); },
    emoji: '🎶',
    category: 'music',
    tier: 'standard',
    baseCostUsd: 0.05,
  },


  // ─── Text-to-Speech ───
  'dia-tts': {
    id: 'dia-tts',
    tool: 'dia-tts',
    name: 'Dia TTS',
    get description() { return _translateCopy("copy.1edd473d8b41", { defaultValue: "Ultra-realistic dialogue & speech" }); },
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
    get description() { return _translateCopy("copy.48e13842b229", { defaultValue: "Professional background removal" }); },
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
    get description() { return _translateCopy("copy.1429fb35f906", { defaultValue: "AI-enhanced upscaling with detail" }); },
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
    get description() { return _translateCopy("copy.a335fa862609", { defaultValue: "Fast 4x upscale" }); },
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
    get description() { return _translateCopy("copy.358036e013da", { defaultValue: "Speech transcription & translation" }); },
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
  'music': { get label() { return _translateCopy("copy.36d88ed6cc91", { defaultValue: "Music Generation" }); }, emoji: '🎵', color: 'purple' },
  
  'tts': { get label() { return _translateCopy("copy.06a2701c2a41", { defaultValue: "Text-to-Speech" }); }, emoji: '🗣️', color: 'cyan' },
  'background-removal': { get label() { return _translateCopy("copy.f9d28d822e34", { defaultValue: "Background Removal" }); }, emoji: '✂️', color: 'green' },
  'upscale': { get label() { return _translateCopy("copy.dfd86b92431f", { defaultValue: "Image Upscaling" }); }, emoji: '🔍', color: 'amber' },
  'speech-to-text': { get label() { return _translateCopy("copy.abfe6d40e5fc", { defaultValue: "Speech-to-Text" }); }, emoji: '📝', color: 'blue' },
};
