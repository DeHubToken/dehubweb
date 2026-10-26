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
  if (options.seed !== undefined || options.negativePrompt) throw new Error('Seedance 2.0 does not support seeds or negative prompts');
  const rawDuration = String(options.duration ?? 5).replace(/s$/, '');
  const duration = Number(rawDuration);
  if (!/^\d+$/.test(rawDuration) || !Number.isInteger(duration) || duration < 4 || duration > 15) throw new Error('Choose a duration from 4 to 15 seconds');
  const aspect = options.aspectRatio ?? '16:9';
  if (!['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].includes(aspect)) throw new Error('Unsupported Seedance aspect ratio');
  const resolution = options.resolution ?? '720p';
  if (!['480p', '720p', '1080p'].includes(resolution)) throw new Error('Unsupported Seedance resolution');
  const referenceMode = !!(options.referenceImageUrls?.length || options.audioUrls?.length || options.videoUrls?.length);
  if (options.endFrameUrl && (!options.sourceImage || referenceMode)) throw new Error('End frame requires a start image and cannot be combined with other references');
  const images = [...new Set([...(options.sourceImage ? [options.sourceImage] : []), ...(options.referenceImageUrls ?? [])])];
  if (images.length > 9 || (options.audioUrls?.length ?? 0) > 3 || (options.videoUrls?.length ?? 0) > 3) throw new Error('Too many Seedance references');
  return {
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
