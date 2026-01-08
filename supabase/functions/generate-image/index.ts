import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface GenerateImageRequest {
  prompt: string;
  sourceImage?: string; // Base64 data URL for editing
  conversationHistory?: ConversationMessage[];
}

// DeHub logo as base64 (white logo for watermark)
const DEHUB_LOGO_BASE64 = `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`;

// Decode base64 and add watermark to image
async function addWatermark(imageBase64: string): Promise<string> {
  try {
    // Extract the base64 data (remove data URL prefix if present)
    const base64Data = imageBase64.includes(',') 
      ? imageBase64.split(',')[1] 
      : imageBase64;
    
    // Decode the main image
    const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const mainImage = await Image.decode(imageBuffer);
    
    // Decode the watermark logo
    const logoBuffer = Uint8Array.from(atob(DEHUB_LOGO_BASE64), c => c.charCodeAt(0));
    const logoImage = await Image.decode(logoBuffer);
    
    // Calculate watermark size (scale to ~10% of image width, max 150px)
    const targetWidth = Math.min(Math.floor(mainImage.width * 0.12), 150);
    const scaleFactor = targetWidth / logoImage.width;
    const targetHeight = Math.floor(logoImage.height * scaleFactor);
    
    // Resize the logo
    const resizedLogo = logoImage.resize(targetWidth, targetHeight);
    
    // Apply some transparency to the watermark (60% opacity)
    for (let x = 0; x < resizedLogo.width; x++) {
      for (let y = 0; y < resizedLogo.height; y++) {
        const pixel = resizedLogo.getPixelAt(x + 1, y + 1);
        const r = (pixel >> 24) & 0xFF;
        const g = (pixel >> 16) & 0xFF;
        const b = (pixel >> 8) & 0xFF;
        const a = pixel & 0xFF;
        // Reduce alpha to 60%
        const newAlpha = Math.floor(a * 0.6);
        resizedLogo.setPixelAt(x + 1, y + 1, (r << 24) | (g << 16) | (b << 8) | newAlpha);
      }
    }
    
    // Calculate position (bottom-right corner with padding)
    const padding = 15;
    const x = mainImage.width - resizedLogo.width - padding;
    const y = mainImage.height - resizedLogo.height - padding;
    
    // Composite the watermark onto the main image
    mainImage.composite(resizedLogo, x, y);
    
    // Encode back to PNG and return as base64 data URL
    const outputBuffer = await mainImage.encode();
    const outputBase64 = btoa(String.fromCharCode(...outputBuffer));
    
    return `data:image/png;base64,${outputBase64}`;
  } catch (error) {
    console.error('Error adding watermark:', error);
    // Return original image if watermarking fails
    return imageBase64;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, sourceImage, conversationHistory = [] } = await req.json() as GenerateImageRequest;

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Generating image with prompt:', prompt.substring(0, 100), '| Has source image:', !!sourceImage, '| Conversation history length:', conversationHistory.length);

    // Build context from conversation history
    let contextualPrompt = prompt;
    if (conversationHistory.length > 0) {
      // Build a summary of recent conversation for context
      const recentHistory = conversationHistory.slice(-6); // Last 6 messages for context
      const contextSummary = recentHistory
        .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
        .join('\n');
      
      contextualPrompt = `CONVERSATION CONTEXT (use this to understand references like "him", "it", "that", etc.):\n${contextSummary}\n\nCURRENT REQUEST: ${prompt}`;
    }

    // Build messages based on whether we're editing or generating
    const messages = sourceImage ? [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: sourceImage } },
          { type: 'text', text: contextualPrompt }
        ]
      }
    ] : [
      { role: 'user', content: contextualPrompt }
    ];

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages,
        modalities: ['image', 'text']
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Image generation API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please try again later.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Image generation failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('Image generation response received');

    // Check for safety filter - return family-friendly message
    const finishReason = data.choices?.[0]?.native_finish_reason || data.choices?.[0]?.finish_reason;
    if (finishReason === 'IMAGE_SAFETY') {
      console.log('Content blocked by safety filter');
      return new Response(
        JSON.stringify({ 
          error: 'DeHub is a family friendly platform, for adult requests refer to our adult partner fan.site',
          safetyBlocked: true 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract the generated image
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const textResponse = data.choices?.[0]?.message?.content || '';

    if (!imageUrl) {
      console.error('No image in response:', JSON.stringify(data).substring(0, 500));
      return new Response(
        JSON.stringify({ error: 'No image was generated. Try rephrasing your request.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Add DeHub watermark to the generated image
    console.log('Adding DeHub watermark to generated image...');
    const watermarkedImage = await addWatermark(imageUrl);
    console.log('Watermark added successfully');

    return new Response(
      JSON.stringify({ 
        imageUrl: watermarkedImage, 
        text: textResponse,
        success: true 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in generate-image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
