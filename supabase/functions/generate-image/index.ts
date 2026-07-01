
const serve = (handler: (req: Request) => Response | Promise<Response>) => Deno.serve(handler);

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
    let { prompt, sourceImage, conversationHistory = [], model = 'gemini-2.5-flash' } = await req.json() as GenerateImageRequest;

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const xaiApiKey = Deno.env.get('XAI_API_KEY');
    
    // Determine which API to use based on model
    let isGrokModel = model.startsWith('grok-');
    
    console.log('Generating image with prompt:', prompt.substring(0, 100), '| Model:', model, '| Has source image:', !!sourceImage, '| Conversation history length:', conversationHistory.length);

    // Build context from conversation history
    let contextualPrompt = prompt;
    if (conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-6);
      const contextSummary = recentHistory
        .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
        .join('\n');
      
      contextualPrompt = `CONVERSATION CONTEXT (use this to understand references like "him", "it", "that", etc.):\n${contextSummary}\n\nCURRENT REQUEST: ${prompt}`;
    }

    // ── DeHub brand skill: auto-detect requests for DeHub-branded imagery and
    //    force logo-attached, brand-compliant generation.
    const brandIntent = /\bde\s*hub\b/i.test(prompt) && /\b(posters?|banners?|thumbnails?|content|cards?|announc(?:e|ement|ements?)|flyers?|artworks?|social|covers?|graphics?|ads?|adverts?|images?|logos?|wallpapers?|memes?|promos?|campaigns?)\b/i.test(prompt);
    let brandPromptOverride: string | null = null;
    if (brandIntent && !sourceImage) {
      console.log('[dehub-poster] Brand intent detected — attaching logo + brand system prompt');

      // ── Format detection: pick the right aspect ratio from the user's wording.
      //    GPT-image-2 supports 1024x1024, 1024x1536 (portrait), 1536x1024 (landscape).
      const p = prompt.toLowerCase();
      let posterSize: '1024x1024' | '1024x1536' | '1536x1024' = '1024x1536'; // default: portrait poster
      let formatHint = 'vertical poster (2:3), think movie poster / concert flyer / Instagram story';
      if (/\b(banner|cover|header|hero|billboard|landscape|wide|1920|16:?9|youtube thumb|thumbnail)\b/.test(p)) {
        posterSize = '1536x1024';
        formatHint = 'landscape banner (3:2, close to 16:9), think YouTube cover / web hero / OOH billboard';
      } else if (/\b(square|1:1|instagram post|feed post)\b/.test(p)) {
        posterSize = '1024x1024';
        formatHint = 'square social post (1:1), think Instagram feed / album cover';
      }

      // ── Template library: 15 proven marketing poster archetypes. One is picked at
      //    random per request so the same brief yields different stunning results, and
      //    outputs feel like real campaign work — not a repetitive "brand system" look.
      const TEMPLATES = [
        'Apple keynote hero: single ultra-detailed hero product/subject floating dead-center on infinite black, dramatic top rim light, hard shadow beneath, wide margins, one bold headline word optional.',
        'A24 film poster: cinematic character or object photograph, film-grain, muted teal-magenta duotone accents on black, tiny credits-block treatment near the bottom edge.',
        'Cyberpunk street: rain-slick night alley, neon reflections in puddles, atmospheric haze, blade-runner depth, lone silhouetted figure or object as focal point.',
        'Nike sportswear campaign: dynamic action pose, motion blur, bold cropping, high-contrast lighting, negative space top-left for headline.',
        'Off-White / Virgil fashion editorial: raw industrial textures, exposed grid lines, quotation-mark UI accents, subject centered, deadstock zine energy.',
        'Cosmic scale: astronaut / planet / nebula scene, tiny human silhouette for scale, deep space blacks, muted violet-cyan ambient glow, awe-inspiring vastness.',
        'Liquid glass hero: translucent frosted-glass geometric slab tumbling through dark void, refracted light caustics, ultra-premium fintech energy.',
        'Underground rave flyer: distorted photocopy grain, high-contrast subject, warped type block area, magenta / cyan spot color on charcoal.',
        'Luxury watch ad: macro product photography aesthetic, precision detail, single-source rim light, deep shadow falloff, obsidian background.',
        'Vaporwave sunset: distant chrome-mirror horizon, sun/grid vanishing point, retrofuturist geometry, muted magenta afterglow, dead-center symmetry.',
        'Brutalist typography poster: massive negative space, tiny detail object in one corner, giant implied text-block zone reserved, Swiss-grid discipline.',
        'Sci-fi keyart: single monolithic architectural structure or artifact under an alien sky, tiny scale figure at base, cinematic anamorphic lens flare.',
        'Editorial magazine cover: portrait-style hero shot with shallow depth of field, cover-line block reserved along left margin, high-fashion lighting.',
        'Product launch teaser: single glowing object emerging from pure black, volumetric god-rays, particulate atmosphere, "the reveal" energy.',
        'Concert tour poster: subject in mid-motion under stage haze, high-contrast spotlight, dust particles, gritty concert photography grain, one-headline slot.',
      ];
      const templatePick = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
      console.log('[dehub-poster] Template pick:', templatePick.split(':')[0], '| Size:', posterSize);

      // ── Auto-enhance: rewrite the short user brief into a senior-marketing-director
      //    grade visual prompt. Silent, server-side, hard timeout + fallback.
      let enhancedUserRequest = prompt;
      if (lovableApiKey) {
        try {
          const directorSystem = `You are a senior creative director at a top ad agency (think Wieden+Kennedy, Mother, Anomaly) writing the visual brief for a STUNNING promotional marketing poster for DeHub — a decentralized social platform. Output ONE dense paragraph, 140–200 words, no lists, no preamble, no quotes.

This is a PROMO ASSET meant to hype, sell, and stop the scroll — not a brand-guidelines diagram. Think campaign artwork you'd see on a billboard or in a magazine, not a corporate slide.

FORMAT: ${formatHint}. Compose specifically for this shape.

TEMPLATE ARCHETYPE for this piece: ${templatePick}
Adapt the user's subject into that archetype — don't just describe the archetype generically.

Rules:
- Lead with a hero subject that dramatizes the user's brief. Real photography feel, cinematic depth, editorial polish.
- Then: environment, lighting (specify direction and quality: rim / key / backlight / god-rays / neon reflection), materials & textures, camera/lens feel (specify: anamorphic / macro / wide / shallow DOF), mood, composition, negative space reserved for a logo lockup in a specific named region.
- Palette: deep black/charcoal (#000–#0a0a0a), white, subtle white-opacity accents, optional muted neon glow (magenta/violet/cyan). NEVER blue.
- Add craft specifics: film grain, subtle chromatic aberration, atmospheric haze, dust particulates, depth cues.
- Reserve a named clear region for the logo (e.g. "bottom-center third", "upper-right quadrant") — do NOT draw a logo or wordmark text yourself.
- No stock-AI clichés (purple/indigo gradients on white, floating 3D blobs, generic hero-with-arms-up). No emoji.
- Never invent facts (dates, prices, names, quotes) the user didn't state. If no headline is warranted, say "no additional text".
- End with: "4k, campaign quality, editorial polish, poster-grade detail."`;
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 4000);
          const rewriteRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                { role: 'system', content: directorSystem },
                { role: 'user', content: `User brief: ${prompt}` },
              ],
            }),
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          if (rewriteRes.ok) {
            const rj = await rewriteRes.json();
            const rewritten = rj.choices?.[0]?.message?.content?.trim();
            if (rewritten && rewritten.length > 40) {
              enhancedUserRequest = rewritten;
              console.log('[dehub-poster] Prompt enhanced:', prompt.substring(0, 80), '→', rewritten.substring(0, 140));
            } else {
              console.log('[dehub-poster] Rewrite empty/short, using original prompt');
            }
          } else {
            console.warn('[dehub-poster] Rewrite failed', rewriteRes.status, '— using original prompt');
          }
        } catch (e) {
          console.warn('[dehub-poster] Rewrite error/timeout — using original prompt:', (e as Error).message);
        }
      }

      brandPromptOverride = `Create a STUNNING promotional marketing poster (not a brand-guidelines layout). This is campaign artwork — think billboard, magazine cover, movie key-art. Cinematic, editorial, premium.

Format: ${formatHint}. Compose for this aspect ratio.

Non-negotiable brand rules:
- Palette: deep black / charcoal (#000–#0a0a0a) dominant, white accents, subtle muted neon glow (magenta / violet / cyan) OK. NEVER any blue.
- Include the DeHub wordmark ONCE, small-to-medium, as PURE WHITE bold uppercase "DEHUB" in Exo / Exo 2 (fall back Eurostile / Michroma) with generous clear space, placed in the reserved logo region — do NOT plaster it, do NOT recolor, do NOT distort.
- No emoji. No purple/indigo gradients on white. No glossy 3D blobs. No generic AI stock look.
- Any additional text must be Exo / Exo 2, white, wide letter-spacing, minimal.

ART DIRECTION: ${enhancedUserRequest}`;


      // Try GPT-image-2 (medium) first — dramatically better typography than Gemini
      // for the DeHub wordmark and brand text. Falls through to Gemini path below on failure.
      if (lovableApiKey) {
        try {
          console.log('[dehub-poster] Trying openai/gpt-image-2 (medium) for brand request');
          const gptRes = await fetch('https://ai.gateway.lovable.dev/v1/images/generations', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${lovableApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'openai/gpt-image-2',
              prompt: brandPromptOverride,
              quality: 'medium',
              size: posterSize,
              n: 1,
            }),
          });

          if (gptRes.ok) {
            const gptData = await gptRes.json();
            const b64 = gptData.data?.[0]?.b64_json;
            if (b64) {
              console.log('[dehub-poster] GPT-image-2 success');
              return new Response(
                JSON.stringify({
                  imageUrl: `data:image/png;base64,${b64}`,
                  text: '',
                  success: true,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
            console.warn('[dehub-poster] GPT-image-2 returned no image; falling back to Gemini');
          } else {
            const errText = await gptRes.text().catch(() => '');
            console.warn('[dehub-poster] GPT-image-2 failed', gptRes.status, errText.substring(0, 200), '— falling back to Gemini');
          }
        } catch (e) {
          console.warn('[dehub-poster] GPT-image-2 error, falling back to Gemini:', e);
        }
      }

      // Gemini fallback: attach the real logo PNG for compositing
      try {
        const logoRes = await fetch('https://cosmic-echo-hero.lovable.app/__l5e/assets-v1/4cf0b92e-3cfd-4459-9c72-cdec81055a23/dehub-logo-white.png');
        if (logoRes.ok) {
          const buf = new Uint8Array(await logoRes.arrayBuffer());
          let bin = '';
          for (let i = 0; i < buf.byteLength; i++) bin += String.fromCharCode(buf[i]);
          sourceImage = `data:image/png;base64,${btoa(bin)}`;
          model = 'gemini-3.1-flash-image';
          isGrokModel = false;
          contextualPrompt = `DEHUB BRAND SYSTEM (mandatory):
- The attached image is the official DeHub wordmark. Composite it PROMINENTLY, UNALTERED, PURE WHITE into the final image with clear space around it (min 8% of canvas). Do NOT recolor, gradient-fill, distort, or redraw the logo — use the attached pixels.
- Palette: deep black / charcoal background (#000–#0a0a0a), white text, subtle white-opacity accents. NEVER use blue anywhere. Muted neon (magenta/violet/cyan) ambient glow is OK.
- Aesthetic: liquid glass, frosted blur, cinematic, premium, decentralized-tech. Lots of negative space. Strong focal hierarchy.
- Typography (if any): Exo / Exo 2, white, minimal, generous letter-spacing. No emoji. No generic AI clichés.

ART DIRECTION: ${enhancedUserRequest}`;
        } else {
          console.warn('[dehub-poster] Logo fetch failed:', logoRes.status);
        }
      } catch (e) {
        console.warn('[dehub-poster] Logo fetch error:', e);
      }
    }


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
    if (model === 'gemini-3.1-flash-image') {
      apiModel = 'google/gemini-3.1-flash-image';
    } else if (model === 'gemini-3-pro-image') {
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
