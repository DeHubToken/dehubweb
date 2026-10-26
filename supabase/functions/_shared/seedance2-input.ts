interface Seedance2Options {
  prompt: string;
  duration?: string | number;
  aspectRatio?: string;
  resolution?: string;
  sourceImage?: string;
  endFrameUrl?: string;
  referenceImageUrls?: string[];
  audioUrls?: string[];
  videoUrls?: string[];
  negativePrompt?: string;
  seed?: number;
}

/** Seedance 2.0 and Fast public fal input schemas, checked 26 October 2026. */
export function buildSeedance2Input(options: Seedance2Options) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || typeof options.prompt !== 'string' || !options.prompt.trim()) throw new Error('A prompt is required');
  if (options.seed !== undefined || options.negativePrompt !== undefined) throw new Error('Seedance 2.0 does not support seeds or negative prompts');
  for (const value of [options.sourceImage, options.endFrameUrl, options.aspectRatio, options.resolution]) {
    if (value !== undefined && (typeof value !== 'string' || !value.trim())) throw new Error('Invalid Seedance input');
  }
  for (const list of [options.referenceImageUrls, options.audioUrls, options.videoUrls]) {
    if (list !== undefined && (!Array.isArray(list) || list.some(value => typeof value !== 'string' || !value.trim()))) throw new Error('Invalid Seedance reference list');
  }
  if (options.duration !== undefined && typeof options.duration !== 'number' && typeof options.duration !== 'string') throw new Error('Invalid Seedance duration');
  const rawDuration = String(options.duration ?? 5).replace(/s$/, '');
  const duration = Number(rawDuration);
  if (!/^\d+$/.test(rawDuration) || !Number.isInteger(duration) || duration < 4 || duration > 15) throw new Error('Choose a duration from 4 to 15 seconds');
  const aspect = options.aspectRatio ?? '16:9';
  if (!['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].includes(aspect)) throw new Error('Unsupported Seedance aspect ratio');
  const resolution = options.resolution ?? '720p';
  if (!['480p', '720p'].includes(resolution)) throw new Error('Choose a priced Seedance resolution: 480p or 720p');
  const referenceMode = !!(options.referenceImageUrls?.length || options.audioUrls?.length || options.videoUrls?.length);
  if (options.endFrameUrl && (!options.sourceImage || referenceMode)) throw new Error('End frame requires a start image and cannot be combined with other references');
  const images = [...new Set([...(options.sourceImage ? [options.sourceImage] : []), ...(options.referenceImageUrls ?? [])])];
  if (images.length > 9 || (options.audioUrls?.length ?? 0) > 3 || (options.videoUrls?.length ?? 0) > 3) throw new Error('Too many Seedance references');
  if (images.length + (options.audioUrls?.length ?? 0) + (options.videoUrls?.length ?? 0) > 12) throw new Error('Choose at most 12 Seedance references in total');
  if (options.audioUrls?.length && !images.length && !options.videoUrls?.length) throw new Error('Audio references require an image or video reference');
  return {
    mode: referenceMode ? 'reference' as const : options.sourceImage ? 'image' as const : 'text' as const,
    durationSeconds: duration,
    input: {
      prompt: options.prompt,
      duration: String(duration),
      aspect_ratio: aspect,
      resolution,
      generate_audio: true,
      ...(referenceMode ? {
        ...(images.length ? { image_urls: images } : {}),
        ...(options.audioUrls?.length ? { audio_urls: options.audioUrls } : {}),
        ...(options.videoUrls?.length ? { video_urls: options.videoUrls } : {}),
      } : {
        ...(options.sourceImage ? { image_url: options.sourceImage } : {}),
        ...(options.endFrameUrl ? { end_image_url: options.endFrameUrl } : {}),
      }),
    } as Record<string, unknown>,
  };
}

/** The same mode decides both the payload shape and the provider endpoint. */
export function buildSeedance2Request(routes: { falTextModel?: string; falImageModel?: string; falReferenceModel?: string }, options: Seedance2Options) {
  const prepared = buildSeedance2Input(options);
  const appId = prepared.mode === 'reference' ? routes.falReferenceModel : prepared.mode === 'image' ? routes.falImageModel : routes.falTextModel;
  if (!appId) throw new Error('The selected Seedance route is not configured');
  return { ...prepared, appId };
}

/** Kie is retained only where this integration can preserve every requested setting. */
export function seedance2RoutingDecision(options: Pick<Seedance2Options, 'resolution' | 'audioUrls' | 'videoUrls' | 'endFrameUrl' | 'seed' | 'negativePrompt' | 'referenceImageUrls'>) {
  if (options.resolution !== undefined && !['480p', '720p'].includes(options.resolution)) return { provider: 'fal', reason: 'requested-resolution' } as const;
  if (options.audioUrls?.length) return { provider: 'fal', reason: 'audio-reference' } as const;
  if (options.videoUrls?.length) return { provider: 'fal', reason: 'video-reference' } as const;
  // These preserve the existing outer Kie guard; ordinary image references still use Kie.
  if (options.endFrameUrl) return { provider: 'fal', reason: 'end-frame' } as const;
  if (options.seed !== undefined) return { provider: 'fal', reason: 'seed' } as const;
  if (options.negativePrompt !== undefined) return { provider: 'fal', reason: 'negative-prompt' } as const;
  return { provider: 'kie', reason: 'compatible-direct-route' } as const;
}

export interface Seedance2QuoteHints {
  resolution?: string;
  hasEndFrame?: boolean;
  hasAudioReferences?: boolean;
  hasVideoReferences?: boolean;
  hasInlineMedia?: boolean;
}

/** Used by quote and charge; generation derives these hints from its actual media. */
export function seedance2QuoteRoute(modelId: string, hints: Seedance2QuoteHints = {}, kieAvailable: boolean) {
  if (!hints || typeof hints !== 'object' || Array.isArray(hints)) throw new Error('Invalid video quote options');
  if (hints.resolution !== undefined && !['480p', '720p'].includes(hints.resolution)) throw new Error('Choose a priced Seedance resolution: 480p or 720p');
  for (const value of [hints.hasEndFrame, hints.hasAudioReferences, hints.hasVideoReferences, hints.hasInlineMedia]) {
    if (value !== undefined && typeof value !== 'boolean') throw new Error('Invalid video quote options');
  }
  if (modelId === 'seedance-2.0-fast') return { provider: 'fal', reason: 'fast-provider-route' } as const;
  if (!kieAvailable) return { provider: 'fal', reason: 'direct-provider-unavailable' } as const;
  if (hints.hasInlineMedia) return { provider: 'fal', reason: 'inline-media' } as const;
  return seedance2RoutingDecision({ resolution: hints.resolution,
    ...(hints.hasEndFrame ? { endFrameUrl: 'present' } : {}),
    ...(hints.hasAudioReferences ? { audioUrls: ['present'] } : {}),
    ...(hints.hasVideoReferences ? { videoUrls: ['present'] } : {}),
  });
}
