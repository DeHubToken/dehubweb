
import {
  compositeDeHubBranding,
  extractQuotedHeadline,
  pickLayoutForFormat,
} from '../_shared/dehub-brand-composite.ts';

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
  logoImage?: string; // Explicit brand-logo channel (Poster Studio). Triggers two-step: GPT scene → Gemini logo composite.
  conversationHistory?: ConversationMessage[];
  model?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let { prompt, sourceImage, logoImage, conversationHistory = [], model = 'gemini-2.5-flash' } = await req.json() as GenerateImageRequest;

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
    //    force logo-attached, brand-compliant generation. Also triggers when the
    //    Poster Studio passes an explicit `logoImage` (two-step composite path).
    //    If the caller sent the DeHub logo in `sourceImage` (older client path
    //    from GeneralAIChat), promote it to `logoImage` so the brand pipeline runs
    //    and composites correctly instead of being bypassed as a generic edit.
    const brandKeywordHit = /\bde\s*hub\b/i.test(prompt) && /\b(posters?|banners?|thumbnails?|content|cards?|announc(?:e|ement|ements?)|flyers?|artworks?|social|covers?|graphics?|ads?|adverts?|images?|logos?|wallpapers?|memes?|promos?|campaigns?)\b/i.test(prompt);
    if (brandKeywordHit && sourceImage && !logoImage) {
      logoImage = sourceImage;
      sourceImage = undefined;
      console.log('[dehub-poster] Promoted sourceImage → logoImage for brand pipeline');
    }
    const brandIntent = brandKeywordHit || !!logoImage;
    let brandPromptOverride: string | null = null;
    // Brand intent ALWAYS runs the brand pipeline. Previously we bypassed it when
    // a sourceImage was present without an explicit logoImage — that dropped every
    // brand rule and returned a generic Gemini edit of the logo. No more.
    if (brandIntent) {


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

      // ── DeHub brand archetype library: all strictly monochrome, all material-first,
      //    all built around a real physical LOGO HOST SURFACE the wordmark can be
      //    engraved / embossed / backlit / projected into. No cyberpunk/rave/vaporwave
      //    clichés — those produced colored, chaotic posters. One is picked per request
      //    so outputs feel like real campaign work, on-brand every time.
      const TEMPLATES = [
        'Monolithic obsidian pavilion floating over a mirror-black lake in charcoal mist, cool silver rim light from upper-left; its centered vertical face is a polished obsidian slab with a subtly recessed rectangular panel — the LOGO HOST SURFACE.',
        'Cantilevered brushed-steel platform in volumetric charcoal fog, cool key light raking from upper-right; a large brushed-aluminum plaque tilted on the platform catches the light — the LOGO HOST SURFACE.',
        'Backlit smoked-glass gateway suspended in cold mist, faint cool-white internal glow, deep shadow falloff; a frosted-glass panel at eye level with a soft internal luminance — the LOGO HOST SURFACE.',
        'Chrome monolith rising from a black marble floor, top-down cool key light and long cast shadow; the mirror-chrome vertical face oriented squarely toward camera — the LOGO HOST SURFACE.',
        'Liquid mercury pool on polished obsidian, silver rim highlight rippling across the surface; a raised mercury relief zone waits mid-frame — the LOGO HOST SURFACE.',
        'Weightless silver ring hovering over a chrome disc in charcoal atmosphere, soft caustic reflections; the disc face oriented to camera — the LOGO HOST SURFACE.',
        'A single smoked-crystal card levitating in cold fog, cool rim light catching its bevelled edges; the card face reads camera-forward — the LOGO HOST SURFACE.',
        'Monochrome mountain range under cold moonlight, mist rolling through the valley; a floating volumetric slab of cool-white light hovers in the middle distance — the LOGO HOST SURFACE (a light projection panel).',
        'Endless mirror-black lake with faint silver mist and a single obsidian shard rising vertically; the shard\'s polished face turned to camera — the LOGO HOST SURFACE.',
        'Lone hooded silhouette (no visible face) facing a floating brushed-steel monolith in charcoal mist, cool silver rim light; the monolith face oriented to camera — the LOGO HOST SURFACE.',
      ];
      const templatePick = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
      console.log('[dehub-poster] Template pick:', templatePick.substring(0, 60), '| Size:', posterSize);


      // ── Auto-enhance: rewrite the short user brief into a senior-marketing-director
      //    grade visual prompt. Silent, server-side, hard timeout + fallback.
      let enhancedUserRequest = prompt;
      if (lovableApiKey) {
        try {
          const directorSystem = `You are a senior creative director writing the visual brief for a STUNNING promotional poster for DeHub (a decentralized creator platform). Output ONE dense paragraph, 120–180 words, no lists, no preamble, no quotes.

This is CAMPAIGN artwork — cinematic, editorial, premium (Apple keynote × A24 × Zaha Hadid × Blade Runner 2049 interiors). Never a "brand-guidelines diagram", never generic AI stock.

FORMAT: ${formatHint}. Compose for this shape.

SCENE ARCHETYPE (adapt the user's subject into THIS scene — don't just describe the archetype generically): ${templatePick}

Rules (non-negotiable):
- STRICT MONOCHROME: blacks, charcoals, silvers, chromes, brushed steels, cool off-whites, pure white. NO color hues at all — no red, orange, yellow, magenta, purple, violet, green, blue, teal, pastel, neon glow. Any ambient light must be a cool near-white (saturation under 10%). The ONLY exception is if the user's brief literally names a color; if it does, honor it as a restrained accent while keeping the scene mostly monochrome. If in doubt, kill the color.
- MATERIALS: liquid glass, frosted glass, polished chrome, brushed aluminum, obsidian, mercury, smoked crystal, wet volcanic stone. Real reflections, refractions, subsurface scattering, subtle caustics. Backgrounds must have texture/depth (mist, marble veining, brushed metal, silk drapery) — NEVER flat black.
- LIGHTING: one cinematic key light with named direction (upper-left / upper-right / rim / backlight / god-ray), soft rim on subject edges, deep shadow falloff into negative space.
- LOGO HOST SURFACE: describe it explicitly — its material, position, orientation, and that its face is CURRENTLY BLANK. This is where the real DeHub wordmark gets composited afterward. Do NOT draw the wordmark, letters, or the word "DeHub".
- No emoji. No purple/indigo gradients. No rainbow. No lens flares. No cyberpunk neon. No "hero with arms up". No motion-blur action shots. No hooded figures unless the archetype names one.
- If the user asked for a headline, name it in one short display phrase (max 5 words). If not, say "no headline".
- End with: "Shot on Hasselblad, 85mm, f/2.8, gallery quality, campaign polish."`;

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

      brandPromptOverride = `Create a STUNNING promotional marketing poster for DeHub (a decentralized social platform). This is campaign artwork — cinematic, editorial, premium.

Format: ${formatHint}. Compose for this aspect ratio.

Non-negotiable brand rules (violating these ruins the piece):
- STRICT MONOCHROME PALETTE: blacks, charcoals, silvers, chromes, brushed steels, cool off-whites, pure white ONLY. ABSOLUTELY NO color hues — no red, orange, yellow, magenta, purple, violet, green, blue, teal, indigo, cyan, pastel, neon glow. Any ambient light must be a cool near-white (saturation under 10%). If the ART DIRECTION below literally names a color, honor it as a restrained accent; otherwise, kill every hue.
- BACKGROUND MUST HAVE DEPTH: silk drapery, brushed metal, black marble veining, volumetric mist, obsidian, mercury — never a flat #000 wall.
- MATERIALS: liquid glass, frosted crystal, polished chrome, brushed aluminum, obsidian, smoked crystal, mercury. Real reflections, refractions, subsurface scattering, subtle caustics.
- LOGO HOST SURFACE: the scene MUST include the specific physical surface named in the ART DIRECTION (e.g. an obsidian slab, brushed-aluminum plaque, backlit smoked-glass panel, chrome monolith face). That surface must be a real object in the scene, angled/lit to match, and its face must be perfectly BLANK — do NOT draw a logo, the word "DeHub", letters, glyphs, placeholder marks, icons, or any text on it. The real DeHub wordmark will be composited onto that exact blank surface afterward. Size the blank area for a wordmark lockup roughly 20-30% of canvas width with min 8% clear space on every side.
- TYPOGRAPHY: only if the ART DIRECTION names a short display headline, render it in Exo / Exo 2 geometric technical sans-serif, thin uniform strokes, sharp corners, wide letter-spacing, pure white. Never serifs, script, humanist sans (Inter, Poppins, DM Sans, Helvetica Neue).
- NO emoji. NO purple/indigo gradients. NO rainbow. NO cyberpunk neon. NO glossy 3D blobs. NO generic AI clichés (hero-with-arms-up, purple gradient on white, floating chrome spheres in empty voids). NO motion-blur action shots.

ART DIRECTION: ${enhancedUserRequest}`;




      // Client-supplied logo (from Chat / Poster Studio) takes precedence;
      // otherwise the deterministic composite function will fall back to
      // its hardcoded canonical DeHub wordmark data URI. We no longer fetch
      // dehub.io/__l5e/... here because that path returns SPA HTML in
      // production and silently broke the composite step.
      const compositeLogo: string | undefined = logoImage;
      if (compositeLogo) console.log('[dehub-poster] Using client-supplied logo image');
      else console.log('[dehub-poster] No client logo — composite will use hardcoded canonical wordmark');

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
              const sceneDataUrl = `data:image/png;base64,${b64}`;

              // ── Step 2 (PRIMARY): deterministic SVG overlay of the real
              //    DeHub wordmark via resvg-wasm — mirrors the pattern used
              //    by affiliate-share-image / blog-share-image so the logo
              //    is ALWAYS pixel-perfect, correctly-typeset, and never
              //    hallucinated by a diffusion model. Also renders a
              //    crisp headline when the user explicitly quoted one.
              const [posterW, posterH] = posterSize.split('x').map(Number);
              const headline = extractQuotedHeadline(prompt);
              const layout = pickLayoutForFormat(posterSize);
              try {
                console.log('[dehub-poster] GPT scene ok — deterministic SVG composite (logo + headline)', { headline, layout });
                const brandedUrl = await compositeDeHubBranding({
                  sceneDataUrl,
                  width: posterW,
                  height: posterH,
                  headline: headline || undefined,
                  layout,
                  logoDataUrl: compositeLogo,
                });
                if (brandedUrl) {
                  console.log('[dehub-poster] Deterministic composite success');
                  return new Response(
                    JSON.stringify({ imageUrl: brandedUrl, text: '', success: true }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                  );
                }
                console.warn('[dehub-poster] Deterministic composite returned null — falling back to Gemini composite');
              } catch (e) {
                console.warn('[dehub-poster] Deterministic composite threw — falling back to Gemini:', (e as Error).message);
              }

              // ── Step 2b (FALLBACK): if resvg fails for any reason, try
              //    the Gemini image-edit composite. Kept only as a safety
              //    net; the deterministic path above is the source of
              //    truth for brand-accurate logos.
              if (compositeLogo) {
                try {
                  const compositePrompt = `Take the first image (a finished DeHub marketing scene) and place the second image (the official DeHub white wordmark, transparent PNG) onto it as a logo lockup.
- Position the wordmark in the pre-reserved empty area of the scene. Do not cover the hero subject.
- Size it so its width is roughly 18-26% of the canvas width. Keep min 8% clear space on every side.
- Keep the wordmark PURE WHITE, crisp, sharp, perfectly horizontal, unaltered. Use the attached pixels as-is.
- Do NOT modify any other part of the scene. Output the composited image.`;
                  const compRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      model: 'google/gemini-3.1-flash-image',
                      messages: [{
                        role: 'user',
                        content: [
                          { type: 'image_url', image_url: { url: sceneDataUrl } },
                          { type: 'image_url', image_url: { url: compositeLogo } },
                          { type: 'text', text: compositePrompt },
                        ],
                      }],
                      modalities: ['image', 'text'],
                    }),
                  });
                  if (compRes.ok) {
                    const compData = await compRes.json();
                    const compUrl = compData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
                    if (compUrl) {
                      console.log('[dehub-poster] Gemini composite fallback success');
                      return new Response(
                        JSON.stringify({ imageUrl: compUrl, text: '', success: true }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                      );
                    }
                  }
                } catch (e) {
                  console.warn('[dehub-poster] Gemini composite fallback error:', (e as Error).message);
                }
              }

              console.warn('[dehub-poster] All composite paths failed — returning bare scene');
              return new Response(
                JSON.stringify({ imageUrl: sceneDataUrl, text: '', success: true }),
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

      // Gemini fallback: reuse the pre-fetched compositeLogo (guaranteed above)
      try {
        const logoDataUrl = compositeLogo;
        if (logoDataUrl) {

          sourceImage = logoDataUrl;
          model = 'gemini-3.1-flash-image';
          isGrokModel = false;
          contextualPrompt = `DEHUB BRAND SYSTEM (mandatory):
- The attached image is the official DeHub wordmark. Composite it PROMINENTLY, UNALTERED, PURE WHITE into the final image with clear space around it (min 8% of canvas). Do NOT recolor, gradient-fill, distort, or redraw the logo — use the attached pixels.
- Palette: deep black / charcoal background (#000–#0a0a0a), white text, subtle white-opacity accents. NEVER use blue anywhere. Muted neon (magenta/violet/cyan) ambient glow is OK.
- Aesthetic: liquid glass, frosted blur, cinematic, premium, decentralized-tech. Lots of negative space. Strong focal hierarchy.
- Typography (if any): Exo / Exo 2, white, minimal, generous letter-spacing. No emoji. No generic AI clichés.

ART DIRECTION: ${enhancedUserRequest}`;
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
