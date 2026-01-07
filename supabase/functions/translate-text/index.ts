/**
 * Translate Text Edge Function
 * ============================
 * Uses LibreTranslate (free, open-source) for translations.
 * Falls back to alternative free instances if primary is unavailable.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Free LibreTranslate instances (no API key required)
const TRANSLATE_ENDPOINTS = [
  'https://libretranslate.com/translate',
  'https://translate.argosopentech.com/translate',
  'https://translate.terraprint.co/translate',
];

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

async function translateWithEndpoint(
  endpoint: string,
  text: string,
  targetLang: string,
  sourceLang: string = 'auto'
): Promise<TranslateResponse | null> {
  try {
    console.log(`Attempting translation with: ${endpoint}`);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: text,
        source: sourceLang,
        target: targetLang,
        format: 'text',
      }),
    });

    if (!response.ok) {
      console.log(`Endpoint ${endpoint} returned status: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`Translation successful from ${endpoint}`);
    
    return {
      translatedText: data.translatedText,
      detectedLanguage: data.detectedLanguage,
    };
  } catch (error) {
    console.log(`Endpoint ${endpoint} failed:`, error instanceof Error ? error.message : 'Unknown error');
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

    // Try each endpoint until one works
    for (const endpoint of TRANSLATE_ENDPOINTS) {
      const result = await translateWithEndpoint(endpoint, text, targetLang, sourceLang);
      if (result) {
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
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
