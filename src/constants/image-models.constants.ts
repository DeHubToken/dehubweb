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
  /**
   * Whether the model can take an attached image as an edit reference.
   *
   * Defaults to true. The ones set false have no edit endpoint at all, so
   * generate-image rejects the request — which, without this, only happened
   * after the DHB had already been spent.
   */
  supportsEdit?: boolean;
}

/** Whether a reference image can be handed to this model. */
export const imageModelSupportsEdit = (model: ImageModel): boolean =>
  model.supportsEdit !== false;

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
  'gemini-3.1-flash-image': {
    id: 'gemini-3.1-flash-image',
    name: 'Nano Banana 2',
    description: 'Fast brand image generation',
    emoji: '🍌',
    tier: 'fast',
    baseCostUsd: 0.01,
  },
  'gemini-3-pro-image': {
    id: 'gemini-3-pro-image',
    name: 'Gemini 3 Pro',
    description: 'Latest, highest quality',
    emoji: '✨',
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

  // ─────────────────────────────────────────────────────────────────────────
  // Expanded catalogue, all on fal.ai.
  //
  // Prices were read off each model's own fal.ai page. Where fal bills per
  // megapixel the figure below covers a single ~1 MP image, which is what the
  // studio requests — keep the size defaults in generate-image in step with it,
  // because a 4 MP output costs fal four times what this collects.
  // ─────────────────────────────────────────────────────────────────────────
  'nano-banana-pro': {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    description: 'Best-in-class text and diagrams',
    emoji: '🍌',
    tier: 'premium',
    baseCostUsd: 0.15,
  },
  'nano-banana-2': {
    id: 'nano-banana-2',
    name: 'Nano Banana 2',
    description: 'Fast, photoreal, very versatile',
    emoji: '🍌',
    tier: 'standard',
    baseCostUsd: 0.08,
  },
  'seedream-v4.5': {
    id: 'seedream-v4.5',
    name: 'Seedream 4.5',
    description: 'Precise control and transformations',
    emoji: '🌊',
    tier: 'standard',
    baseCostUsd: 0.04,
  },
  'flux-2-pro': {
    id: 'flux-2-pro',
    name: 'FLUX.2 Pro',
    description: 'Exceptional prompt adherence',
    emoji: '⚡',
    tier: 'standard',
    baseCostUsd: 0.03,
  },
  'flux-kontext-max': {
    id: 'flux-kontext-max',
    name: 'FLUX Kontext Max',
    description: 'Context-aware editing and style transfer',
    emoji: '🎛️',
    tier: 'premium',
    baseCostUsd: 0.08,
  },
  'flux-2-flex': {
    id: 'flux-2-flex',
    name: 'FLUX.2 Flex',
    description: 'Tunable steps and guidance for fine control',
    emoji: '🎚️',
    tier: 'standard',
    // $0.05 per megapixel, rounded up — the studio requests a single one.
    baseCostUsd: 0.05,
    supportsEdit: false,
  },
  'z-image-turbo': {
    id: 'z-image-turbo',
    name: 'Z-Image Turbo',
    description: 'Near-instant drafts at the lowest price here',
    emoji: '🪄',
    tier: 'fast',
    // $0.005 per megapixel; rounded up to stay clear of the rounding boundary.
    baseCostUsd: 0.006,
    supportsEdit: false,
  },
  'recraft-v4.1': {
    id: 'recraft-v4.1',
    name: 'Recraft V4.1',
    description: 'Brand-grade illustration and layout',
    emoji: '🎨',
    tier: 'standard',
    baseCostUsd: 0.035,
    supportsEdit: false,
  },
  'recraft-v4.1-vector': {
    id: 'recraft-v4.1-vector',
    name: 'Recraft Vector',
    description: 'True SVG logos and icons',
    emoji: '📐',
    tier: 'standard',
    baseCostUsd: 0.08,
    supportsEdit: false,
  },
  'ideogram-v3': {
    id: 'ideogram-v3',
    name: 'Ideogram V3',
    description: 'Strongest typography in a poster',
    emoji: '🔤',
    tier: 'standard',
    baseCostUsd: 0.06,
  },
  'qwen-image': {
    id: 'qwen-image',
    name: 'Qwen Image',
    description: 'Cheapest solid all-rounder',
    emoji: '🪶',
    tier: 'fast',
    baseCostUsd: 0.02,
  },
  'grok-imagine': {
    id: 'grok-imagine',
    name: 'Grok Imagine',
    description: 'Expressive, high-contrast, bold',
    emoji: '🔮',
    tier: 'fast',
    baseCostUsd: 0.02,
  },
};

export const IMAGE_MODEL_OPTIONS = Object.values(IMAGE_MODELS);
export type ImageModelKey = keyof typeof IMAGE_MODELS;
