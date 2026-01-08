import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Premium video generation models via Replicate
const VIDEO_MODELS = {
  // Kling - Best for cinematic quality
  'kling-1.6-pro': {
    id: 'kwaivgi/kling-video:3dab041a-35b2-4929-8576-1e1ba0ddad5c',
    name: 'Kling 1.6 Pro',
    description: 'Best cinematic quality, professional-grade videos',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5s or 10s',
  },
  'kling-1.5-pro': {
    id: 'kwaivgi/kling-video:52a80dc5-f413-46b0-8189-e1bb7d797497',
    name: 'Kling 1.5 Pro',
    description: 'High quality, reliable cinematic output',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5s or 10s',
  },
  // Luma Dream Machine - Surreal/creative
  'luma-ray2': {
    id: 'luma/ray2',
    name: 'Luma Ray 2',
    description: 'Latest Luma model, photorealistic results',
    supports: ['text-to-video', 'image-to-video'],
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
  // Wan 2.1 - Open source, great value
  'wan-2.1': {
    id: 'wavymulder/wan-2.1:d4a69a9ff4e4c1a2b8cbb8772e8d6c7f7e234a7c',
    name: 'Wan 2.1',
    description: 'Open source, excellent value and quality',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5s',
  },
  // Runway Gen-3 Alpha
  'runway-gen3': {
    id: 'fofr/runway-gen3-turbo',
    name: 'Runway Gen-3 Turbo',
    description: 'Industry leader, stunning visual quality',
    supports: ['text-to-video', 'image-to-video'],
    duration: '10s',
  },
  // Lightricks LTX Video
  'ltx-video': {
    id: 'lightricks/ltx-video',
    name: 'LTX Video',
    description: 'Fast, efficient, good for quick generations',
    supports: ['text-to-video', 'image-to-video'],
    duration: '5s',
  },
  // Hunyuan - Chinese model, creative
  'hunyuan-video': {
    id: 'tencent/hunyuan-video',
    name: 'Hunyuan Video',
    description: 'Creative and artistic style',
    supports: ['text-to-video'],
    duration: '5s',
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

    // Build input based on model type
    let input: Record<string, unknown> = { prompt };

    // Model-specific configurations
    switch (model) {
      case 'kling-1.6-pro':
      case 'kling-1.5-pro':
        input = {
          prompt,
          duration: duration === '10s' ? '10' : '5',
          aspect_ratio: aspectRatio,
          ...(sourceImage && { image: sourceImage }),
        };
        break;

      case 'luma-ray2':
        input = {
          prompt,
          aspect_ratio: aspectRatio,
          ...(sourceImage && { start_image_url: sourceImage }),
        };
        break;

      case 'minimax-video':
        input = {
          prompt,
          ...(sourceImage && { first_frame_image: sourceImage }),
        };
        break;

      case 'wan-2.1':
        input = {
          prompt,
          aspect_ratio: aspectRatio,
          ...(sourceImage && { image: sourceImage }),
        };
        break;

      case 'runway-gen3':
        input = {
          prompt,
          duration: parseInt(duration),
          aspect_ratio: aspectRatio,
          ...(sourceImage && { image: sourceImage }),
        };
        break;

      case 'ltx-video':
        input = {
          prompt,
          ...(sourceImage && { image: sourceImage }),
        };
        break;

      case 'hunyuan-video':
        input = {
          prompt,
        };
        break;

      default:
        input = { prompt };
    }

    console.log('Model input:', JSON.stringify(input).substring(0, 200));

    // Start async prediction
    const prediction = await replicate.predictions.create({
      model: modelConfig.id,
      input,
    });

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
