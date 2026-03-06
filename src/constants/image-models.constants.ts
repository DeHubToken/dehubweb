/**
 * Image Generation Models Configuration
 */

export interface ImageModel {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tier: 'premium' | 'standard' | 'fast';
  /** Base cost in USD (before markup) */
  baseCostUsd: number;
}

/**
 * Markup percentage for image generation (100% = 2x cost)
 */
export const IMAGE_GENERATION_MARKUP = 1.0; // 100% markup

/**
 * Calculate the final cost in USD with markup
 */
export const getImageCostUsd = (model: ImageModel): number => {
  return model.baseCostUsd * (1 + IMAGE_GENERATION_MARKUP);
};

/**
 * Calculate the cost in DHB tokens
 */
export const getImageCostDhb = (model: ImageModel, dhbPriceUsd: number): number => {
  if (dhbPriceUsd <= 0) return 0;
  const costUsd = getImageCostUsd(model);
  return costUsd / dhbPriceUsd;
};

export const IMAGE_MODELS: Record<string, ImageModel> = {
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Fast, balanced quality',
    emoji: '⚡',
    tier: 'fast',
    baseCostUsd: 0.02,
  },
  'gemini-3-pro-image': {
    id: 'gemini-3-pro-image',
    name: 'Gemini 3 Pro',
    description: 'Latest, highest quality',
    emoji: '✨',
    tier: 'premium',
    baseCostUsd: 0.08,
  },
  'gpt-5': {
    id: 'gpt-5',
    name: 'GPT-5',
    description: 'OpenAI creative aesthetic',
    emoji: '🎨',
    tier: 'premium',
    baseCostUsd: 0.08,
  },
  'grok-2-image': {
    id: 'grok-2-image',
    name: 'Grok Aurora',
    description: 'xAI image generation',
    emoji: '🔮',
    tier: 'premium',
    baseCostUsd: 0.06,
  },
};

export const IMAGE_MODEL_OPTIONS = Object.values(IMAGE_MODELS);
export type ImageModelKey = keyof typeof IMAGE_MODELS;
