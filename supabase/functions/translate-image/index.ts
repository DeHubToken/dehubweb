/**
 * Image Translation Edge Function
 * ================================
 * Uses Gemini Vision to extract text from images (OCR) and translate it.
 * 
 * Endpoint: POST /functions/v1/translate-image
 * Body: { imageUrl: string, targetLang: string }
 * Response: { extractedText, translatedText, sourceLang, hasText }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Language name mapping for prompts
const langNameMap: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  hi: 'Hindi',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  vi: 'Vietnamese',
  th: 'Thai',
  id: 'Indonesian',
  uk: 'Ukrainian',
  sv: 'Swedish',
  da: 'Danish',
  fi: 'Finnish',
  no: 'Norwegian',
  cs: 'Czech',
  el: 'Greek',
  he: 'Hebrew',
  ro: 'Romanian',
  hu: 'Hungarian',
  sk: 'Slovak',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sr: 'Serbian',
  sl: 'Slovenian',
  lt: 'Lithuanian',
  lv: 'Latvian',
  et: 'Estonian',
  ms: 'Malay',
  tl: 'Filipino',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  mr: 'Marathi',
  gu: 'Gujarati',
  kn: 'Kannada',
  ml: 'Malayalam',
  pa: 'Punjabi',
  ur: 'Urdu',
  fa: 'Persian',
  sw: 'Swahili',
  af: 'Afrikaans',
  ca: 'Catalan',
  eu: 'Basque',
  gl: 'Galician',
  cy: 'Welsh',
  is: 'Icelandic',
  ga: 'Irish',
  mt: 'Maltese',
  sq: 'Albanian',
  mk: 'Macedonian',
  bs: 'Bosnian',
  lb: 'Luxembourgish',
  ka: 'Georgian',
  hy: 'Armenian',
  az: 'Azerbaijani',
  kk: 'Kazakh',
  uz: 'Uzbek',
  mn: 'Mongolian',
  ne: 'Nepali',
  si: 'Sinhala',
  km: 'Khmer',
  lo: 'Lao',
  my: 'Burmese',
  am: 'Amharic',
  yo: 'Yoruba',
  ig: 'Igbo',
  zu: 'Zulu',
  xh: 'Xhosa',
};

// Simple in-memory cache with LRU eviction
const cache = new Map<string, { extractedText: string; translatedText: string; sourceLang: string; hasText: boolean; timestamp: number }>();
const MAX_CACHE_SIZE = 500;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

function getCacheKey(imageUrl: string, targetLang: string): string {
  return `${imageUrl}::${targetLang}`;
}

function getFromCache(key: string) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached;
  }
  if (cached) {
    cache.delete(key);
  }
  return null;
}

function setCache(key: string, value: { extractedText: string; translatedText: string; sourceLang: string; hasText: boolean }) {
  // LRU eviction
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { ...value, timestamp: Date.now() });
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageUrl, targetLang = 'en' } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing imageUrl parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check cache first
    const cacheKey = getCacheKey(imageUrl, targetLang);
    const cached = getFromCache(cacheKey);
    if (cached) {
      console.log('Returning cached translation for:', imageUrl.slice(0, 50));
      return new Response(
        JSON.stringify({
          extractedText: cached.extractedText,
          translatedText: cached.translatedText,
          sourceLang: cached.sourceLang,
          hasText: cached.hasText,
          cached: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const targetLangName = langNameMap[targetLang] || 'English';

    // Single API call: Extract + Detect Language + Translate
    const prompt = `Analyze this image and perform the following tasks:

1. Extract ALL visible text from the image exactly as written (OCR)
2. Detect the language of the extracted text
3. Translate the text to ${targetLangName}

Respond in this EXACT JSON format (no markdown, no code blocks):
{
  "hasText": true/false,
  "extractedText": "the exact text from the image",
  "sourceLang": "ISO 639-1 code (e.g., 'ja', 'zh', 'ko', 'en')",
  "translatedText": "the translation in ${targetLangName}"
}

If there is no text in the image, respond with:
{
  "hasText": false,
  "extractedText": "",
  "sourceLang": "",
  "translatedText": ""
}

Important:
- Preserve line breaks and formatting from the original text
- If the text is already in ${targetLangName}, set translatedText to the same as extractedText
- Be accurate with the source language detection`;

    console.log('Calling Gemini Vision for image:', imageUrl.slice(0, 50));

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text();
      console.error('Gemini API error:', status, errorText);

      if (status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI service quota exceeded.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Failed to process image' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    console.log('Gemini response:', content.slice(0, 200));

    // Parse the JSON response
    let result: { hasText: boolean; extractedText: string; sourceLang: string; translatedText: string };
    
    try {
      // Try to extract JSON from the response (handle markdown code blocks)
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', parseError);
      
      // Fallback: try to extract any useful text
      return new Response(
        JSON.stringify({
          hasText: false,
          extractedText: '',
          translatedText: '',
          sourceLang: '',
          error: 'Failed to parse AI response',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cache the result
    setCache(cacheKey, {
      extractedText: result.extractedText || '',
      translatedText: result.translatedText || '',
      sourceLang: result.sourceLang || '',
      hasText: result.hasText,
    });

    console.log('Image translation complete:', {
      hasText: result.hasText,
      sourceLang: result.sourceLang,
      extractedLength: result.extractedText?.length || 0,
    });

    return new Response(
      JSON.stringify({
        extractedText: result.extractedText || '',
        translatedText: result.translatedText || '',
        sourceLang: result.sourceLang || '',
        hasText: result.hasText,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('translate-image error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
