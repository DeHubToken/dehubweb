// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

const MODEL = 'google/gemini-2.5-flash-lite';
const CHUNK_SIZE = 60; // segments per AI call

interface Segment { start: number; end: number; text: string }

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function translateChunk(segments: Segment[], lang: string): Promise<string[]> {
  const numbered = segments.map((s, i) => `${i + 1}. ${s.text}`).join('\n');
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            `You are a subtitle translator. Translate each numbered line to ${lang}. ` +
            `Preserve the exact number and order. Do not merge, split, or add lines. ` +
            `Return ONLY a JSON array of translated strings, one per input line, in order.`,
        },
        { role: 'user', content: numbered },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'return_translations',
            description: 'Return translations in order',
            parameters: {
              type: 'object',
              properties: {
                translations: { type: 'array', items: { type: 'string' } },
              },
              required: ['translations'],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'return_translations' } },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t}`);
  }
  const j = await res.json();
  const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  const parsed = typeof args === 'string' ? JSON.parse(args) : args;
  const out: string[] = parsed?.translations ?? [];
  // Pad/truncate to match
  while (out.length < segments.length) out.push(segments[out.length].text);
  return out.slice(0, segments.length);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { tokenId, lang } = await req.json();
    if (!tokenId || !lang) {
      return new Response(JSON.stringify({ error: 'tokenId and lang required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const langCode = String(lang).toLowerCase().slice(0, 16);
    const tid = Number(tokenId);
    const db = admin();

    const { data: row, error: rowErr } = await db
      .from('video_transcripts')
      .select('token_id, status, transcript, translations')
      .eq('token_id', tid)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row || row.status !== 'ready' || !row.transcript) {
      return new Response(JSON.stringify({ error: 'transcript not ready' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const segments: Segment[] = row.transcript.segments ?? [];
    const translations = (row.translations ?? {}) as Record<string, Segment[]>;

    if (translations[langCode]?.length === segments.length) {
      return new Response(
        JSON.stringify({ segments: translations[langCode], cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Translate in chunks
    const translated: Segment[] = [];
    for (let i = 0; i < segments.length; i += CHUNK_SIZE) {
      const slice = segments.slice(i, i + CHUNK_SIZE);
      let texts: string[];
      try {
        texts = await translateChunk(slice, langCode);
      } catch (e) {
        console.error('chunk translate failed', e);
        texts = slice.map((s) => s.text);
      }
      slice.forEach((s, idx) => {
        translated.push({ start: s.start, end: s.end, text: texts[idx] ?? s.text });
      });
    }

    const next = { ...translations, [langCode]: translated };
    await db
      .from('video_transcripts')
      .update({ translations: next })
      .eq('token_id', tid);

    return new Response(
      JSON.stringify({ segments: translated, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    console.error('translate-transcript error', e);
    return new Response(JSON.stringify({ error: e?.message ?? 'error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
