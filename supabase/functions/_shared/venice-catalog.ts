/** Distinct ids keep Venice routing and at-cost pricing separate from other providers. */
export const VENICE_IMAGE_MODELS = {
  'venice-z-image-turbo': { apiModel: 'z-image-turbo', name: 'Z-Image Turbo · Venice', baseCostUsd: 0.01 },
  'venice-qwen-image': { apiModel: 'qwen-image', name: 'Qwen Image · Venice', baseCostUsd: 0.03 },
} as const;

export const VENICE_VIDEO_MODELS = {
  'venice-wan-2-7-text': { apiModel: 'wan-2-7-text-to-video', name: 'Wan 2.7 Text · Venice', imageRequired: false },
  'venice-wan-2-7-image': { apiModel: 'wan-2-7-image-to-video', name: 'Wan 2.7 Animate · Venice', imageRequired: true },
} as const;

export const isVeniceImage = (id: string): id is keyof typeof VENICE_IMAGE_MODELS => Object.prototype.hasOwnProperty.call(VENICE_IMAGE_MODELS, id);
export const isVeniceVideo = (id: string): id is keyof typeof VENICE_VIDEO_MODELS => Object.prototype.hasOwnProperty.call(VENICE_VIDEO_MODELS, id);

export function atCostDhb(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0 || usd > 100) throw new Error('Invalid Venice price');
  // Preserve micro-dollar precision; no whole-token round-up or margin.
  return Math.round(usd * 1_000_000) / 1_000;
}

export function veniceVideoOptions(modelId: string, opts: { durationSeconds?: number; resolution?: string; aspectRatio?: string }) {
  if (!isVeniceVideo(modelId)) throw new Error('Unknown Venice video model');
  const seconds = opts.durationSeconds ?? 5;
  const resolution = opts.resolution ?? '720p';
  const aspect = opts.aspectRatio ?? '16:9';
  if (![5, 10, 15].includes(seconds)) throw new Error('Choose a 5, 10 or 15 second video');
  if (!['720p', '1080p'].includes(resolution)) throw new Error('Choose 720p or 1080p');
  if (!['16:9', '9:16', '1:1'].includes(aspect)) throw new Error('Unsupported video aspect ratio');
  return {
    model: VENICE_VIDEO_MODELS[modelId].apiModel,
    duration: `${seconds}s`, resolution,
    ...(!VENICE_VIDEO_MODELS[modelId].imageRequired ? { aspect_ratio: aspect } : {}),
  };
}
