import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ─── Tool definitions ───

type ToolType = 'music' | 'tts' | 'background-removal' | 'upscale' | 'speech-to-text';

interface ToolConfig {
  appId: string;
  name: string;
  async: boolean; // true = uses queue, false = synchronous
  buildInput: (params: Record<string, unknown>) => Record<string, unknown>;
  extractResult: (data: Record<string, unknown>) => Record<string, unknown>;
}

const TOOLS: Record<string, ToolConfig> = {
  // ─── Music Generation ───
  'minimax-music': {
    appId: 'fal-ai/minimax-music/v2',
    name: 'MiniMax Music 2.0',
    async: true,
    buildInput: (p) => ({
      prompt: p.prompt || 'upbeat pop song',
      lyrics_prompt: p.lyrics || p.lyrics_prompt || '[verse]\nLa la la\n[chorus]\nOh oh oh',
    }),
    extractResult: (d) => ({
      audioUrl: (d.audio as Record<string, unknown>)?.url,
    }),
  },
  'ace-step': {
    appId: 'fal-ai/ace-step/prompt-to-audio',
    name: 'ACE-Step',
    async: true,
    buildInput: (p) => ({
      prompt: p.prompt || '',
      lyrics: p.lyrics || '',
      duration: p.duration || 60,
      ...(p.tags && { tags: p.tags }),
    }),
    extractResult: (d) => ({
      audioUrl: (d.audio_file as Record<string, unknown>)?.url || (d.audio as Record<string, unknown>)?.url,
    }),
  },

  // ─── Text-to-Speech ───
  'dia-tts': {
    appId: 'fal-ai/dia-tts',
    name: 'Dia TTS',
    async: false,
    buildInput: (p) => ({
      text: p.text || p.prompt || '',
      ...(p.audio_url && { audio_url: p.audio_url }),
    }),
    extractResult: (d) => ({
      audioUrl: (d.audio as Record<string, unknown>)?.url,
    }),
  },

  // ─── Background Removal ───
  'birefnet': {
    appId: 'fal-ai/birefnet/v2',
    name: 'BiRefNet Background Removal',
    async: false,
    buildInput: (p) => ({
      image_url: p.image_url || p.sourceImage,
      model: 'General Use (Light)',
      operating_resolution: '1024x1024',
      output_format: 'png',
    }),
    extractResult: (d) => ({
      imageUrl: (d.image as Record<string, unknown>)?.url,
    }),
  },

  // ─── Image Upscaling ───
  'creative-upscaler': {
    appId: 'fal-ai/creative-upscaler',
    name: 'Creative Upscaler',
    async: true,
    buildInput: (p) => ({
      image_url: p.image_url || p.sourceImage,
      prompt: p.prompt || '',
      scale: p.scale || 2,
      creativity: p.creativity ?? 0.5,
      detail: p.detail ?? 1,
      shape_preservation: p.shape_preservation ?? 0.25,
    }),
    extractResult: (d) => ({
      imageUrl: (d.image as Record<string, unknown>)?.url,
    }),
  },
  'aura-sr': {
    appId: 'fal-ai/aura-sr',
    name: 'AuraSR (Fast Upscale)',
    async: false,
    buildInput: (p) => ({
      image_url: p.image_url || p.sourceImage,
      upscale_factor: p.scale || 4,
      overlapping_tiles: true,
      checkpoint: 'v2',
    }),
    extractResult: (d) => ({
      imageUrl: (d.image as Record<string, unknown>)?.url,
    }),
  },

  // ─── Speech-to-Text ───
  'whisper': {
    appId: 'fal-ai/wizper',
    name: 'Whisper STT',
    async: false,
    buildInput: (p) => ({
      audio_url: p.audio_url,
      task: p.task || 'transcribe',
      ...(p.language && { language: p.language }),
      chunk_level: 'segment',
    }),
    extractResult: (d) => ({
      text: d.text,
      chunks: d.chunks,
    }),
  },
};

// ─── fal.ai helpers ───

async function falRun(
  falKey: string,
  appId: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://fal.run/${appId}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fal.ai error (${res.status}): ${text}`);
  }
  return res.json();
}

async function falQueueSubmit(
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

async function falQueueStatus(
  falKey: string,
  appId: string,
  requestId: string,
): Promise<{ status: string }> {
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

async function falQueueResult(
  falKey: string,
  appId: string,
  requestId: string,
): Promise<Record<string, unknown>> {
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

function mapFalStatus(s: string): string {
  switch (s) {
    case 'COMPLETED': return 'succeeded';
    case 'FAILED': return 'failed';
    case 'IN_QUEUE': return 'starting';
    case 'IN_PROGRESS': return 'processing';
    default: return 'processing';
  }
}

// ─── Main handler ───

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FAL_KEY = Deno.env.get('FAL_KEY');
    if (!FAL_KEY) throw new Error('FAL_KEY is not configured');

    const body = await req.json();
    const { tool, requestId, appId: statusAppId, ...params } = body;

    // ─── Status check for async tools ───
    if (requestId && statusAppId) {
      console.log(`[fal-tools] Checking status for ${requestId} on ${statusAppId}`);
      const statusData = await falQueueStatus(FAL_KEY, statusAppId, requestId);
      const mappedStatus = mapFalStatus(statusData.status);

      let result: Record<string, unknown> = {};
      if (mappedStatus === 'succeeded') {
        const resultData = await falQueueResult(FAL_KEY, statusAppId, requestId);
        // Try to find the tool config to extract result properly
        const toolConfig = Object.values(TOOLS).find(t => t.appId === statusAppId);
        result = toolConfig ? toolConfig.extractResult(resultData) : resultData;
      }

      return new Response(JSON.stringify({
        status: mappedStatus,
        requestId,
        ...result,
        ...(mappedStatus === 'failed' && { error: 'Processing failed on fal.ai' }),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── New tool request ───
    if (!tool || !TOOLS[tool]) {
      throw new Error(`Invalid tool. Available: ${Object.keys(TOOLS).join(', ')}`);
    }

    const toolConfig = TOOLS[tool];
    const input = toolConfig.buildInput(params);
    console.log(`[fal-tools] ${toolConfig.name}: ${JSON.stringify(input).substring(0, 200)}`);

    if (toolConfig.async) {
      // Queue-based async execution
      const submission = await falQueueSubmit(FAL_KEY, toolConfig.appId, input);
      console.log(`[fal-tools] ${toolConfig.name} queued: ${submission.request_id}`);

      return new Response(JSON.stringify({
        status: 'starting',
        requestId: submission.request_id,
        appId: toolConfig.appId,
        tool,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // Synchronous execution
      const resultData = await falRun(FAL_KEY, toolConfig.appId, input);
      const result = toolConfig.extractResult(resultData);
      console.log(`[fal-tools] ${toolConfig.name} completed`);

      return new Response(JSON.stringify({
        status: 'succeeded',
        tool,
        ...result,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('[fal-tools] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, status: 'failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
