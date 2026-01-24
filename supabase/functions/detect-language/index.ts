/**
 * Detect Language Edge Function
 * ==============================
 * Uses Lovable AI (gemini-2.5-flash-lite) to detect the language of text.
 * Optimized for cost with truncated input and simple prompts.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Server-side cache to avoid repeated AI calls for identical text
const serverCache = new Map<string, string>();
const MAX_CACHE_SIZE = 1000;

// Simple hash function for cache keys
function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Truncate to first 100 characters to minimize tokens
    const truncatedText = text.slice(0, 100).trim();
    
    if (truncatedText.length < 5) {
      return new Response(
        JSON.stringify({ language: 'en', confidence: 'low' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check server cache
    const cacheKey = hashText(truncatedText);
    if (serverCache.has(cacheKey)) {
      console.log('Cache hit for text hash:', cacheKey);
      return new Response(
        JSON.stringify({ language: serverCache.get(cacheKey), cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Call Lovable AI with the cheapest/fastest model
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          {
            role: 'system',
            content: 'You are a language detector. Return ONLY the ISO 639-1 two-letter language code (e.g., en, fr, es, de, it, pt, nl, pl, sv, da, no, fi, cs, hu, ro, tr, el, ru, uk, ar, he, hi, zh, ja, ko, th, vi, id, ms). Nothing else.'
          },
          {
            role: 'user',
            content: `Detect the language of this text: "${truncatedText}"`
          }
        ],
        max_tokens: 5,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded', language: 'en' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required', language: 'en' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error('AI gateway error');
    }

    const data = await response.json();
    const detectedLang = data.choices?.[0]?.message?.content?.trim()?.toLowerCase() || 'en';
    
    // Validate it's a proper 2-letter code
    const langCode = detectedLang.match(/^[a-z]{2}$/)?.[0] || 'en';

    // Cache the result (with LRU-style eviction)
    if (serverCache.size >= MAX_CACHE_SIZE) {
      const firstKey = serverCache.keys().next().value;
      if (firstKey) serverCache.delete(firstKey);
    }
    serverCache.set(cacheKey, langCode);

    console.log('Detected language:', langCode, 'for text:', truncatedText.slice(0, 30) + '...');

    return new Response(
      JSON.stringify({ language: langCode }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('detect-language error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', language: 'en' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
