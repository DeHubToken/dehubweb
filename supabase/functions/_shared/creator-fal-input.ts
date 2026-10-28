import { CREATOR_FAL_IMAGE_MODELS, CREATOR_FAL_VIDEO_MODELS } from './creator-fal-catalog.ts';
import { VIRAL_EFFECTS } from './viral-effects.ts';

export interface CreatorFalVideoOptions {
  effect?: string;
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
  if (m.family === 'avatar') throw new Error('Avatar requires reviewed inline portrait/audio inputs');
  const rawDuration = String(o.duration ?? m.defaultDuration);
  const duration = /^\d+s?$/.test(rawDuration) ? Number(rawDuration.replace(/s$/, '')) : NaN;
  if (!Number.isInteger(duration) || duration < m.minDuration || duration > m.maxDuration || (m.allowedDurations && !m.allowedDurations.includes(duration))) {
    throw new Error(`Invalid duration for ${m.name}`);
  }
  const aspect = o.aspectRatio ?? '16:9';
  if (!m.aspectRatios.includes(aspect)) throw new Error(`Invalid aspect ratio for ${m.name}`);
  const resolution = o.resolution ?? (m.resolutions.includes('720p') ? '720p' : m.resolutions[0]);
  if (m.supportsResolution && !m.resolutions.includes(resolution)) throw new Error(`Invalid resolution for ${m.name}`);
  if (m.family === 'pixverseeffects') {
    if (!VIRAL_EFFECTS.some(item => item.name === o.effect)) throw new Error('Choose a supported video effect');
    if (!o.sourceImage) throw new Error('Attach one photo to use this effect');
    if (resolution !== '720p' || o.referenceImageUrls?.length || o.videoUrls?.length || o.audioUrls?.length || o.endFrameUrl || o.seed !== undefined || o.negativePrompt) {
      throw new Error('Effects take one photo and render a five-second 720p video');
    }
    return { appId: m.falImageModel, input: { effect: o.effect, image_url: o.sourceImage, duration: '5', resolution: '720p', enable_safety_checker: true }, durationSeconds: 5 };
  }
  if (!o.prompt?.trim()) throw new Error('Prompt is required');
  if (m.maxPromptLength && o.prompt.length > m.maxPromptLength) throw new Error(`Use a prompt of up to ${m.maxPromptLength} characters for ${m.name}`);
  if (m.requiresVideoInput) {
    if (o.videoUrls?.length !== 1) throw new Error('Attach one MP4 or MOV reference clip');
    if (m.referenceMode === 'extend') {
      if (o.sourceImage || o.referenceImageUrls?.length || o.endFrameUrl || o.audioUrls?.length || o.negativePrompt || o.seed !== undefined || o.effect || resolution !== '720p') throw new Error('Extension takes one source clip and a continuation prompt');
      return { appId: m.falTextModel, input: {
        prompt: o.prompt, video_url: o.videoUrls[0], extend_direction: m.extensionDirection,
        num_frames: 121, num_context_frames: 25, frames_per_second: 24, match_input_fps: false,
        resolution: aspect === '9:16' ? { width: 720, height: 1280 } : { width: 1280, height: 720 },
        video_strength: 1, num_inference_steps: 15, guidance_scale: 1, generate_audio: true,
        enable_prompt_expansion: false, enable_safety_checker: true,
      }, durationSeconds: 4 };
    }
    const images = [...new Set([...(o.sourceImage ? [o.sourceImage] : []), ...(o.referenceImageUrls ?? [])])];
    if (!images.length) throw new Error('Attach a character or reference image');
    if (images.length > (m.maxReferenceImages ?? 1)) throw new Error(`Attach up to ${m.maxReferenceImages ?? 1} images`);
    if (o.prompt.length > 2500) throw new Error('Use a prompt of up to 2500 characters');
    if (o.endFrameUrl || o.audioUrls?.length || o.negativePrompt || o.seed !== undefined) throw new Error('This workflow takes reference images and one clip');
    return {
      appId: m.falImageModel,
      input: m.referenceMode === 'motion'
        ? { prompt: o.prompt, image_url: images[0], video_url: o.videoUrls[0], character_orientation: 'video', keep_original_sound: true }
        : { prompt: o.prompt, image_urls: images, video_url: o.videoUrls[0], keep_audio: true },
      durationSeconds: duration,
    };
  }
  if (o.endFrameUrl && (!m.supportsEndFrame || !o.sourceImage)) throw new Error('End frame requires a supported model and a start image');
  if (o.referenceImageUrls?.length || o.videoUrls?.length) throw new Error(`${m.name} does not accept reference images or clips in this mode`);
  if (o.audioUrls?.length && !m.supportsAudioInput) throw new Error(`${m.name} does not accept audio input`);
  if ((o.audioUrls?.length ?? 0) > 1) throw new Error('Attach one audio clip');
  if (o.negativePrompt && !m.supportsNegativePrompt) throw new Error(`${m.name} does not accept negative prompts`);
  if (o.seed !== undefined && (!m.supportsSeed || !Number.isInteger(o.seed))) throw new Error(`${m.name} does not accept this seed`);

  let appId = o.sourceImage ? m.falImageModel : m.falTextModel;
  const input: Record<string, unknown> = { prompt: o.prompt, duration };
  switch (m.family) {
    case 'klingturbo':
      input.duration = String(duration);
      if (o.sourceImage) input.image_url = o.sourceImage;
      else input.aspect_ratio = aspect;
      break;
    case 'viduq3':
      input.resolution = resolution;
      input.audio = true;
      if (o.sourceImage) input.image_url = o.sourceImage;
      else input.aspect_ratio = aspect;
      if (o.endFrameUrl) input.end_image_url = o.endFrameUrl;
      if (o.seed !== undefined) input.seed = o.seed;
      break;
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

/** Keep metered images below 1 MP and preserve the advertised framing. */
export function creatorFalImageDimensions(aspect = '1:1'): { width: number; height: number } {
  const sizes: Record<string, [number, number]> = {
    '1:1': [992, 992], '4:5': [864, 1080], '16:9': [1280, 720],
    '9:16': [720, 1280], '3:2': [1200, 800], '2:3': [800, 1200],
    '21:9': [1512, 648], '4:3': [1152, 864], '3:4': [864, 1152],
  };
  const size = sizes[aspect];
  if (!size) throw new Error('Unsupported image aspect ratio');
  return { width: size[0], height: size[1] };
}

export function creatorFalImageResult(modelId: string, data: { images?: { url?: string }[]; image?: { url?: string } }): string {
  const url = CREATOR_FAL_IMAGE_MODELS[modelId]?.outpaint ? data.image?.url : data.images?.[0]?.url;
  if (typeof url !== 'string' || !url) throw new Error('The model returned no image');
  return url;
}

export function buildCreatorFalImageRequest(modelId: string, prompt: string, sourceImage?: string, aspect?: string, referenceImageUrls?: string[]) {
  const m = CREATOR_FAL_IMAGE_MODELS[modelId];
  const images = [...new Set([...(sourceImage ? [sourceImage] : []), ...(referenceImageUrls ?? [])])];
  sourceImage = images[0];
  if (!m || (sourceImage && !m.edit)) throw new Error('This model cannot edit an image');
  if (m.requiresImage && !sourceImage) throw new Error('Attach one image to use this model');
  if (images.length > (m.maxReferenceImages ?? 4) || (images.length > 1 && !m.editUsesPlural)) throw new Error(`Choose a model supporting these references (up to ${m.maxReferenceImages ?? 4})`);
  if (m.outpaint) {
    if (!sourceImage) throw new Error('Attach one image to expand');
    const ratio = aspect ?? '1:1';
    if (!m.aspectRatios?.includes(ratio)) throw new Error('Unsupported expansion aspect ratio');
    if (typeof prompt !== 'string' || prompt.length > 1000 || /[^\x09\x0a\x0d\x20-\x7e]/.test(prompt)) throw new Error('Expansion accepts an optional English prompt of up to 1000 characters');
    const { width, height } = creatorFalImageDimensions(ratio);
    return { appId: m.edit!, input: { image_url: sourceImage, canvas_size: [width, height], aspect_ratio: ratio,
      ...(prompt.trim() ? { prompt: prompt.trim() } : {}) } };
  }
  const limit = m.maxPromptLength ?? 4000;
  if (!prompt.trim() || prompt.length > limit) throw new Error(`Use an image prompt of 1 to ${limit} characters`);
  const input: Record<string, unknown> = { prompt, ...(sourceImage ? m.editExtra ?? m.extra : m.extra) };
  if (!m.omitNumImages) input.num_images = 1;
  if (m.sizing === 'aspect_ratio') {
    const ratio = aspect ?? (sourceImage ? 'auto' : '1:1');
    // Preserve the existing cinemascope alias, but never silently turn a portrait into a square.
    const normalized = ratio === '21:9' && m.aspectRatios?.includes('2.35:1') ? '2.35:1' : ratio;
    if (m.aspectRatios && !m.aspectRatios.includes(normalized)) throw new Error(`Invalid aspect ratio for ${m.name}`);
    input.aspect_ratio = normalized;
  } else input.image_size = m.exactImageSize ? creatorFalImageDimensions(aspect) : creatorFalImageSize(aspect);
  if (sourceImage) input[m.editImageField ?? (m.editUsesPlural ? 'image_urls' : 'image_url')] = m.editUsesPlural ? images : sourceImage;
  return { appId: sourceImage ? m.edit! : m.text, input };
}
