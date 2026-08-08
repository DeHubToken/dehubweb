/**
 * Translate Text Edge Function
 * ============================
 * Uses free translation APIs (MyMemory) for translations with AI fallback.
 *
 * Two caches then four providers, cheapest first. Every provider returns null
 * rather than throwing, so a dead tier falls through to the next:
 *   L1  in-isolate Map      — free, but dies with the isolate and is not shared
 *   L2  post_translations   — one round trip, shared by every isolate, permanent
 *   P1  MyMemory            — free, capped, skipped above 500 chars
 *   P2  Gemini direct       — GEMINI_API_KEY
 *   P3  fal / OpenRouter    — FAL_KEY, routed to a non-Google model on purpose
 *   P4  Lovable gateway     — legacy route, currently 402 out of credits
 *
 * L2 is what makes translating a whole feed affordable: without it the bill
 * scales with viewers rather than with distinct (text, language) pairs.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimitByIp } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer',
};

// Server-side translation cache to avoid repeated API/AI calls for identical text
const translationCache = new Map<string, TranslateResponse>();
const MAX_CACHE_SIZE = 500;

// Key over the WHOLE text, never a prefix of it. Hashing only the first 200
// characters made any two bodies that open the same way — templated AI-image
// captions, reposted announcements, a shared boilerplate intro — collide in this
// map, and the map is shared by every caller, so translating one post could hand
// back somebody else's translation. Two independent hashes plus the length keep
// accidental collisions negligible. A blank body also used to hash to 0 and put
// every empty request in one bucket; those are rejected outright now.
function getCacheKey(text: string, targetLang: string): string {
  let h1 = 0;
  let h2 = 5381;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    h1 = (((h1 << 5) - h1) + char) | 0;
    h2 = (((h2 << 5) + h2) ^ char) | 0;
  }
  return `${(h1 >>> 0).toString(36)}_${(h2 >>> 0).toString(36)}_${text.length}_${targetLang}`;
}

function rememberInIsolate(cacheKey: string, result: TranslateResponse): void {
  if (translationCache.size >= MAX_CACHE_SIZE) {
    const firstKey = translationCache.keys().next().value;
    if (firstKey) translationCache.delete(firstKey);
  }
  translationCache.set(cacheKey, result);
}

// The shared table gets a real digest rather than the pair of 32-bit hashes
// above. Those are fine for a 500-entry map that empties on the next cold start;
// a collision in a permanent, shared table would serve one post's translation
// for another's until somebody deleted the row by hand.
async function getTextHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/**
 * L2 read. Never throws — a cache that is down should cost money, not requests,
 * so every failure here falls through to the providers.
 */
async function readCachedTranslation(
  textHash: string,
  targetLang: string
): Promise<TranslateResponse | null> {
  try {
    const { data, error } = await db
      .from('post_translations')
      .select('translated_text, source_lang')
      .eq('text_hash', textHash)
      .eq('target_lang', targetLang)
      .maybeSingle();

    if (error || !data) return null;

    // Read counters are advisory (they drive eviction and cost reporting), so
    // they are not awaited — blocking a cache hit on a write would give away
    // most of what the cache is for.
    db.rpc('touch_post_translation', { p_text_hash: textHash, p_target_lang: targetLang })
      .then(() => {}, () => {});

    return {
      translatedText: data.translated_text,
      detectedLanguage: data.source_lang
        ? { language: data.source_lang, confidence: 1.0 }
        : undefined,
    };
  } catch (_e) {
    return null;
  }
}

/**
 * L2 write. Also never throws, and upserts rather than inserts so two isolates
 * racing on the same miss settle instead of one of them 409-ing.
 */
async function writeCachedTranslation(
  textHash: string,
  targetLang: string,
  result: TranslateResponse,
  provider: string
): Promise<void> {
  try {
    await db.from('post_translations').upsert({
      text_hash: textHash,
      target_lang: targetLang,
      translated_text: result.translatedText,
      source_lang: result.detectedLanguage?.language ?? null,
      provider,
    }, { onConflict: 'text_hash,target_lang' });
  } catch (_e) {
    // A cache that cannot be written is a slow cache, not a broken request.
  }
}

// 'en', 'en-US' and 'EN' are the same target as far as skipping work goes.
function baseLang(code: string | undefined): string {
  return (code ?? '').toLowerCase().split(/[-_]/)[0];
}

interface TranslateRequest {
  text: string;
  targetLang: string;
  sourceLang?: string;
}

interface TranslateResponse {
  translatedText: string;
  detectedLanguage?: {
    language: string;
    confidence: number;
  };
}

// Map common language codes to full names for MyMemory
const langCodeMap: Record<string, string> = {
  'en': 'en',
  'es': 'es',
  'fr': 'fr',
  'de': 'de',
  'it': 'it',
  'pt': 'pt',
  'ru': 'ru',
  'ja': 'ja',
  'ko': 'ko',
  'zh': 'zh-CN',
  'ar': 'ar',
  'hi': 'hi',
  'ms': 'ms',
  'tr': 'tr',
  'ro': 'ro',
  'bn': 'bn',
  'id': 'id',
  'vi': 'vi',
  'th': 'th',
  'nl': 'nl',
  'pl': 'pl',
  'uk': 'uk',
  'tl': 'tl',
  'fa': 'fa',
  'arz': 'ar',  // Egyptian Arabic → standard Arabic for MyMemory
  'ary': 'ar',  // Moroccan Arabic → standard Arabic for MyMemory
  'pcm': 'en',  // Nigerian Pidgin → English for MyMemory (AI fallback handles properly)
  'ha': 'ha',
  'yo': 'yo',
  'ig': 'ig',
  'af': 'af',
  'qu': 'qu',
  'am': 'am',
  'sw': 'sw',
  'zu': 'zu',
  'auto': 'autodetect',
};

// Map language codes to full names for AI translation
const langNameMap: Record<string, string> = {
  'en': 'English',
  'es': 'Spanish',
  'fr': 'French',
  'de': 'German',
  'it': 'Italian',
  'pt': 'Portuguese',
  'ru': 'Russian',
  'ja': 'Japanese',
  'ko': 'Korean',
  'zh': 'Chinese',
  'ar': 'Arabic',
  'hi': 'Hindi',
  'ms': 'Malay',
  'tr': 'Turkish',
  'ro': 'Romanian',
  'bn': 'Bengali',
  'id': 'Indonesian',
  'vi': 'Vietnamese',
  'th': 'Thai',
  'nl': 'Dutch',
  'pl': 'Polish',
  'uk': 'Ukrainian',
  'tl': 'Tagalog',
  'fa': 'Persian',
  'arz': 'Egyptian Arabic',
  'ary': 'Moroccan Arabic (Darija)',
  'pcm': 'Nigerian Pidgin',
  'ha': 'Hausa',
  'yo': 'Yoruba',
  'ig': 'Igbo',
  'af': 'Afrikaans',
  'qu': 'Quechua',
  'am': 'Amharic',
  'sw': 'Swahili',
  'zu': 'Zulu',
};

/**
 * MyMemory Translation API - Free, 1000 words/day
 * https://mymemory.translated.net/doc/spec.php
 */
async function translateWithMyMemory(
  text: string,
  targetLang: string,
  sourceLang: string = 'auto'
): Promise<TranslateResponse | null> {
  try {
    console.log('Attempting translation with MyMemory API');
    
    const source = sourceLang === 'auto' ? 'autodetect' : (langCodeMap[sourceLang] || sourceLang);
    const target = langCodeMap[targetLang] || targetLang;
    const langpair = `${source}|${target}`;
    
    // MyMemory struggles with texts over ~500 chars, skip to AI for long texts
    if (text.length > 500) {
      console.log('Text too long for MyMemory, skipping to AI');
      return null;
    }
    
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (!response.ok) {
      console.log(`MyMemory returned status: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (data.responseStatus !== 200) {
      console.log(`MyMemory response status: ${data.responseStatus}, message: ${data.responseDetails}`);
      return null;
    }
    
    const translatedText = data.responseData.translatedText;
    
    // Check for quota exceeded or error messages in the response
    if (!translatedText || translatedText.includes('MYMEMORY WARNING') || translatedText.includes('PLEASE CONTACT')) {
      console.log('MyMemory quota exceeded or error in response');
      return null;
    }
    
    // If the translated text is identical to the input (case-insensitive), MyMemory couldn't translate
    if (translatedText.trim().toLowerCase() === text.trim().toLowerCase()) {
      console.log('MyMemory returned same text as input, falling back to AI');
      return null;
    }
    
    console.log('Translation successful from MyMemory');
    
    return {
      translatedText,
      detectedLanguage: data.responseData.detectedLanguage ? {
        language: data.responseData.detectedLanguage,
        confidence: 1.0,
      } : undefined,
    };
  } catch (error) {
    console.log('MyMemory failed:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

const TRANSLATOR_SYSTEM_PROMPT = (targetLanguageName: string) =>
  `You are a professional translator. Translate the following text to ${targetLanguageName}.
Rules:
- Output ONLY the translated text
- No explanations, quotes, labels, or extra text
- Preserve formatting, line breaks, emojis, and special characters
- If text contains slang or informal language, translate it naturally
- Translate ALL of the text, do not skip any part`;

// Ordered newest-first, and tried in order until one answers.
//
// A single hardcoded id is what broke this on the first deploy: the function
// inherited `gemini-2.5-flash-lite` from the gateway config it replaced, and
// Google had already stopped serving that id to new API consumers — every long
// translation 404'd with "no longer available to new users". 2.5 shuts down
// outright in October 2026, and the generation before it was retired the same
// way in June, so this will happen again.
//
// Walking a list costs one wasted 404 on one cold start when the head of the
// list is retired, instead of failing every request until somebody edits this
// file. The working index is remembered for the isolate's lifetime.
const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
];
let geminiModelIndex = 0;

/**
 * Gemini, called directly.
 *
 * This used to go through ai.gateway.lovable.dev, which resells the same class
 * of model at a markup. Same prompt, so output is unchanged — only the billing
 * route moves, onto GEMINI_API_KEY.
 *
 * The gateway stays wired as a fallback below, so an unset or rejected
 * GEMINI_API_KEY degrades to the old path instead of failing the request.
 */
async function translateWithGemini(
  text: string,
  targetLang: string
): Promise<TranslateResponse | null> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) return null;

  const targetLanguageName = langNameMap[targetLang] || targetLang;
  const body = JSON.stringify({
    systemInstruction: {
      parts: [{ text: TRANSLATOR_SYSTEM_PROMPT(targetLanguageName) }],
    },
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2000,
    },
  });

  for (let i = geminiModelIndex; i < GEMINI_MODELS.length; i++) {
    const model = GEMINI_MODELS[i];

    try {
      console.log(`Attempting translation with Gemini (direct), model ${model}`);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY,
          },
          body,
        }
      );

      // Only a missing model is worth retrying down the list. A 401, 429 or 5xx
      // says nothing about the model id, and walking the whole list on those
      // would turn one rejected request into three.
      if (response.status === 404) {
        console.log(`Gemini model ${model} unavailable (404), trying next`);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`Gemini returned status: ${response.status}, error: ${errorText}`);
        return null;
      }

      const data = await response.json();
      const translatedText = data.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? '')
        .join('')
        .trim();

      if (!translatedText) {
        console.log(`Gemini returned empty response (model ${model})`);
        return null;
      }

      // Skip the dead ids on subsequent calls in this isolate.
      geminiModelIndex = i;
      console.log(`Translation successful from Gemini (direct), model ${model}`);

      return {
        translatedText,
        detectedLanguage: {
          language: 'auto',
          confidence: 0.9,
        },
      };
    } catch (error) {
      console.log('Gemini failed:', error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  console.log('Gemini: every model id in GEMINI_MODELS returned 404');
  return null;
}

/**
 * fal, via its OpenRouter router endpoint.
 *
 * Sits between Gemini and the Lovable gateway because FAL_KEY is already
 * provisioned for this project (generate-image, generate-video and generate-3d
 * all use it) and the gateway is currently returning 402.
 *
 * Deliberately routed to a non-Google model. This tier only runs when the Gemini
 * call has already failed, and a fallback that asks a different vendor for the
 * same family of model shares whatever just broke — a retired id, a bad key, a
 * Google outage. Claude Haiku is independent of all three and strong on the
 * long tail of languages this app configures.
 *
 * fal-ai/any-llm would be the more obvious endpoint and is documented as
 * deprecated; openrouter/router is the current one.
 */
async function translateWithFal(
  text: string,
  targetLang: string
): Promise<TranslateResponse | null> {
  const FAL_KEY = Deno.env.get('FAL_KEY');
  if (!FAL_KEY) return null;

  try {
    console.log('Attempting translation with fal (openrouter/router)');

    const targetLanguageName = langNameMap[targetLang] || targetLang;

    const response = await fetch('https://fal.run/openrouter/router', {
      method: 'POST',
      headers: {
        Authorization: `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4.5',
        system_prompt: TRANSLATOR_SYSTEM_PROMPT(targetLanguageName),
        prompt: text,
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`fal returned status: ${response.status}, error: ${errorText}`);
      return null;
    }

    const data = await response.json();
    const translatedText = typeof data.output === 'string' ? data.output.trim() : '';

    if (!translatedText) {
      console.log('fal returned empty response');
      return null;
    }

    console.log('Translation successful from fal');

    return {
      translatedText,
      detectedLanguage: {
        language: 'auto',
        confidence: 0.9,
      },
    };
  } catch (error) {
    console.log('fal failed:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Lovable AI Translation - gateway fallback for when GEMINI_API_KEY is absent
 */
async function translateWithAI(
  text: string,
  targetLang: string
): Promise<TranslateResponse | null> {
  try {
    console.log('Attempting translation with Lovable AI');

    const targetLanguageName = langNameMap[targetLang] || targetLang;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.log('LOVABLE_API_KEY not configured');
      return null;
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: TRANSLATOR_SYSTEM_PROMPT(targetLanguageName) },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Lovable AI returned status: ${response.status}, error: ${errorText}`);
      return null;
    }

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content?.trim();

    if (!translatedText) {
      console.log('Lovable AI returned empty response');
      return null;
    }

    console.log('Translation successful from Lovable AI');
    
    return {
      translatedText,
      detectedLanguage: {
        language: 'auto',
        confidence: 0.9,
      },
    };
  } catch (error) {
    console.log('Lovable AI failed:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const limited = await rateLimitByIp(req, 'translate-text', { limit: 300, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  try {
    const { text, targetLang, sourceLang }: TranslateRequest = await req.json();

    if (!text || !text.trim() || !targetLang) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: text, targetLang' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Emoji, digits and punctuation have nothing to translate. Sent upstream
    // anyway, MyMemory answers a query like that out of its shared translation
    // memory — an unrelated segment somebody else once submitted — and that came
    // back looking like a translation of the caller's post.
    if (!/\p{L}/u.test(text)) {
      return new Response(
        JSON.stringify({ translatedText: text }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Nothing to do when the caller already knows the text is in the target
    // language. Auto-translate asks for every post in the feed, and on a feed
    // whose majority language matches the viewer that is most of them — each one
    // otherwise costs a provider call to be told the text back.
    if (sourceLang && sourceLang !== 'auto' && baseLang(sourceLang) === baseLang(targetLang)) {
      return new Response(
        JSON.stringify({ translatedText: text, sameLanguage: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Translating to ${targetLang}: "${text.substring(0, 50)}..."`);

    // L1: in-isolate map
    const cacheKey = getCacheKey(text, targetLang);
    const cached = translationCache.get(cacheKey);
    if (cached) {
      console.log('Translation cache hit (L1)');
      return new Response(
        JSON.stringify({ ...cached, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // L2: shared table
    const textHash = await getTextHash(text);
    const persisted = await readCachedTranslation(textHash, targetLang);
    if (persisted) {
      console.log('Translation cache hit (L2)');
      rememberInIsolate(cacheKey, persisted);
      return new Response(
        JSON.stringify({ ...persisted, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try MyMemory first (most reliable free option)
    let result = await translateWithMyMemory(text, targetLang, sourceLang);
    if (result) {
      rememberInIsolate(cacheKey, result);
      await writeCachedTranslation(textHash, targetLang, result, 'mymemory');
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Paid fallbacks, in order of cost: Gemini direct, then fal, then the
    // Lovable gateway. Each returns null rather than throwing, so a dead tier
    // falls through to the next instead of failing the request.
    result = await translateWithGemini(text, targetLang);
    if (result) {
      rememberInIsolate(cacheKey, result);
      await writeCachedTranslation(textHash, targetLang, result, 'gemini');
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    result = await translateWithFal(text, targetLang);
    if (result) {
      rememberInIsolate(cacheKey, result);
      await writeCachedTranslation(textHash, targetLang, result, 'fal');
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    result = await translateWithAI(text, targetLang);
    if (result) {
      rememberInIsolate(cacheKey, result);
      await writeCachedTranslation(textHash, targetLang, result, 'lovable-gateway');
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // All endpoints failed
    console.error('All translation endpoints failed');
    return new Response(
      JSON.stringify({ error: 'Translation service temporarily unavailable' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Translation error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
