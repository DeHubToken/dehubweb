/**
 * 3D mesh generation.
 * ===================
 * Same contract as generate-video: POST a job to get a ticket, POST the ticket
 * to poll it. The client's poller is shared between the two, so the response
 * shape here deliberately mirrors that one — `predictionId` / `provider` /
 * `falAppId` going out, `status` plus an asset url coming back.
 *
 * Every model runs on fal.ai's queue API. The field names differ per family and
 * are NOT interchangeable (image_url vs input_image_url vs input_image_urls), so
 * each one gets an explicit builder rather than a shared spread.
 */
import { rateLimitByIp } from '../_shared/auth.ts';
import { chargeForJob } from '../_shared/ai-credit-guard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type Mode = 'text-to-3d' | 'image-to-3d';

interface Model3dConfig {
  name: string;
  supports: readonly Mode[];
  /** fal.ai app id for the text path, when the model has one. */
  falTextModel?: string;
  /** fal.ai app id for the image path, when the model has one. */
  falImageModel?: string;
}

const MODEL3D_MODELS: Record<string, Model3dConfig> = {
  'tripo-2.5': {
    name: 'Tripo 2.5',
    supports: ['text-to-3d', 'image-to-3d'],
    falTextModel: 'tripo3d/tripo/v2.5/text-to-3d',
    falImageModel: 'tripo3d/tripo/v2.5/image-to-3d',
  },
  'hunyuan3d-v2': {
    name: 'Hunyuan3D 2.0',
    supports: ['image-to-3d'],
    falImageModel: 'fal-ai/hunyuan3d/v2',
  },
  trellis: {
    name: 'TRELLIS',
    supports: ['image-to-3d'],
    falImageModel: 'fal-ai/trellis',
  },
  'rodin-hyper3d': {
    name: 'Rodin (Hyper3D)',
    // One endpoint serves both paths; it reads `prompt`, `input_image_urls` or both.
    supports: ['text-to-3d', 'image-to-3d'],
    falTextModel: 'fal-ai/hyper3d/rodin',
    falImageModel: 'fal-ai/hyper3d/rodin',
  },
};

interface Generate3dRequest {
  prompt?: string;
  model: string;
  /** Public https URL of the reference image. Data URLs are staged client-side. */
  sourceImage?: string;
  /** Extra views of the same subject, for models that read more than one. */
  referenceImageUrls?: string[];
  negativePrompt?: string;
  textureQuality?: 'none' | 'standard' | 'HD';
  pbr?: boolean;
  faceLimit?: number;
  quad?: boolean;
  seed?: number;
  /** Rodin only. Everything else always returns GLB. */
  exportFormat?: 'glb' | 'usdz' | 'fbx' | 'obj' | 'stl';
}

interface Generate3dResponse {
  modelUrl?: string;
  /** Provider-rendered preview still, when one comes back. Free thumbnail. */
  previewImageUrl?: string;
  predictionId?: string;
  provider?: string;
  falAppId?: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed';
  error?: string;
}

// ─── fal.ai queue helpers (same shape as generate-video) ───

async function falSubmit(
  falKey: string,
  appId: string,
  input: Record<string, unknown>,
): Promise<{ request_id: string }> {
  const res = await fetch(`https://queue.fal.run/${appId}`, {
    method: 'POST',
    headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
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
): Promise<{ status: string }> {
  const res = await fetch(`https://queue.fal.run/${appId}/requests/${requestId}/status`, {
    headers: { Authorization: `Key ${falKey}` },
  });
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
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://queue.fal.run/${appId}/requests/${requestId}`, {
    headers: { Authorization: `Key ${falKey}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fal.ai result error (${res.status}): ${text}`);
  }
  return res.json();
}

function mapFalStatus(s: string): Generate3dResponse['status'] {
  switch (s) {
    case 'COMPLETED':
      return 'succeeded';
    case 'FAILED':
      return 'failed';
    case 'IN_QUEUE':
      return 'starting';
    case 'IN_PROGRESS':
      return 'processing';
    default:
      return 'processing';
  }
}

/**
 * Pull the mesh URL out of a fal.ai result.
 *
 * The families disagree on the key: Tripo, TRELLIS and Rodin use `model_mesh`,
 * Hunyuan3D returns `model_glb` (and `model_glb_pbr` when textured) alongside
 * `model_mesh`. Prefer the textured PBR variant when the provider produced one,
 * since that is what the creator paid the texture surcharge for.
 */
function extractMeshUrl(result: Record<string, unknown>): string | undefined {
  const asFile = (v: unknown): string | undefined => {
    if (!v) return undefined;
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && v !== null) {
      const url = (v as { url?: unknown }).url;
      if (typeof url === 'string') return url;
    }
    return undefined;
  };

  return (
    asFile(result.model_glb_pbr) ??
    asFile(result.model_mesh) ??
    asFile(result.model_glb) ??
    asFile(result.model) ??
    undefined
  );
}

/** Provider-rendered turntable still, where offered. Used as the library thumbnail. */
function extractPreviewUrl(result: Record<string, unknown>): string | undefined {
  const rendered = result.rendered_image;
  if (rendered && typeof rendered === 'object') {
    const url = (rendered as { url?: unknown }).url;
    if (typeof url === 'string') return url;
  }
  return undefined;
}

// ─── Per-family input builders ───

/** Tripo's texture channel is a tri-state enum, not a boolean. */
function tripoTexture(q: Generate3dRequest['textureQuality']): 'no' | 'standard' | 'HD' {
  if (q === 'none') return 'no';
  if (q === 'HD') return 'HD';
  return 'standard';
}

function buildFalInput(
  modelKey: string,
  appId: string,
  req: Generate3dRequest,
  imageUrl: string | undefined,
): Record<string, unknown> {
  const textured = req.textureQuality !== 'none';

  switch (modelKey) {
    case 'tripo-2.5': {
      const shared: Record<string, unknown> = {
        texture: tripoTexture(req.textureQuality),
        // fal rejects pbr:true alongside texture:'no'; texture is the gate.
        pbr: textured ? req.pbr !== false : false,
        ...(req.faceLimit ? { face_limit: req.faceLimit } : {}),
        ...(req.quad ? { quad: true } : {}),
        ...(req.seed !== undefined ? { seed: req.seed } : {}),
      };
      if (appId.endsWith('/image-to-3d')) {
        return {
          ...shared,
          image_url: imageUrl,
          texture_alignment: 'original_image',
          orientation: 'align_image',
        };
      }
      return {
        ...shared,
        prompt: req.prompt,
        ...(req.negativePrompt ? { negative_prompt: req.negativePrompt } : {}),
      };
    }

    case 'hunyuan3d-v2':
      return {
        input_image_url: imageUrl,
        textured_mesh: textured,
        ...(req.seed !== undefined ? { seed: req.seed } : {}),
      };

    case 'trellis':
      return {
        image_url: imageUrl,
        // 512 / 1024 / 2048 — step down when the creator asked for no texture so
        // the mesh comes back faster and smaller.
        texture_size: req.textureQuality === 'HD' ? 2048 : textured ? 1024 : 512,
        ...(req.seed !== undefined ? { seed: req.seed } : {}),
      };

    case 'rodin-hyper3d': {
      // Rodin takes a list, and reads prompt and images together when both are
      // present, so this endpoint covers both modes without branching on one.
      const images = [
        ...(imageUrl ? [imageUrl] : []),
        ...(req.referenceImageUrls ?? []),
      ].slice(0, 5);
      return {
        ...(req.prompt ? { prompt: req.prompt } : {}),
        ...(images.length ? { input_image_urls: images } : {}),
        geometry_file_format: req.exportFormat ?? 'glb',
        material: textured && req.pbr !== false ? 'PBR' : 'Shaded',
        quality: req.textureQuality === 'HD' ? 'high' : 'medium',
        tier: 'Regular',
      };
    }

    default:
      throw new Error(`No input builder for model ${modelKey}`);
  }
}

// ─── Handler ───

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // ─── Status check ───
    //
    // Polls get their own, far larger bucket. They share an endpoint with
    // submissions but not a cost: a single paid mesh takes 1-5 minutes and
    // polls every 5-15s, so charging polls to the 10/hour generation budget
    // would exhaust it inside a minute and abandon a render already paid for.
    if (body.predictionId) {
      const pollLimited = await rateLimitByIp(req, 'generate-3d-status', {
        limit: 600,
        windowMs: 60 * 60 * 1000,
      });
      if (pollLimited) return pollLimited;
      return await handleStatusCheck(body.predictionId, body.falAppId);
    }

    // ─── New generation ───
    const request = body as Generate3dRequest;
    const { prompt, model, sourceImage } = request;

    if (!model || !MODEL3D_MODELS[model]) {
      throw new Error(`Invalid model. Available: ${Object.keys(MODEL3D_MODELS).join(', ')}`);
    }

    const config = MODEL3D_MODELS[model];
    const mode: Mode = sourceImage ? 'image-to-3d' : 'text-to-3d';

    if (!config.supports.includes(mode)) {
      const needed = mode === 'image-to-3d' ? 'cannot use a reference image' : 'needs a reference image';
      return new Response(
        JSON.stringify({ error: `${config.name} ${needed}.`, status: 'failed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (mode === 'text-to-3d' && !prompt?.trim()) {
      throw new Error('Describe what to model, or attach an image.');
    }

    const FAL_KEY = Deno.env.get('FAL_KEY');
    if (!FAL_KEY) throw new Error('FAL_KEY is not configured');

    const appId = mode === 'image-to-3d' ? config.falImageModel : config.falTextModel;
    if (!appId) throw new Error(`${config.name} has no endpoint for ${mode}`);

    // Texturing is billed by the provider as a multiplier, so the quote has to
    // see the quality the caller actually asked for.
    const charged = await chargeForJob(req, {
      kind: 'model3d',
      modelId: model,
      actionType: 'generate-3d',
      rateLimit: { limit: 20, windowMs: 60 * 60 * 1000 },
      quality: request.textureQuality ?? 'standard',
    });
    if (!charged.ok) return charged.response;

    const input = buildFalInput(model, appId, request, sourceImage);
    console.log(`[3d] Submitting to ${appId}`, JSON.stringify(input).substring(0, 400));

    let submitted;
    try {
      submitted = await falSubmit(FAL_KEY, appId, input);
    } catch (providerError) {
      await charged.refund();
      throw providerError;
    }
    console.log(`[3d] Queued: ${submitted.request_id}`);

    const response: Generate3dResponse = {
      status: 'starting',
      predictionId: submitted.request_id,
      provider: 'fal',
      falAppId: appId,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-3d:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message, status: 'failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleStatusCheck(requestId: string, falAppId?: string) {
  const FAL_KEY = Deno.env.get('FAL_KEY');
  if (!FAL_KEY) throw new Error('FAL_KEY is not configured');

  // No default app id: unlike video there is no single dominant endpoint, and
  // guessing one would poll a different queue and never resolve.
  if (!falAppId) throw new Error('falAppId is required to check a 3D render');

  const statusData = await falStatus(FAL_KEY, falAppId, requestId);
  const mapped = mapFalStatus(statusData.status);

  let modelUrl: string | undefined;
  let previewImageUrl: string | undefined;
  if (mapped === 'succeeded') {
    const result = await falResult(FAL_KEY, falAppId, requestId);
    modelUrl = extractMeshUrl(result);
    previewImageUrl = extractPreviewUrl(result);
  }

  const response: Generate3dResponse = {
    status: mapped,
    modelUrl,
    previewImageUrl,
    predictionId: requestId,
    provider: 'fal',
    falAppId,
    ...(mapped === 'failed' && { error: '3D generation failed on fal.ai' }),
  };

  return new Response(JSON.stringify(response), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
