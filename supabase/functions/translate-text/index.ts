/**
 * Translate Text Edge Function
 * ============================
 * Uses free translation APIs (MyMemory) for translations with AI fallback.
 * Falls back to Lovable AI (Gemini) when free APIs fail.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Server-side translation cache to avoid repeated API/AI calls for identical text
const translationCache = new Map<string, TranslateResponse>();
const MAX_CACHE_SIZE = 500;

function getCacheKey(text: string, targetLang: string): string {
  // Hash first 200 chars + target lang
  const sample = text.slice(0, 200).trim();
  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    hash = ((hash << 5) - hash) + sample.charCodeAt(i);
    hash = hash & hash;
  }
  return `${hash.toString(36)}_${targetLang}`;
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
    
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.log(`MyMemory returned status: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (data.responseStatus !== 200) {
      console.log(`MyMemory response status: ${data.responseStatus}`);
      return null;
    }
    
    const translatedText = data.responseData.translatedText;
    
    // If the translated text is identical to the input, consider it a failure
    // This happens when MyMemory can't actually translate the text
    if (translatedText.trim().toLowerCase() === text.trim().toLowerCase()) {
      console.log('MyMemory returned same text as input, treating as failure');
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

/**
 * Lovable AI Translation - Uses Gemini as reliable fallback
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
          {
            role: 'system',
            content: `You are a translator. Translate the user's text to ${targetLanguageName}. 
IMPORTANT: Reply with ONLY the translated text, no explanations, no quotes, no additional text.
If the text is already in ${targetLanguageName}, still output it as-is.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.1,
        max_tokens: 1000,
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

  try {
    const { text, targetLang, sourceLang }: TranslateRequest = await req.json();

    if (!text || !targetLang) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: text, targetLang' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Translating to ${targetLang}: "${text.substring(0, 50)}..."`);

    // Check server-side cache first
    const cacheKey = getCacheKey(text, targetLang);
    const cached = translationCache.get(cacheKey);
    if (cached) {
      console.log('Translation cache hit');
      return new Response(
        JSON.stringify({ ...cached, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try MyMemory first (most reliable free option)
    let result = await translateWithMyMemory(text, targetLang, sourceLang);
    if (result) {
      // Cache the result
      if (translationCache.size >= MAX_CACHE_SIZE) {
        const firstKey = translationCache.keys().next().value;
        if (firstKey) translationCache.delete(firstKey);
      }
      translationCache.set(cacheKey, result);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fallback to Lovable AI (Gemini) - reliable but uses AI credits
    result = await translateWithAI(text, targetLang);
    if (result) {
      // Cache AI result too
      if (translationCache.size >= MAX_CACHE_SIZE) {
        const firstKey = translationCache.keys().next().value;
        if (firstKey) translationCache.delete(firstKey);
      }
      translationCache.set(cacheKey, result);
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
