/**
 * AI generation pricing — the authoritative copy.
 * ==============================================
 * What a job costs is decided here, on the server, and the client is told the
 * answer rather than working it out for itself.
 *
 * That split matters. The client constants under src/constants/*.constants.ts
 * still carry a baseCostUsd for each model, but those numbers are display
 * metadata now: nothing charges from them. A Deno-style `.ts` import cannot be
 * pulled into src without tripping `allowImportingTsExtensions` in the build,
 * and CI here runs tsc only — it never runs vitest — so a "keep these two
 * tables in sync" test would sit there unexecuted while the tables drifted.
 * Quoting from one side removes the question.
 *
 * Prices are in DHB. Retail is provider cost x (1 + MARKUP), converted at the
 * gateway peg, which makes 1,000 DHB = $1 of generation.
 */

/** Sale price of one DHB, matching the fiat gateway peg. */
export const DHB_USD_PEG = 0.001;

/** 100% markup over provider cost, applied to every generation type. */
export const MARKUP = 1.0;

export type JobKind = 'image' | 'video' | 'model3d' | 'tool';
export type TextureQuality = 'none' | 'standard' | 'HD';

/** Provider cost per image, in USD. */
export const IMAGE_COST_USD: Record<string, number> = {
  'z-image-turbo': 0.006,
  'gemini-3.1-flash-image': 0.01,
  'gemini-2.5-flash': 0.02,
  'qwen-image': 0.02,
  'grok-imagine': 0.02,
  'flux-2-pro': 0.03,
  'recraft-v4.1': 0.035,
  'seedream-v4.5': 0.04,
  'flux-2-flex': 0.05,
  'grok-2-image': 0.06,
  'ideogram-v3': 0.06,
  'gemini-3-pro-image': 0.08,
  'nano-banana-2': 0.08,
  'flux-kontext-max': 0.08,
  'recraft-v4.1-vector': 0.08,
  'nano-banana-pro': 0.15,
};

/**
 * Provider cost per video. `perSecond` bills by duration where the provider
 * does; the rest charge a flat rate whatever the length.
 */
export const VIDEO_COST_USD: Record<string, { base: number; perSecond?: number }> = {
  'ltx-video': { base: 0.085 },
  'ltx-13b': { base: 0.1, perSecond: 0.02 },
  'luma-ray2-flash': { base: 0.2 },
  'pixverse-v5': { base: 0.2 },
  'minimax-video': { base: 0.22 },
  'hailuo-2.3-fast': { base: 0.33 },
  'kling-2.5-turbo': { base: 0.35, perSecond: 0.07 },
  'hailuo-2.3': { base: 0.49 },
  'runway-gen4': { base: 0.5 },
  'wan-2.5': { base: 0.5, perSecond: 0.1 },
  'wan-2.6': { base: 0.5, perSecond: 0.1 },
  'kling-3.0-standard': { base: 0.63, perSecond: 0.126 },
  'luma-ray2': { base: 0.65 },
  'seedance-1.5-pro': { base: 0.65 },
  'veo-3.1-fast': { base: 0.75, perSecond: 0.15 },
  'seedance-2.0-fast': { base: 0.8, perSecond: 0.16 },
  'kling-3.0': { base: 0.84, perSecond: 0.168 },
  'kling-2.6-pro': { base: 1.1 },
  'seedance-2.0': { base: 1.55, perSecond: 0.31 },
  'veo-3.1': { base: 2.0, perSecond: 0.4 },
  'seedance-2.5': { base: 2.365, perSecond: 0.473 },
};

/**
 * Provider cost per mesh. Texturing is billed separately by every provider, so
 * quality carries a multiplier rather than a flat surcharge.
 */
export const MODEL3D_COST_USD: Record<
  string,
  { base: number; textured?: number; hd?: number }
> = {
  'hunyuan3d-v2': { base: 0.06, textured: 3 },
  'trellis': { base: 0.08, hd: 1.4 },
  'tripo-2.5': { base: 0.2, hd: 1.5 },
  'rodin-hyper3d': { base: 0.45, hd: 1.6 },
};

/** Provider cost per single-shot tool run (audio, upscale, matting, STT). */
export const TOOL_COST_USD: Record<string, number> = {
  'birefnet': 0.02,
  'whisper': 0.03,
  'dia-tts': 0.04,
  'aura-sr': 0.04,
  'ace-step': 0.05,
  'creative-upscaler': 0.08,
  'minimax-music': 0.165,
};

export interface QuoteOptions {
  /** Video length in seconds, for the models that bill per second. */
  durationSeconds?: number;
  /** Texture quality, for 3D. */
  quality?: TextureQuality;
  /** Images per run — the studio composer batches up to 4. */
  quantity?: number;
}

/** Provider cost in USD for one job, before markup. */
export function providerCostUsd(kind: JobKind, modelId: string, opts: QuoteOptions = {}): number | null {
  switch (kind) {
    case 'image': {
      const cost = IMAGE_COST_USD[modelId];
      return cost === undefined ? null : cost;
    }
    case 'tool': {
      const cost = TOOL_COST_USD[modelId];
      return cost === undefined ? null : cost;
    }
    case 'video': {
      const entry = VIDEO_COST_USD[modelId];
      if (!entry) return null;
      if (entry.perSecond && opts.durationSeconds) {
        return entry.perSecond * opts.durationSeconds;
      }
      return entry.base;
    }
    case 'model3d': {
      const entry = MODEL3D_COST_USD[modelId];
      if (!entry) return null;
      const quality = opts.quality ?? 'standard';
      const multiplier =
        quality === 'none' ? 1 : quality === 'HD' ? (entry.hd ?? entry.textured ?? 1) : (entry.textured ?? 1);
      return entry.base * multiplier;
    }
    default:
      return null;
  }
}

/**
 * What to charge for one job, in DHB.
 *
 * Returns null for an unknown model rather than 0, so an unrecognised id fails
 * the generation instead of quietly making it free.
 */
export function quotePriceDhb(kind: JobKind, modelId: string, opts: QuoteOptions = {}): number | null {
  const cost = providerCostUsd(kind, modelId, opts);
  if (cost === null || !Number.isFinite(cost) || cost <= 0) return null;

  const quantity = Math.max(1, Math.floor(opts.quantity ?? 1));
  const retailUsd = cost * (1 + MARKUP) * quantity;

  // Whole DHB. Rounding up keeps a batch from costing less than its parts.
  return Math.ceil(retailUsd / DHB_USD_PEG);
}

/** Convenience for surfaces that want to show the dollar value of a balance. */
export function dhbToUsd(dhb: number): number {
  return dhb * DHB_USD_PEG;
}
