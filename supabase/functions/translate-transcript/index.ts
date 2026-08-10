// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
import { languageNameFor } from '../_shared/language-names.ts';

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

const subtitleSystemPrompt = (langName: string, count: number) =>
  `You are a subtitle translator. Translate each numbered line to ${langName}. ` +
  `Preserve the exact number and order. Do not merge, split, or add lines. ` +
  `Return ONLY a JSON array of exactly ${count} translated strings, one per input line, in order. ` +
  `No markdown fences, no commentary, no refusals — a line with nothing to translate is returned as given.`;

/**
 * fal, via its OpenRouter router endpoint — the same tier and model that
 * carries translate-text. It leads because the Lovable gateway below has been
 * returning 402 (out of credits), which quietly killed subtitle translation:
 * every chunk threw, the catch fell back to the untranslated lines, and those
 * got persisted as the translation. Returns null rather than throwing so a
 * failure falls through to the gateway.
 */
async function chunkViaFal(numbered: string, langName: string, count: number): Promise<string[] | null> {
  const FAL_KEY = Deno.env.get('FAL_KEY');
  if (!FAL_KEY) return null;
  try {
    const res = await fetch('https://fal.run/openrouter/router', {
      method: 'POST',
      headers: {
        Authorization: `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4.5',
        system_prompt: subtitleSystemPrompt(langName, count),
        prompt: numbered,
        temperature: 0.1,
        max_tokens: 8000,
      }),
    });
    if (!res.ok) {
      console.error(`fal ${res.status}: ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    const raw = typeof data.output === 'string' ? data.output.trim() : '';
    if (!raw) return null;
    // The prompt forbids fences; strip them anyway rather than fail the chunk
    // over formatting.
    const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const arr = JSON.parse(unfenced);
    if (!Array.isArray(arr) || !arr.every((x) => typeof x === 'string')) return null;
    return arr;
  } catch (e) {
    console.error('fal chunk failed', e);
    return null;
  }
}

async function chunkViaGateway(numbered: string, langName: string): Promise<string[]> {
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
            `You are a subtitle translator. Translate each numbered line to ${langName}. ` +
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
  return parsed?.translations ?? [];
}

async function translateChunk(segments: Segment[], langName: string): Promise<string[]> {
  const numbered = segments.map((s, i) => `${i + 1}. ${s.text}`).join('\n');
  let out = await chunkViaFal(numbered, langName, segments.length);
  if (!out) out = await chunkViaGateway(numbered, langName);
  // Nothing back at all is a failure, not a chunk of blanks — without this, an
  // empty answer padded out to the original lines and was PERSISTED as the
  // translation by the caller, which cannot tell that apart from success.
  if (out.length === 0 && segments.length > 0) {
    throw new Error('provider returned no translations');
  }
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
    // The prompt needs a language NAME. The code used to go in raw — "translate
    // to sk" invites the model to guess, and for the long-tail codes the picker
    // offers (acm, syl, dcc…) the guesses were wrong-language subtitles. An
    // unknown code is refused rather than guessed at.
    const langName = languageNameFor(langCode);
    if (!langName) {
      return new Response(JSON.stringify({ error: `unsupported language '${langCode}'` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const tid = Number(tokenId);
    const db = admin();

    const { data: row, error: rowErr } = await db
      .from('video_transcripts')
      .select('token_id, status, transcript, translations, source_lang')
      .eq('token_id', tid)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row || row.status !== 'ready' || !row.transcript) {
      return new Response(JSON.stringify({ error: 'transcript not ready' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Short-circuit: if target language matches the detected source language,
    // return original segments without calling the AI (no en→en garbage).
    const sourceLang = String(row.source_lang ?? '').toLowerCase();
    const normalizedSource = sourceLang.split('-')[0];
    const normalizedTarget = langCode.split('-')[0];
    if (normalizedSource && normalizedSource === normalizedTarget) {
      return new Response(
        JSON.stringify({ segments: row.transcript.segments ?? [], cached: true, sameAsSource: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
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
    let anyChunkFailed = false;
    for (let i = 0; i < segments.length; i += CHUNK_SIZE) {
      const slice = segments.slice(i, i + CHUNK_SIZE);
      let texts: string[];
      try {
        texts = await translateChunk(slice, langName);
      } catch (e) {
        console.error('chunk translate failed', e);
        anyChunkFailed = true;
        texts = slice.map((s) => s.text);
      }
      slice.forEach((s, idx) => {
        translated.push({ start: s.start, end: s.end, text: texts[idx] ?? s.text });
      });
    }

    // A failed chunk falls back to its untranslated lines so the viewer still
    // gets subtitles this session — but persisting that fallback made the
    // failure permanent: the untranslated copy passed the length check above
    // and was served as "cached" to everyone who asked ever after. While the
    // gateway was out of credits, that is exactly what happened to every
    // language requested. Failures now return degraded and uncached, so the
    // next request simply tries again.
    if (anyChunkFailed) {
      return new Response(
        JSON.stringify({ segments: translated, cached: false, degraded: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
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
