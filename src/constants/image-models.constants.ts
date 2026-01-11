/**
 * Image Generation Models Configuration
 */

export interface ImageModel {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tier: 'premium' | 'standard' | 'fast';
}

export const IMAGE_MODELS: Record<string, ImageModel> = {
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Fast, balanced quality',
    emoji: '⚡',
    tier: 'fast',
  },
  'gemini-3-pro-image': {
    id: 'gemini-3-pro-image',
    name: 'Gemini 3 Pro',
    description: 'Latest, highest quality',
    emoji: '✨',
    tier: 'premium',
  },
  'gpt-5': {
    id: 'gpt-5',
    name: 'GPT-5',
    description: 'OpenAI creative aesthetic',
    emoji: '🎨',
    tier: 'premium',
  },
  'grok-2-image': {
    id: 'grok-2-image',
    name: 'Grok Aurora',
    description: 'xAI image generation',
    emoji: '🔮',
    tier: 'premium',
  },
};

export const IMAGE_MODEL_OPTIONS = Object.values(IMAGE_MODELS);
export type ImageModelKey = keyof typeof IMAGE_MODELS;
