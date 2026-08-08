import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Replicate from "https://esm.sh/replicate@0.25.2";
import { rateLimitByIp } from "../_shared/auth.ts";
import { chargeForJob } from "../_shared/ai-credit-guard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * fal.ai model families.
 *
 * Each family names its inputs differently — Veo takes `generate_audio`, Kling
 * takes `cfg_scale` and `negative_prompt`, Hailuo takes `prompt_optimizer`,
 * Wan takes `num_frames`. Unknown keys are not ignored: fal 422s the request.
 * So the family selects an explicit input builder instead of one shared spread.
 */
type FalFamily =
  | 'seedance'
  | 'seedance25'
  | 'veo'
  | 'kling'
  | 'hailuo'
  | 'wan'
  | 'luma'
  | 'pixverse'
  | 'ltx';

// Premium video generation models via Replicate and fal.ai
const VIDEO_MODELS: Record<string, {
  id: string;
  name: string;
  description: string;
  supports: readonly string[];
  duration: string;
  version?: string;
  provider?: 'replicate' | 'fal';
  falFamily?: FalFamily;
  falTextModel?: string;
  falImageModel?: string;
  falReferenceModel?: string;
  /**
   * Drop `generate_audio` from the family's input.
   *
   * Kling 2.5 Turbo predates Kling's audio track and has no such field, so the
   * shared kling builder would 422 it on every request.
   */
  falOmitAudio?: boolean;
}> = {
  'seedance-2.5': {
    id: 'bytedance/seedance-2.5',
    name: 'Seedance 2.5',
    description: 'ByteDance flagship — 30s takes, unified multimodal input',
    supports: ['text-to-video', 'image-to-video'],
    duration: '4-30s',
    provider: 'fal',
    falFamily: 'seedance25',
    falTextModel: 'bytedance/seedance-2.5/text-to-video',
    falImageModel: 'bytedance/seedance-2.5/image-to-video',
    falReferenceModel: 'bytedance/seedance-2.5/reference-to-video',
  },
  'kling-2.6-pro': {
    id: 'kwaivgi/kling-v2.6',
    name: 'Kling 2.6 Pro',
    description: 'Top-tier cinematic visuals with native audio generation',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5s or 10s',
  },
  'luma-ray2': {
    id: 'luma/ray-2-720p',
    name: 'Luma Ray 2',
    description: 'Latest Luma model, photorealistic results (720p)',
    supports: ['text-to-video'],
    duration: '5s',
  },
  'minimax-video': {
    id: 'minimax/video-01',
    name: 'Minimax Video-01',
    description: 'Fast generation, good quality',
    supports: ['text-to-video', 'image-to-video'],
    duration: '6s',
  },
  'runway-gen4': {
    id: 'runwayml/gen4-turbo',
    name: 'Runway Gen-4 Turbo',
    description: 'Latest Runway model, stunning visual quality (image-to-video only)',
    supports: ['image-to-video'],
    duration: '10s',
  },
  'ltx-video': {
    id: 'lightricks/ltx-video',
    version: '8c47da666861d081eeb4d1261853087de23923a268a69b63febdf5dc1dee08e4',
    name: 'LTX Video',
    description: 'Fast, efficient, good for quick generations',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5s',
  },
  'seedance-1.5-pro': {
    id: 'bytedance/seedance-1.5-pro',
    name: 'Seedance 1.5 Pro',
    description: 'ByteDance cinematic quality with native audio generation',
    supports: ['text-to-video', 'image-to-video'],
    duration: '2-12s',
  },
  'seedance-2.0': {
    id: 'bytedance/seedance-2.0',
    name: 'Seedance 2.0',
    description: 'Latest ByteDance model via fal.ai, superior quality & audio',
    supports: ['text-to-video', 'image-to-video'],
    duration: '4-15s',
    provider: 'fal',
    falFamily: 'seedance',
    falTextModel: 'bytedance/seedance-2.0/text-to-video',
    falImageModel: 'bytedance/seedance-2.0/image-to-video',
    falReferenceModel: 'bytedance/seedance-2.0/reference-to-video',
  },
  'seedance-2.0-fast': {
    id: 'bytedance/seedance-2.0-fast',
    name: 'Seedance 2.0 Fast',
    description: 'Faster Seedance 2.0 variant via fal.ai',
    supports: ['text-to-video', 'image-to-video'],
    duration: '4-15s',
    provider: 'fal',
    falFamily: 'seedance',
    falTextModel: 'bytedance/seedance-2.0/fast/text-to-video',
    falImageModel: 'bytedance/seedance-2.0/fast/image-to-video',
    falReferenceModel: 'bytedance/seedance-2.0/fast/reference-to-video',
  },

  // ─── Expanded fal.ai catalogue ───
  'veo-3.1': {
    id: 'fal-ai/veo3.1',
    name: 'Veo 3.1',
    description: 'Google flagship, ultra-realistic with native audio',
    supports: ['text-to-video', 'image-to-video'],
    duration: '4-8s',
    provider: 'fal',
    falFamily: 'veo',
    falTextModel: 'fal-ai/veo3.1',
    falImageModel: 'fal-ai/veo3.1/image-to-video',
  },
  'veo-3.1-fast': {
    id: 'fal-ai/veo3.1/fast',
    name: 'Veo 3.1 Fast',
    description: 'Faster, cheaper Veo 3.1',
    supports: ['text-to-video', 'image-to-video'],
    duration: '4-8s',
    provider: 'fal',
    falFamily: 'veo',
    falTextModel: 'fal-ai/veo3.1/fast',
    falImageModel: 'fal-ai/veo3.1/fast/image-to-video',
  },
  'kling-3.0': {
    id: 'fal-ai/kling-video/v3/pro',
    name: 'Kling 3.0 Pro',
    description: 'Multi-shot with audio sync and long takes',
    supports: ['text-to-video', 'image-to-video'],
    duration: '3-15s',
    provider: 'fal',
    falFamily: 'kling',
    falTextModel: 'fal-ai/kling-video/v3/pro/text-to-video',
    falImageModel: 'fal-ai/kling-video/v3/pro/image-to-video',
  },
  'kling-3.0-standard': {
    id: 'fal-ai/kling-video/v3/standard',
    name: 'Kling 3.0 Standard',
    description: 'Kling 3.0 on the lighter render tier',
    supports: ['text-to-video', 'image-to-video'],
    duration: '3-15s',
    provider: 'fal',
    falFamily: 'kling',
    falTextModel: 'fal-ai/kling-video/v3/standard/text-to-video',
    falImageModel: 'fal-ai/kling-video/v3/standard/image-to-video',
  },
  'kling-2.5-turbo': {
    id: 'fal-ai/kling-video/v2.5-turbo/pro',
    name: 'Kling 2.5 Turbo Pro',
    description: 'Fluid motion and tight prompt precision, no audio track',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5s or 10s',
    provider: 'fal',
    falFamily: 'kling',
    falOmitAudio: true,
    falTextModel: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
    falImageModel: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
  },
  'hailuo-2.3': {
    id: 'fal-ai/minimax/hailuo-2.3',
    name: 'MiniMax Hailuo 2.3',
    description: 'Natural physics and facial emotion',
    supports: ['text-to-video', 'image-to-video'],
    duration: '6s',
    provider: 'fal',
    falFamily: 'hailuo',
    falTextModel: 'fal-ai/minimax/hailuo-2.3/pro/text-to-video',
    falImageModel: 'fal-ai/minimax/hailuo-2.3/pro/image-to-video',
  },
  'hailuo-2.3-fast': {
    id: 'fal-ai/minimax/hailuo-2.3-fast',
    name: 'Hailuo 2.3 Fast',
    description: 'Faster, cheaper Hailuo (image-to-video only)',
    supports: ['image-to-video'],
    duration: '6s',
    provider: 'fal',
    falFamily: 'hailuo',
    falImageModel: 'fal-ai/minimax/hailuo-2.3-fast/pro/image-to-video',
  },
  'wan-2.6': {
    id: 'wan/v2.6',
    name: 'Wan 2.6',
    description: 'Character-consistent video with synced audio',
    supports: ['image-to-video'],
    duration: '5-10s',
    provider: 'fal',
    falFamily: 'wan',
    falImageModel: 'wan/v2.6/image-to-video',
    falReferenceModel: 'wan/v2.6/reference-to-video',
  },
  'wan-2.5': {
    id: 'fal-ai/wan-25-preview',
    name: 'Wan 2.5',
    description: 'Open-weight, stylised and experimental',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5-10s',
    provider: 'fal',
    falFamily: 'wan',
    falTextModel: 'fal-ai/wan-25-preview/text-to-video',
    falImageModel: 'fal-ai/wan-25-preview/image-to-video',
  },
  'luma-ray2-flash': {
    id: 'fal-ai/luma-dream-machine/ray-2-flash',
    name: 'Luma Ray 2 Flash',
    description: 'Dreamy Luma aesthetic on the budget tier',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5s',
    provider: 'fal',
    falFamily: 'luma',
    falTextModel: 'fal-ai/luma-dream-machine/ray-2-flash',
    falImageModel: 'fal-ai/luma-dream-machine/ray-2-flash/image-to-video',
  },
  'pixverse-v5': {
    id: 'fal-ai/pixverse/v5',
    name: 'PixVerse V5',
    description: 'Stylised and anime-leaning motion',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5-8s',
    provider: 'fal',
    falFamily: 'pixverse',
    falTextModel: 'fal-ai/pixverse/v5/text-to-video',
    falImageModel: 'fal-ai/pixverse/v5/image-to-video',
  },
  'ltx-13b': {
    id: 'fal-ai/ltxv-13b-098-distilled',
    name: 'LTX Video 13B',
    description: 'Cheapest per second, good for drafts',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5-10s',
    provider: 'fal',
    falFamily: 'ltx',
    falTextModel: 'fal-ai/ltxv-13b-098-distilled',
    falImageModel: 'fal-ai/ltxv-13b-098-distilled/image-to-video',
  },
};

type ModelKey = keyof typeof VIDEO_MODELS;

interface GenerateVideoRequest {
  prompt: string;
  model: ModelKey;
  sourceImage?: string;
  duration?: '5s' | '10s' | string;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  negativePrompt?: string;
  resolution?: '480p' | '720p' | '1080p';
  referenceImageUrls?: string[];
  endFrameUrl?: string;
  audioUrls?: string[];
  videoUrls?: string[];
  seed?: number;
}

interface VideoGenerationResponse {
  videoUrl?: string;
  predictionId?: string;
  provider?: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed';
  error?: string;
}

// ─── fal.ai helpers ───

async function falSubmit(
  falKey: string,
  appId: string,
  input: Record<string, unknown>,
): Promise<{ request_id: string }> {
  const res = await fetch(`https://queue.fal.run/${appId}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fal.ai submit error (${res.status}): ${text}`);
  }
  return res.json();
}

async function falStatus(
  falKey: string,
  appId: string,
  requestId: string,
): Promise<{ status: string; response_url?: string }> {
  const res = await fetch(
    `https://queue.fal.run/${appId}/requests/${requestId}/status`,
    { headers: { Authorization: `Key ${falKey}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fal.ai status error (${res.status}): ${text}`);
  }
  return res.json();
}

async function falResult(
  falKey: string,
  appId: string,
  requestId: string,
): Promise<{ video?: { url: string }; [key: string]: unknown }> {
  const res = await fetch(
    `https://queue.fal.run/${appId}/requests/${requestId}`,
    { headers: { Authorization: `Key ${falKey}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fal.ai result error (${res.status}): ${text}`);
  }
  return res.json();
}

function mapFalStatus(s: string): VideoGenerationResponse['status'] {
  switch (s) {
    case 'COMPLETED': return 'succeeded';
    case 'FAILED': return 'failed';
    case 'IN_QUEUE': return 'starting';
    case 'IN_PROGRESS': return 'processing';
    default: return 'processing';
  }
}

// ─── Replicate input builders ───

interface ReplicateInputOptions {
  prompt: string;
  sourceImage?: string;
  duration?: string;
  aspectRatio?: string;
  negativePrompt?: string;
  resolution?: string;
  seed?: number;
}

function buildReplicateInput(
  model: string,
  opts: ReplicateInputOptions,
): Record<string, unknown> {
  const { prompt, sourceImage, duration = '5s', aspectRatio = '16:9', negativePrompt, resolution, seed } = opts;

  switch (model) {
    case 'kling-2.6-pro':
      return {
        prompt,
        duration: parseInt(duration) || 5,
        aspect_ratio: aspectRatio,
        generate_audio: true,
        ...(sourceImage && { start_image: sourceImage }),
        ...(negativePrompt && { negative_prompt: negativePrompt }),
        ...(seed !== undefined && { seed }),
      };
    case 'luma-ray2':
      return { prompt, aspect_ratio: aspectRatio, loop: false };
    case 'minimax-video':
      return { prompt, ...(sourceImage && { first_frame_image: sourceImage }) };
    case 'runway-gen4':
      return {
        prompt,
        duration: parseInt(duration) || 10,
        ratio: aspectRatio,
        ...(sourceImage && { image: sourceImage }),
      };
    case 'ltx-video':
      return {
        prompt,
        ...(sourceImage && { image: sourceImage }),
        ...(negativePrompt && { negative_prompt: negativePrompt }),
        ...(seed !== undefined && { seed }),
      };
    case 'seedance-1.5-pro':
      return {
        prompt,
        duration: Math.min(Math.max(parseInt(duration) || 5, 2), 12),
        aspect_ratio: aspectRatio,
        resolution: resolution || '720p',
        generate_audio: true,
        ...(sourceImage && { image: sourceImage }),
        ...(negativePrompt && { negative_prompt: negativePrompt }),
        ...(seed !== undefined && { seed }),
      };
    default:
      return { prompt };
  }
}

// ─── fal.ai input builders ───

interface FalInputOptions {
  prompt: string;
  sourceImage?: string;
  duration: number;
  aspectRatio: string;
  negativePrompt?: string;
  resolution?: string;
  referenceImageUrls?: string[];
  endFrameUrl?: string;
  audioUrls?: string[];
  videoUrls?: string[];
  seed?: number;
  /** Suppress `generate_audio` for tiers that have no such field. */
  omitAudio?: boolean;
}

/**
 * Snap a requested duration onto the values a family actually accepts.
 *
 * Every one of these families types `duration` as a closed enum, so an
 * in-between value is a 422 rather than a rounding. Snapping DOWN is
 * deliberate: the creator has already been charged on the slider's value, and
 * rounding up would render — and bill fal for — more than they paid for.
 */
function snapDuration(seconds: number, allowed: number[]): number {
  const eligible = allowed.filter((a) => a <= seconds);
  return eligible.length ? Math.max(...eligible) : Math.min(...allowed);
}

/** Pick the closest resolution a family supports, never exceeding the request. */
function snapResolution(requested: string | undefined, allowed: string[], fallback: string): string {
  if (requested && allowed.includes(requested)) return requested;
  const order = ['360p', '480p', '512', '540p', '720p', '768', '1080p', '4k'];
  const wantIdx = order.indexOf(requested ?? '');
  if (wantIdx < 0) return fallback;
  // Best supported option at or below what was asked for.
  const below = allowed.filter((a) => order.indexOf(a) >= 0 && order.indexOf(a) <= wantIdx);
  if (below.length) {
    return below.reduce((best, a) => (order.indexOf(a) > order.indexOf(best) ? a : best));
  }
  return fallback;
}

function buildFalInput(family: FalFamily, o: FalInputOptions): Record<string, unknown> {
  const {
    prompt, sourceImage, duration, aspectRatio, negativePrompt, resolution,
    referenceImageUrls, endFrameUrl, audioUrls, videoUrls, seed, omitAudio,
  } = o;

  switch (family) {
    // Unchanged from the original single-family implementation, so the two
    // Seedance models keep behaving exactly as they did.
    case 'seedance':
      return {
        prompt,
        duration: Math.min(Math.max(duration, 4), 15),
        aspect_ratio: aspectRatio,
        resolution: resolution || '720p',
        generate_audio: true,
        ...(sourceImage && { image_url: sourceImage }),
        ...(negativePrompt && { negative_prompt: negativePrompt }),
        ...(endFrameUrl && { last_image_url: endFrameUrl }),
        ...(referenceImageUrls?.length && { image_urls: referenceImageUrls }),
        ...(audioUrls?.length && { audio_urls: audioUrls }),
        ...(videoUrls?.length && { video_urls: videoUrls }),
        ...(seed !== undefined && seed !== null && { seed }),
      };

    // duration is '4s' | '6s' | '8s'; aspect ratio is 16:9 or 9:16 only.
    case 'veo':
      return {
        prompt,
        duration: `${snapDuration(duration, [4, 6, 8])}s`,
        aspect_ratio: aspectRatio === '9:16' ? '9:16' : '16:9',
        resolution: snapResolution(resolution, ['720p', '1080p', '4k'], '720p'),
        generate_audio: true,
        ...(sourceImage && { image_url: sourceImage }),
        ...(negativePrompt && { negative_prompt: negativePrompt }),
        ...(seed !== undefined && seed !== null && { seed }),
      };

    /**
     * Seedance 2.5. Same shape as 2.0 with three differences that each 422 if
     * they are got wrong: the ceiling is 30s rather than 15, the end frame is
     * `end_image_url` rather than `last_image_url`, and there is no
     * `negative_prompt` field at all.
     */
    case 'seedance25':
      return {
        prompt,
        duration: Math.min(Math.max(duration, 4), 30),
        aspect_ratio: aspectRatio,
        resolution: snapResolution(resolution, ['480p', '720p'], '720p'),
        generate_audio: true,
        ...(sourceImage && { image_url: sourceImage }),
        ...(endFrameUrl && { end_image_url: endFrameUrl }),
        ...(referenceImageUrls?.length && { image_urls: referenceImageUrls }),
        ...(seed !== undefined && seed !== null && { seed }),
      };

    // duration is a stringified integer 3-15. No resolution field. The 2.5
    // Turbo tier has no audio track, hence omitAudio.
    case 'kling':
      return {
        prompt,
        duration: String(Math.min(Math.max(duration, 3), 15)),
        aspect_ratio: aspectRatio,
        ...(omitAudio ? {} : { generate_audio: true }),
        cfg_scale: 0.5,
        ...(sourceImage && { image_url: sourceImage }),
        ...(negativePrompt && { negative_prompt: negativePrompt }),
      };

    // The pro tier takes neither duration nor resolution — sending either 422s.
    case 'hailuo':
      return {
        prompt,
        prompt_optimizer: true,
        ...(sourceImage && { image_url: sourceImage }),
      };

    // duration is a stringified '5' | '10' | '15'; 2.6 has no 480p.
    case 'wan':
      return {
        prompt,
        duration: String(snapDuration(duration, [5, 10, 15])),
        aspect_ratio: aspectRatio,
        resolution: snapResolution(resolution, ['480p', '720p', '1080p'], '720p'),
        enable_prompt_expansion: true,
        ...(sourceImage && { image_url: sourceImage }),
        ...(negativePrompt && { negative_prompt: negativePrompt }),
        ...(audioUrls?.length && { audio_url: audioUrls[0] }),
        ...(seed !== undefined && seed !== null && { seed }),
      };

    // duration is '5s' | '9s'. No 1:1, and no negative prompt.
    case 'luma':
      return {
        prompt,
        duration: `${snapDuration(duration, [5, 9])}s`,
        aspect_ratio: aspectRatio === '1:1' ? '16:9' : aspectRatio,
        resolution: snapResolution(resolution, ['540p', '720p', '1080p'], '720p'),
        loop: false,
        ...(sourceImage && { image_url: sourceImage }),
      };

    // duration is a stringified '5' | '8'; resolution starts at 360p.
    case 'pixverse':
      return {
        prompt,
        duration: String(snapDuration(duration, [5, 8])),
        aspect_ratio: aspectRatio,
        resolution: snapResolution(resolution, ['360p', '540p', '720p', '1080p'], '720p'),
        ...(sourceImage && { image_url: sourceImage }),
        ...(negativePrompt && { negative_prompt: negativePrompt }),
        ...(seed !== undefined && seed !== null && { seed }),
      };

    // LTX has no duration field at all — length is num_frames at frame_rate.
    // 121 frames at 24 fps is the model default, roughly five seconds.
    case 'ltx': {
      const frameRate = 24;
      return {
        prompt,
        num_frames: Math.min(Math.max(Math.round(duration * frameRate) + 1, 9), 1441),
        frame_rate: frameRate,
        aspect_ratio: aspectRatio,
        resolution: snapResolution(resolution, ['480p', '720p'], '720p'),
        ...(sourceImage && { image_url: sourceImage }),
        ...(negativePrompt && { negative_prompt: negativePrompt }),
        ...(seed !== undefined && seed !== null && { seed }),
      };
    }

    default:
      return { prompt };
  }
}

// ─── Main handler ───

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // ─── Status check ───
    // Polling must not share the generation budget. This route serves two very
    // different calls: starting a render (expensive, 10/hour is right) and
    // asking whether it finished (cheap, and unavoidable — every provider here
    // returns only a predictionId, so one 1-3 minute render needs dozens of
    // polls). Charging both to the same bucket killed a render at roughly the
    // tenth poll, about 50 seconds in, long before any real render completes
    // and after the caller had already paid in DHB. Status checks get their
    // own generous bucket.
    if (body.predictionId) {
      const pollLimited = await rateLimitByIp(req, 'generate-video-status', {
        limit: 600,
        windowMs: 60 * 60 * 1000,
      });
      if (pollLimited) return pollLimited;

      const provider = body.provider || 'replicate';

      if (provider === 'fal') {
        return await handleFalStatusCheck(body.predictionId, body.falAppId);
      }
      return await handleReplicateStatusCheck(body.predictionId);
    }

    // ─── New generation ───
    const { prompt, model, sourceImage, duration = '5s', aspectRatio = '16:9', negativePrompt, resolution, referenceImageUrls, endFrameUrl, audioUrls, videoUrls, seed } = body as GenerateVideoRequest;

    if (!prompt) throw new Error('Prompt is required');
    if (!model || !VIDEO_MODELS[model]) {
      throw new Error(`Invalid model. Available: ${Object.keys(VIDEO_MODELS).join(', ')}`);
    }

    const modelConfig = VIDEO_MODELS[model];
    console.log(`Generating video with ${modelConfig.name}: "${prompt.substring(0, 100)}..."`);

    // Validate image-to-video only models
    if (model === 'runway-gen4' && !sourceImage) {
      return new Response(
        JSON.stringify({
          error: 'Runway Gen-4 requires an image. Please attach an image to animate, or select a different model.',
          status: 'failed',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Authenticate, price and debit. Charged after validation so a rejected
    // request never costs anything, and before the provider so a render cannot
    // be started for free.
    const charged = await chargeForJob(req, {
      kind: 'video',
      modelId: model,
      actionType: 'generate-video',
      rateLimit: { limit: 20, windowMs: 60 * 60 * 1000 },
      durationSeconds: parseInt(String(duration), 10) || undefined,
    });
    if (!charged.ok) return charged.response;

    // Route to provider
    try {
      const response = modelConfig.provider === 'fal'
        ? await handleFalGeneration(modelConfig, prompt, sourceImage, duration, aspectRatio, negativePrompt, resolution, referenceImageUrls, endFrameUrl, audioUrls, videoUrls, seed)
        : await handleReplicateGeneration(modelConfig, model, prompt, sourceImage, duration, aspectRatio, negativePrompt, resolution, seed);
      if (!response.ok) await charged.refund();
      return response;
    } catch (providerError) {
      await charged.refund();
      throw providerError;
    }

  } catch (error) {
    console.error('Error in generate-video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, status: 'failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

// ─── fal.ai generation ───

async function handleFalGeneration(
  modelConfig: typeof VIDEO_MODELS[string],
  prompt: string,
  sourceImage?: string,
  duration = '5s',
  aspectRatio = '16:9',
  negativePrompt?: string,
  resolution?: '480p' | '720p' | '1080p',
  referenceImageUrls?: string[],
  endFrameUrl?: string,
  audioUrls?: string[],
  videoUrls?: string[],
  seed?: number,
) {
  const FAL_KEY = Deno.env.get('FAL_KEY');
  if (!FAL_KEY) throw new Error('FAL_KEY is not configured');

  // Choose the right endpoint: reference-to-video if ref images, image-to-video if source image, else text-to-video
  let appId: string;
  if (referenceImageUrls && referenceImageUrls.length > 0 && modelConfig.falReferenceModel) {
    appId = modelConfig.falReferenceModel;
  } else if (sourceImage && modelConfig.falImageModel) {
    appId = modelConfig.falImageModel;
  } else {
    appId = modelConfig.falTextModel || modelConfig.id;
  }

  // 30 is Seedance 2.5's ceiling and the highest any family here accepts. Every
  // builder clamps or snaps to its own model's range below, so this outer bound
  // only has to avoid truncating the longest of them — it used to cap at 15,
  // which silently billed a 30s Seedance 2.5 render as a 15s one.
  const parsedDuration = Math.min(Math.max(parseInt(duration) || 5, 3), 30);

  const input = buildFalInput(modelConfig.falFamily ?? 'seedance', {
    prompt,
    sourceImage,
    duration: parsedDuration,
    aspectRatio,
    negativePrompt,
    resolution,
    referenceImageUrls,
    endFrameUrl,
    audioUrls,
    videoUrls,
    seed,
    omitAudio: modelConfig.falOmitAudio,
  });

  console.log(`[fal.ai] Submitting to ${appId}`, JSON.stringify(input).substring(0, 500));

  const result = await falSubmit(FAL_KEY, appId, input);
  console.log(`[fal.ai] Request started: ${result.request_id}`);

  const response: VideoGenerationResponse = {
    status: 'starting',
    predictionId: result.request_id,
    provider: 'fal',
  };

  return new Response(JSON.stringify({ ...response, falAppId: appId }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── fal.ai status check ───

async function handleFalStatusCheck(requestId: string, falAppId?: string) {
  const FAL_KEY = Deno.env.get('FAL_KEY');
  if (!FAL_KEY) throw new Error('FAL_KEY is not configured');

  const appId = falAppId || 'fal-ai/seedance-2.0/text-to-video';
  console.log(`[fal.ai] Checking status for ${requestId} on ${appId}`);

  const statusData = await falStatus(FAL_KEY, appId, requestId);
  const mappedStatus = mapFalStatus(statusData.status);

  let videoUrl: string | undefined;
  if (mappedStatus === 'succeeded') {
    const resultData = await falResult(FAL_KEY, appId, requestId);
    videoUrl = resultData.video?.url;
  }

  const response: VideoGenerationResponse = {
    status: mappedStatus,
    videoUrl,
    predictionId: requestId,
    provider: 'fal',
    ...(mappedStatus === 'failed' && { error: 'Video generation failed on fal.ai' }),
  };

  return new Response(JSON.stringify(response), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Replicate status check ───

async function handleReplicateStatusCheck(predictionId: string) {
  const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
  if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY is not configured');

  const replicate = new Replicate({ auth: REPLICATE_API_KEY });
  console.log('Checking status for prediction:', predictionId);
  const prediction = await replicate.predictions.get(predictionId);
  console.log('Status:', prediction.status);

  let videoUrl: string | undefined;
  if (prediction.status === 'succeeded' && prediction.output) {
    if (typeof prediction.output === 'string') {
      videoUrl = prediction.output;
    } else if (Array.isArray(prediction.output)) {
      videoUrl = prediction.output[0];
    } else if (prediction.output.video) {
      videoUrl = prediction.output.video;
    }
  }

  const response: VideoGenerationResponse = {
    status: prediction.status as VideoGenerationResponse['status'],
    videoUrl,
    predictionId,
    error: prediction.error,
  };

  return new Response(JSON.stringify(response), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Replicate generation ───

async function handleReplicateGeneration(
  modelConfig: typeof VIDEO_MODELS[string],
  model: string,
  prompt: string,
  sourceImage?: string,
  duration = '5s',
  aspectRatio = '16:9',
  negativePrompt?: string,
  resolution?: string,
  seed?: number,
) {
  const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
  if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY is not configured');

  const replicate = new Replicate({ auth: REPLICATE_API_KEY });
  const input = buildReplicateInput(model, { prompt, sourceImage, duration, aspectRatio, negativePrompt, resolution, seed });

  console.log('Model input:', JSON.stringify(input).substring(0, 200));

  const predictionParams: { model?: string; version?: string; input: Record<string, unknown> } = { input };

  if (modelConfig.version) {
    predictionParams.version = modelConfig.version;
  } else {
    predictionParams.model = modelConfig.id;
  }

  const prediction = await replicate.predictions.create(predictionParams);
  console.log('Prediction started:', prediction.id);

  const response: VideoGenerationResponse = {
    status: prediction.status as VideoGenerationResponse['status'],
    predictionId: prediction.id,
  };

  return new Response(JSON.stringify(response), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
