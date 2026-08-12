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

/**
 * Default markup over provider cost — 20% wherever MARKUP_OVERRIDES below
 * does not band a model up or down.
 *
 * Was 100%. The thinner margin only works because provider cost is now the
 * kie.ai rate wherever kie serves the model (see the tables below): kie
 * undercuts fal by 20-70% on those entries, so the sticker price falls on
 * both axes at once. Entries still bought from fal/Replicate keep their old
 * cost basis and get cheaper for the creator via the margin cut alone.
 *
 * At 20% there is no headroom for charging below cost: any entry here must be
 * the CEILING of what the routed provider can bill for that model across the
 * options the composer exposes (the resolution rule — see the kie-priced
 * video entries).
 */
export const MARKUP = 0.2;

/**
 * Per-model markup bands. Anything not listed pays the default MARKUP.
 *
 * The flat rate turned out to be wrong in both directions at once: too thin
 * to fund a free allowance out of margin, and not thin enough to matter on
 * the entry images. So the rate bands per model instead of moving for
 * everyone.
 *
 * The entry images drop to 10% because their absolute prices are pennies and
 * the round-up to whole DHB in quotePriceDhb already protects the floor —
 * z-image-turbo retails at $0.0066 and bills as 7 DHB, so the ceil adds back
 * most of what the band gives up.
 *
 * The two Veos rise to 30% because kie bills them flat per video: at 20%
 * they sat 46% and 20% under the main competitor's price, which is deeper
 * than anyone comparison-shops. At 30% they still undercut it (42% and 13%)
 * and the difference is what pays for the free allowance grants in
 * ai-plans.ts.
 *
 * The ceiling rule above survives banding: whatever the markup, the cost
 * entry must be the CEILING of what the routed provider can bill for that
 * model across the options the composer exposes, so no override may take the
 * price below the routed provider ceiling.
 *
 * Keys are bare model ids, looked up regardless of kind — so an id listed
 * here must stay unique across all four cost tables, the same convention the
 * tables themselves already rely on. The client display constants mirror
 * these bands (VIDEO_MARKUP_OVERRIDES / IMAGE_MARKUP_OVERRIDES in
 * src/constants); a band added here alone makes the video paywall understate
 * the debit and pass users the server will 402.
 */
export const MARKUP_OVERRIDES: Record<string, number> = {
  'z-image-turbo': 0.1,
  'gemini-3.1-flash-image': 0.1,
  'veo-3.1-fast': 0.3,
  'veo-3.1': 0.3,
};

export type JobKind = 'image' | 'video' | 'model3d' | 'tool';
export type TextureQuality = 'none' | 'standard' | 'HD';

/**
 * Provider cost per image, in USD.
 *
 * The four entries marked `kie` are what kie.ai bills at the tier the
 * generation function requests (2K for the nano-bananas, basic/2K for
 * Seedream, 1K for Flux); the rest are still fal/gateway rates.
 */
export const IMAGE_COST_USD: Record<string, number> = {
  'z-image-turbo': 0.006,
  'gemini-3.1-flash-image': 0.01,
  'gemini-2.5-flash': 0.02,
  'qwen-image': 0.02,
  'grok-imagine': 0.02,
  'flux-2-pro': 0.025, // kie: $0.025 at 1K (fal was $0.03)
  'recraft-v4.1': 0.035,
  'seedream-v4.5': 0.0325, // kie: $0.0325 flat (fal was $0.04)
  'flux-2-flex': 0.05,
  'grok-2-image': 0.06,
  'ideogram-v3': 0.06,
  'gemini-3-pro-image': 0.08,
  'nano-banana-2': 0.06, // kie: $0.06 at 2K (fal was $0.08)
  'flux-kontext-max': 0.08,
  'recraft-v4.1-vector': 0.08,
  'nano-banana-pro': 0.09, // kie: $0.09 at 1K/2K (fal was $0.15)
};

/**
 * Provider cost per video. `perSecond` bills by duration where the provider
 * does; the rest charge a flat rate whatever the length.
 *
 * Entries marked `kie` are kie.ai's rate at the most expensive tier the
 * composer can reach on the kie route — 720p for the Seedances (the kie path
 * snaps them there), 1080p for Veo and Wan, audio-on for Kling — so a cheaper
 * pick widens the margin and an expensive one can never invert it. The two
 * Veos are the big win: kie bills them flat per video, so their `perSecond`
 * is gone and an 8-second render costs the same as a 4-second one.
 */
export const VIDEO_COST_USD: Record<string, { base: number; perSecond?: number }> = {
  'ltx-video': { base: 0.085 },
  'ltx-13b': { base: 0.1, perSecond: 0.02 },
  'luma-ray2-flash': { base: 0.2 },
  'pixverse-v5': { base: 0.2 },
  'minimax-video': { base: 0.22 },
  'kling-2.5-turbo': { base: 0.21, perSecond: 0.042 }, // kie (fal was 0.07/s)
  'veo-3.1-fast': { base: 0.325 }, // kie: flat per video, 1080p ceiling (fal was 0.15/s)
  'hailuo-2.3-fast': { base: 0.33 },
  'hailuo-2.3': { base: 0.49 },
  'kling-3.0-standard': { base: 0.5, perSecond: 0.1 }, // kie, audio on (fal was 0.126/s)
  'runway-gen4': { base: 0.5 },
  'wan-2.5': { base: 0.5, perSecond: 0.1 }, // routed to kie; 1080p ceiling matches the old fal rate
  'wan-2.6': { base: 0.525, perSecond: 0.105 }, // kie 1080p ceiling (720p costs us 0.07/s)
  'luma-ray2': { base: 0.65 },
  'seedance-1.5-pro': { base: 0.65 },
  'kling-3.0': { base: 0.675, perSecond: 0.135 }, // kie pro, audio on (fal was 0.168/s)
  'seedance-2.0-fast': { base: 0.8, perSecond: 0.16 },
  'seedance-2.0': { base: 0.825, perSecond: 0.165 }, // kie 720p (fal was 0.31/s)
  'kling-2.6-pro': { base: 1.1 },
  'veo-3.1': { base: 1.275 }, // kie: flat per video, 1080p ceiling (fal was 0.40/s)
  'seedance-2.5': { base: 1.575, perSecond: 0.315 }, // kie 720p (fal was 0.473/s)
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
  const markup = MARKUP_OVERRIDES[modelId] ?? MARKUP;
  const retailUsd = cost * (1 + markup) * quantity;

  // Whole DHB. Rounding up keeps a batch from costing less than its parts.
  return Math.ceil(retailUsd / DHB_USD_PEG);
}

/** Convenience for surfaces that want to show the dollar value of a balance. */
export function dhbToUsd(dhb: number): number {
  return dhb * DHB_USD_PEG;
}
