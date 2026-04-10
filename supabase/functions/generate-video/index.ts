import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Premium video generation models via Replicate
const VIDEO_MODELS: Record<string, {
  id: string;
  name: string;
  description: string;
  supports: readonly string[];
  duration: string;
  version?: string;
  provider?: 'replicate' | 'fal';
  falTextModel?: string;
  falImageModel?: string;
}> = {
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
    falTextModel: 'bytedance/seedance-2.0/text-to-video',
    falImageModel: 'bytedance/seedance-2.0/image-to-video',
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
  resolution?: '480p' | '720p';
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

function buildReplicateInput(
  model: string,
  prompt: string,
  sourceImage?: string,
  duration = '5s',
  aspectRatio = '16:9',
): Record<string, unknown> {
  switch (model) {
    case 'kling-2.6-pro':
      return {
        prompt,
        duration: duration === '10s' ? 10 : 5,
        aspect_ratio: aspectRatio,
        generate_audio: true,
        ...(sourceImage && { start_image: sourceImage }),
      };
    case 'luma-ray2':
      return { prompt, aspect_ratio: aspectRatio, loop: false };
    case 'minimax-video':
      return { prompt, ...(sourceImage && { first_frame_image: sourceImage }) };
    case 'runway-gen4':
      return {
        prompt,
        duration: parseInt(duration),
        ratio: aspectRatio,
        ...(sourceImage && { image: sourceImage }),
      };
    case 'ltx-video':
      return { prompt, ...(sourceImage && { image: sourceImage }) };
    case 'seedance-1.5-pro':
      return {
        prompt,
        duration: Math.min(Math.max(parseInt(duration) || 5, 2), 12),
        aspect_ratio: aspectRatio,
        resolution: '720p',
        generate_audio: true,
        ...(sourceImage && { image: sourceImage }),
      };
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
    if (body.predictionId) {
      const provider = body.provider || 'replicate';

      if (provider === 'fal') {
        return await handleFalStatusCheck(body.predictionId, body.falAppId);
      }
      return await handleReplicateStatusCheck(body.predictionId);
    }

    // ─── New generation ───
    const { prompt, model, sourceImage, duration = '5s', aspectRatio = '16:9', negativePrompt, resolution } = body as GenerateVideoRequest;

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

    // Route to provider
    if (modelConfig.provider === 'fal') {
      return await handleFalGeneration(modelConfig, prompt, sourceImage, duration, aspectRatio, negativePrompt, resolution);
    }
    return await handleReplicateGeneration(modelConfig, model, prompt, sourceImage, duration, aspectRatio);

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
  resolution?: '480p' | '720p',
) {
  const FAL_KEY = Deno.env.get('FAL_KEY');
  if (!FAL_KEY) throw new Error('FAL_KEY is not configured');

  const appId = sourceImage && modelConfig.falImageModel
    ? modelConfig.falImageModel
    : modelConfig.falTextModel || modelConfig.id;

  const parsedDuration = Math.min(Math.max(parseInt(duration) || 5, 4), 15);

  const input: Record<string, unknown> = {
    prompt,
    duration: parsedDuration,
    aspect_ratio: aspectRatio,
    resolution: resolution || '720p',
    generate_audio: true,
    ...(sourceImage && { image_url: sourceImage }),
    ...(negativePrompt && { negative_prompt: negativePrompt }),
  };

  console.log(`[fal.ai] Submitting to ${appId}`, JSON.stringify(input).substring(0, 200));

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
) {
  const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
  if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY is not configured');

  const replicate = new Replicate({ auth: REPLICATE_API_KEY });
  const input = buildReplicateInput(model, prompt, sourceImage, duration, aspectRatio);

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
