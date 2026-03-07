import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface GenerateImageRequest {
  prompt: string;
  sourceImage?: string;
  conversationHistory?: ConversationMessage[];
  model?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, sourceImage, conversationHistory = [], model = 'gemini-2.5-flash' } = await req.json() as GenerateImageRequest;

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const xaiApiKey = Deno.env.get('XAI_API_KEY');
    
    // Determine which API to use based on model
    const isGrokModel = model.startsWith('grok-');
    
    console.log('Generating image with prompt:', prompt.substring(0, 100), '| Model:', model, '| Has source image:', !!sourceImage, '| Conversation history length:', conversationHistory.length);

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
    const userContent = sourceImage ? [
      { type: 'image_url', image_url: { url: sourceImage } },
      { type: 'text', text: contextualPrompt }
    ] : contextualPrompt;

    // Use Grok Aurora for image generation if selected (but NOT for image editing)
    // Grok's grok-2-image API only supports text-to-image, not image editing
    let usedFallbackForGrok = false;
    
    if (isGrokModel && xaiApiKey && !sourceImage) {
      console.log('Using Grok Aurora for image generation');
      
      const response = await fetch('https://api.x.ai/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${xaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'grok-2-image',
          prompt: contextualPrompt,
          n: 1,
          response_format: 'url',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Grok image API error:', response.status, errorText);
        throw new Error(`Grok image generation failed: ${response.status}`);
      }

      const data = await response.json();
      const imageUrl = data.data?.[0]?.url;

      if (!imageUrl) {
        console.error('No image in Grok response:', JSON.stringify(data).substring(0, 500));
        throw new Error('Grok did not return an image');
      }

      console.log('Grok image generated successfully');
      return new Response(
        JSON.stringify({ imageUrl, text: '', success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // If Grok was selected but has a source image, fall back to Gemini
    if (isGrokModel && sourceImage) {
      console.log('Grok selected with source image - falling back to Gemini (Grok does not support image editing)');
      usedFallbackForGrok = true;
    }

    // Fall back to Lovable AI Gateway
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Map model to Lovable AI model path
    let apiModel = 'google/gemini-2.5-flash-image-preview';
    if (model === 'gemini-3-pro-image') {
      apiModel = 'google/gemini-3-pro-image-preview';
    } else if (model === 'gpt-5') {
      apiModel = 'openai/gpt-5';
    }

    const messages = sourceImage ? [
      { role: 'user', content: userContent }
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
        model: apiModel,
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

    // Check for PROHIBITED_CONTENT error from Google
    const choiceError = data.choices?.[0]?.error;
    if (choiceError?.message === 'PROHIBITED_CONTENT') {
      console.log('Content blocked by Google safety filter (PROHIBITED_CONTENT)');
      return new Response(
        JSON.stringify({ 
          error: 'DeHub is a family friendly platform, for adult requests refer to our adult partner fan.site',
          safetyBlocked: true,
          clearHistory: true // Signal frontend to clear conversation history
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for safety filter - return family-friendly message
    const finishReason = data.choices?.[0]?.native_finish_reason || data.choices?.[0]?.finish_reason;
    if (finishReason === 'IMAGE_SAFETY') {
      console.log('Content blocked by safety filter');
      return new Response(
        JSON.stringify({ 
          error: 'DeHub is a family friendly platform, for adult requests refer to our adult partner fan.site',
          safetyBlocked: true,
          clearHistory: true
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract the generated image
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const textResponse = data.choices?.[0]?.message?.content || '';

    if (!imageUrl) {
      console.error('No image in response:', JSON.stringify(data).substring(0, 500));
      
      // Check if AI refused due to content policy
      const refusalPhrases = [
        'cannot create', 'cannot fulfill', 'cannot generate', 'cannot provide',
        'i cannot', "i'm unable", 'not able to', 'inappropriate', 
        'sexually explicit', 'harmful', 'cannot make', 'unable to create',
        'cannot produce', 'refuse', 'not appropriate'
      ];
      
      const lowerTextResponse = textResponse.toLowerCase();
      const isContentRefusal = refusalPhrases.some(phrase => 
        lowerTextResponse.includes(phrase)
      );
      
      if (isContentRefusal) {
        console.log('Content refusal detected in AI response');
        return new Response(
          JSON.stringify({ 
            error: 'DeHub is a family friendly platform, for adult requests refer to our adult partner fan.site',
            safetyBlocked: true,
            clearHistory: true // Signal frontend to clear conversation history
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // For other failures, return the AI's response or a generic message
      return new Response(
        JSON.stringify({ 
          error: textResponse || 'Could not generate image. Try a different description.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Return image directly without server-side watermarking (moved to client)
    console.log('Image generated successfully, returning to client');

    // Add note if we fell back from Grok to Gemini for image editing
    const finalText = usedFallbackForGrok 
      ? (textResponse ? `${textResponse}\n\n_(Used Gemini for image editing - Grok only supports new image generation)_` : '_(Used Gemini for image editing - Grok only supports new image generation)_')
      : textResponse;

    return new Response(
      JSON.stringify({ 
        imageUrl: imageUrl, 
        text: finalText,
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
