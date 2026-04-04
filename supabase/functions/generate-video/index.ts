import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Premium video generation models via Replicate
const VIDEO_MODELS = {
  // Kling 2.6 - Best for cinematic quality with native audio
  'kling-2.6-pro': {
    id: 'kwaivgi/kling-v2.6',
    name: 'Kling 2.6 Pro',
    description: 'Top-tier cinematic visuals with native audio generation',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5s or 10s',
  },
  // Luma Ray 2 - Official Luma model
  'luma-ray2': {
    id: 'luma/ray-2-720p',
    name: 'Luma Ray 2',
    description: 'Latest Luma model, photorealistic results (720p)',
    supports: ['text-to-video'],
    duration: '5s',
  },
  // Minimax - Fast and good quality
  'minimax-video': {
    id: 'minimax/video-01',
    name: 'Minimax Video-01',
    description: 'Fast generation, good quality',
    supports: ['text-to-video', 'image-to-video'],
    duration: '6s',
  },
  // Runway Gen-4 Turbo - Image-to-video only
  'runway-gen4': {
    id: 'runwayml/gen4-turbo',
    name: 'Runway Gen-4 Turbo',
    description: 'Latest Runway model, stunning visual quality (image-to-video only)',
    supports: ['image-to-video'],
    duration: '10s',
  },
  // Lightricks LTX Video - uses version hash instead of model path
  'ltx-video': {
    id: 'lightricks/ltx-video',
    version: '8c47da666861d081eeb4d1261853087de23923a268a69b63febdf5dc1dee08e4',
    name: 'LTX Video',
    description: 'Fast, efficient, good for quick generations',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5s',
  },
  // Seedance 1.5 Pro by ByteDance - cinematic with native audio
  'seedance-1.5-pro': {
    id: 'bytedance/seedance-1.5-pro',
    name: 'Seedance 1.5 Pro',
    description: 'ByteDance cinematic quality with native audio generation',
    supports: ['text-to-video', 'image-to-video'],
    duration: '2-12s',
  },
} as const;

type ModelKey = keyof typeof VIDEO_MODELS;

interface GenerateVideoRequest {
  prompt: string;
  model: ModelKey;
  sourceImage?: string; // For image-to-video
  duration?: '5s' | '10s';
  aspectRatio?: '16:9' | '9:16' | '1:1';
}

interface VideoGenerationResponse {
  videoUrl?: string;
  predictionId?: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed';
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) {
      throw new Error('REPLICATE_API_KEY is not configured');
    }

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });
    const body = await req.json();

    // Handle status check request
    if (body.predictionId) {
      console.log('Checking status for prediction:', body.predictionId);
      const prediction = await replicate.predictions.get(body.predictionId);
      console.log('Status:', prediction.status);

      let videoUrl: string | undefined;
      if (prediction.status === 'succeeded' && prediction.output) {
        // Handle different output formats
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
        predictionId: body.predictionId,
        error: prediction.error,
      };

      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle generation request
    const { prompt, model, sourceImage, duration = '5s', aspectRatio = '16:9' } = body as GenerateVideoRequest;

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    if (!model || !VIDEO_MODELS[model]) {
      throw new Error(`Invalid model. Available: ${Object.keys(VIDEO_MODELS).join(', ')}`);
    }

    const modelConfig = VIDEO_MODELS[model];
    console.log(`Generating video with ${modelConfig.name}: "${prompt.substring(0, 100)}..."`);

    // Validate image-to-video only models
    if (model === 'runway-gen4' && !sourceImage) {
      return new Response(
        JSON.stringify({ 
          error: 'Runway Gen-4 requires an image. Please attach an image to animate, or select a different model like Kling or Luma.', 
          status: 'failed' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build input based on model type
    let input: Record<string, unknown> = { prompt };

    // Model-specific configurations
    switch (model) {
      case 'kling-2.6-pro':
        input = {
          prompt,
          duration: duration === '10s' ? 10 : 5,
          aspect_ratio: aspectRatio,
          generate_audio: true, // Enable native audio generation
          ...(sourceImage && { start_image: sourceImage }),
        };
        break;

      case 'luma-ray2':
        input = {
          prompt,
          aspect_ratio: aspectRatio,
          loop: false,
        };
        break;

      case 'minimax-video':
        input = {
          prompt,
          ...(sourceImage && { first_frame_image: sourceImage }),
        };
        break;

      case 'runway-gen4':
        input = {
          prompt,
          duration: parseInt(duration),
          ratio: aspectRatio,
          ...(sourceImage && { image: sourceImage }),
        };
        break;

      case 'ltx-video':
        input = {
          prompt,
          ...(sourceImage && { image: sourceImage }),
        };
        break;


      default:
        input = { prompt };
    }

    console.log('Model input:', JSON.stringify(input).substring(0, 200));

    // Start async prediction - use version hash if available, otherwise model path
    const predictionParams: { model?: string; version?: string; input: Record<string, unknown> } = { input };
    
    if ('version' in modelConfig && modelConfig.version) {
      predictionParams.version = modelConfig.version as string;
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

  } catch (error) {
    console.error('Error in generate-video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, status: 'failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
