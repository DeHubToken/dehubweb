import { CREATOR_FAL_IMAGE_MODELS, CREATOR_FAL_VIDEO_MODELS } from './creator-fal-catalog.ts';

export interface CreatorFalVideoOptions {
  prompt: string;
  sourceImage?: string;
  duration?: string | number;
  aspectRatio?: string;
  resolution?: string;
  negativePrompt?: string;
  seed?: number;
  endFrameUrl?: string;
  referenceImageUrls?: string[];
  audioUrls?: string[];
  videoUrls?: string[];
}

/** Validate before payment and send only fields the selected endpoint accepts. */
export function buildCreatorFalVideoRequest(modelId: string, o: CreatorFalVideoOptions) {
  const m = CREATOR_FAL_VIDEO_MODELS[modelId];
  if (!m) throw new Error('Unknown creator video model');
  const rawDuration = String(o.duration ?? m.defaultDuration);
  const duration = /^\d+s?$/.test(rawDuration) ? Number(rawDuration.replace(/s$/, '')) : NaN;
  if (!Number.isInteger(duration) || duration < m.minDuration || duration > m.maxDuration || (m.allowedDurations && !m.allowedDurations.includes(duration))) {
    throw new Error(`Invalid duration for ${m.name}`);
  }
  const aspect = o.aspectRatio ?? '16:9';
  if (!m.aspectRatios.includes(aspect)) throw new Error(`Invalid aspect ratio for ${m.name}`);
  const resolution = o.resolution ?? (m.resolutions.includes('720p') ? '720p' : m.resolutions[0]);
  if (m.supportsResolution && !m.resolutions.includes(resolution)) throw new Error(`Invalid resolution for ${m.name}`);
  if (!o.prompt?.trim()) throw new Error('Prompt is required');
  if (o.endFrameUrl && (!m.supportsEndFrame || !o.sourceImage)) throw new Error('End frame requires a supported model and a start image');
  if (o.referenceImageUrls?.length || o.videoUrls?.length) throw new Error(`${m.name} does not accept reference images or clips in this mode`);
  if (o.audioUrls?.length && !m.supportsAudioInput) throw new Error(`${m.name} does not accept audio input`);
  if ((o.audioUrls?.length ?? 0) > 1) throw new Error('Attach one audio clip');
  if (o.negativePrompt && !m.supportsNegativePrompt) throw new Error(`${m.name} does not accept negative prompts`);
  if (o.seed !== undefined && (!m.supportsSeed || !Number.isInteger(o.seed))) throw new Error(`${m.name} does not accept this seed`);

  let appId = o.sourceImage ? m.falImageModel : m.falTextModel;
  const input: Record<string, unknown> = { prompt: o.prompt, duration };
  switch (m.family) {
    case 'flux3':
      input.aspect_ratio = aspect;
      input.generate_audio = true;
      if (modelId !== 'flux-3-draft') input.resolution = resolution;
      if (o.endFrameUrl) {
        appId = m.falEndFrameModel!;
        input.start_image_url = o.sourceImage;
        input.end_image_url = o.endFrameUrl;
      } else if (o.sourceImage) input.image_url = o.sourceImage;
      break;
    case 'omni':
      input.aspect_ratio = aspect;
      if (o.sourceImage) input.image_url = o.sourceImage;
      break;
    case 'h3':
      input.resolution = resolution.endsWith('p') ? resolution.toUpperCase() : resolution;
      input.prompt_expansion_mode = 'balanced';
      if (o.sourceImage) input.image_url = o.sourceImage;
      else input.aspect_ratio = aspect;
      if (o.endFrameUrl) input.end_image_url = o.endFrameUrl;
      if (o.audioUrls?.length) input.target_audio_url = o.audioUrls[0];
      if (o.seed !== undefined) input.seed = o.seed;
      break;
    case 'grok':
    case 'horse':
      input.resolution = resolution;
      if (o.sourceImage) input.image_url = o.sourceImage;
      else input.aspect_ratio = aspect;
      if (o.seed !== undefined) input.seed = o.seed;
      break;
    case 'wan3':
      input.resolution = resolution;
      input.aspect_ratio = aspect;
      input.audio = true;
      if (o.sourceImage) input.start_image_url = o.sourceImage;
      if (o.endFrameUrl) input.end_image_url = o.endFrameUrl;
      if (o.seed !== undefined) input.seed = o.seed;
      break;
    case 'klingo3':
      input.duration = String(duration);
      input.generate_audio = true;
      if (o.sourceImage) input.image_url = o.sourceImage;
      else input.aspect_ratio = aspect;
      if (o.endFrameUrl) input.end_image_url = o.endFrameUrl;
      break;
    case 'ray3':
      input.duration = `${duration}s`;
      input.resolution = resolution;
      input.aspect_ratio = aspect;
      // Ray 3.2's single-image route only accepts 5s. Explicit keyframes unlock 10s.
      if (o.sourceImage && duration === 10) {
        input.keyframes = o.endFrameUrl ? [o.sourceImage, o.endFrameUrl] : [o.sourceImage];
        input.keyframe_indexes = o.endFrameUrl ? [0, 240] : [0];
      } else {
        if (o.sourceImage) input.image_url = o.sourceImage;
        if (o.endFrameUrl) input.end_image_url = o.endFrameUrl;
      }
      break;
    case 'pixverse6':
      input.resolution = resolution;
      input.generate_audio_switch = true;
      if (o.sourceImage) input.image_url = o.sourceImage;
      else input.aspect_ratio = aspect;
      if (o.negativePrompt) input.negative_prompt = o.negativePrompt;
      if (o.seed !== undefined) input.seed = o.seed;
      break;
    case 'ltx23':
      input.resolution = modelId === 'ltx-2.3-fast' ? '1080p' : resolution;
      input.aspect_ratio = aspect;
      input.fps = 25;
      input.generate_audio = true;
      if (o.sourceImage) input.image_url = o.sourceImage;
      if (o.endFrameUrl) input.end_image_url = o.endFrameUrl;
      break;
  }
  return { appId, input, durationSeconds: duration };
}

export function creatorFalImageSize(aspect = '1:1'): string {
  if (aspect === '16:9' || aspect === '21:9') return 'landscape_16_9';
  if (aspect === '4:3' || aspect === '3:2') return 'landscape_4_3';
  if (aspect === '9:16') return 'portrait_16_9';
  if (['3:4', '2:3', '4:5'].includes(aspect)) return 'portrait_4_3';
  return 'square_hd';
}

export function buildCreatorFalImageRequest(modelId: string, prompt: string, sourceImage?: string, aspect?: string) {
  const m = CREATOR_FAL_IMAGE_MODELS[modelId];
  if (!m || (sourceImage && !m.edit)) throw new Error('This model cannot edit an image');
  if (!prompt.trim() || prompt.length > 4000) throw new Error('Use an image prompt of 1 to 4000 characters');
  const input: Record<string, unknown> = { prompt, ...(sourceImage ? m.editExtra ?? m.extra : m.extra) };
  if (!m.omitNumImages) input.num_images = 1;
  if (m.sizing === 'aspect_ratio') {
    const ratio = aspect ?? (sourceImage ? 'auto' : '1:1');
    input.aspect_ratio = m.aspectRatios && !m.aspectRatios.includes(ratio) ? (ratio === '21:9' ? '2.35:1' : '1:1') : ratio;
  } else input.image_size = creatorFalImageSize(aspect);
  if (sourceImage) input[m.editUsesPlural ? 'image_urls' : 'image_url'] = m.editUsesPlural ? [sourceImage] : sourceImage;
  return { appId: sourceImage ? m.edit! : m.text, input };
}
