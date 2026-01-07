/**
 * Translate Text Edge Function
 * ============================
 * Uses free translation APIs (MyMemory, Lingva) for translations.
 * Falls back between endpoints if one fails.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  'auto': 'autodetect',
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
    
    console.log('Translation successful from MyMemory');
    
    return {
      translatedText: data.responseData.translatedText,
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
 * Lingva Translate - Free, open-source Google Translate proxy
 * https://github.com/thedaviddelta/lingva-translate
 */
async function translateWithLingva(
  text: string,
  targetLang: string,
  sourceLang: string = 'auto'
): Promise<TranslateResponse | null> {
  try {
    console.log('Attempting translation with Lingva');
    
    const source = sourceLang === 'auto' ? 'auto' : sourceLang;
    const target = targetLang;
    
    // List of Lingva instances
    const lingvaInstances = [
      'https://lingva.ml',
      'https://translate.plausibility.cloud',
      'https://lingva.pussthecat.org',
    ];
    
    for (const instance of lingvaInstances) {
      try {
        const url = `${instance}/api/v1/${source}/${target}/${encodeURIComponent(text)}`;
        console.log(`Trying Lingva instance: ${instance}`);
        
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (!response.ok) {
          console.log(`Lingva instance ${instance} returned status: ${response.status}`);
          continue;
        }

        const data = await response.json();
        
        if (data.translation) {
          console.log(`Translation successful from Lingva (${instance})`);
          return {
            translatedText: data.translation,
            detectedLanguage: data.info?.detectedSource ? {
              language: data.info.detectedSource,
              confidence: 1.0,
            } : undefined,
          };
        }
      } catch (e) {
        console.log(`Lingva instance ${instance} failed:`, e instanceof Error ? e.message : 'Unknown error');
        continue;
      }
    }
    
    return null;
  } catch (error) {
    console.log('Lingva failed:', error instanceof Error ? error.message : 'Unknown error');
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

    // Try MyMemory first (most reliable)
    let result = await translateWithMyMemory(text, targetLang, sourceLang);
    if (result) {
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fallback to Lingva
    result = await translateWithLingva(text, targetLang, sourceLang);
    if (result) {
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
