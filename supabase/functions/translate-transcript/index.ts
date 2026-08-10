// deno-lint-ignore-file no-explicit-any
//
// On-demand transcript translation. Two callers, two contracts:
//   - use-video-subtitles sends { tokenId, lang }: the translation is cached
//     on video_transcripts.translations and returned in the response body.
//   - StageTranscriptDrawer sends { stageId, language }: the result is
//     persisted to stage_transcript_translations (processing → ready/failed)
//     and the drawer follows along via polling + realtime, so that path
//     answers immediately and finishes in the background.
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

async function translateChunk(items: Array<{ text: string }>, langName: string): Promise<string[]> {
  const numbered = items.map((s, i) => `${i + 1}. ${s.text}`).join('\n');
  let out = await chunkViaFal(numbered, langName, items.length);
  if (!out) out = await chunkViaGateway(numbered, langName);
  // Nothing back at all is a failure, not a chunk of blanks — without this, an
  // empty answer padded out to the original lines and was PERSISTED as the
  // translation by the caller, which cannot tell that apart from success.
  if (out.length === 0 && items.length > 0) {
    throw new Error('provider returned no translations');
  }
  // Pad/truncate to match
  while (out.length < items.length) out.push(items[out.length].text);
  return out.slice(0, items.length);
}

/* ────────────────────────── Stage transcripts ────────────────────────── */

interface StageSegment { speaker?: string; text: string; start?: number; end?: number }
interface StageChapter { title?: string; start?: number; end?: number }

// ElevenLabs Scribe stamps stage_transcripts.source_language with three-letter
// codes ('eng', 'tur'); the drawer's picker speaks two-letter ones. Map the
// codes Scribe actually emits so "translate English to English" can
// short-circuit to a copy. A code missing here just translates for real —
// wasteful, never wrong.
const SCRIBE_TO_PICKER: Record<string, string> = {
  eng: 'en', spa: 'es', fra: 'fr', fre: 'fr', deu: 'de', ger: 'de',
  ita: 'it', por: 'pt', rus: 'ru', tur: 'tr', jpn: 'ja', kor: 'ko',
  zho: 'zh', chi: 'zh', ara: 'ar', hin: 'hi', ind: 'id',
};

// Stage segments are whole speaker turns, not subtitle lines — a single turn
// can run to a thousand characters, so sixty per call would sail past the fal
// max_tokens cap and fail every chunk. Pack by character budget instead,
// sized so even a translation into CJK stays inside the cap.
const STAGE_CHUNK_MAX_CHARS = 4000;

function packItems(items: Array<{ text: string }>): Array<Array<{ text: string }>> {
  const packs: Array<Array<{ text: string }>> = [];
  let cur: Array<{ text: string }> = [];
  let chars = 0;
  for (const item of items) {
    if (cur.length && (cur.length >= CHUNK_SIZE || chars + item.text.length > STAGE_CHUNK_MAX_CHARS)) {
      packs.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(item);
    chars += item.text.length;
  }
  if (cur.length) packs.push(cur);
  return packs;
}

// A lone speaker turn can outgrow a whole chunk by itself (a solo stage
// diarizes into one enormous segment). Translate it in sentence pieces and
// stitch the pieces back together.
async function translateLongText(text: string, langName: string): Promise<string> {
  const pieces: Array<{ text: string }> = [];
  let cur = '';
  for (const part of text.split(/(?<=[.!?…。！？])\s+/)) {
    if (cur && cur.length + part.length + 1 > STAGE_CHUNK_MAX_CHARS) {
      pieces.push({ text: cur });
      cur = part;
    } else {
      cur = cur ? `${cur} ${part}` : part;
    }
  }
  if (cur) pieces.push({ text: cur });
  const out: string[] = [];
  for (const pack of packItems(pieces)) {
    out.push(...await translateChunk(pack, langName));
  }
  return out.join(' ');
}

async function translateStage(stageId: string, language: string): Promise<Response> {
  const langCode = language.toLowerCase().slice(0, 16);
  if (!langCode) {
    return new Response(JSON.stringify({ error: 'language required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const langName = languageNameFor(langCode);
  if (!langName) {
    return new Response(JSON.stringify({ error: `unsupported language '${langCode}'` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const db = admin();
  const { data: row, error: rowErr } = await db
    .from('stage_transcripts')
    .select('stage_id, status, segments, summary, chapters, source_language, privacy')
    .eq('stage_id', stageId)
    .maybeSingle();
  if (rowErr) throw rowErr;
  if (!row || row.status !== 'ready') {
    return new Response(JSON.stringify({ error: 'transcript not ready' }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // Translations land in a world-readable table, and this function runs as
  // service role with no way to tell the host from anyone else — translating a
  // private transcript would republish it for everyone. Public and members
  // transcripts are exactly what an anonymous reader can already see.
  if (row.privacy === 'private') {
    return new Response(JSON.stringify({ error: 'transcript is private' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: existing, error: existingErr } = await db
    .from('stage_transcript_translations')
    .select('status, updated_at')
    .eq('stage_id', stageId)
    .eq('language', langCode)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing?.status === 'ready') {
    return new Response(JSON.stringify({ ok: true, status: 'ready', cached: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (existing?.status === 'processing') {
    // A fresh processing row is another caller's live run — leave it be. A
    // stale one is a crashed run, and nothing would ever retry it otherwise:
    // the drawer only re-invokes when the row is missing or failed.
    const age = Date.now() - new Date(existing.updated_at).getTime();
    if (age < 10 * 60 * 1000) {
      return new Response(JSON.stringify({ ok: true, status: 'processing' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const segments: StageSegment[] = Array.isArray(row.segments) ? row.segments : [];
  const summary: string | null = row.summary ?? null;
  const chapters: StageChapter[] = Array.isArray(row.chapters) ? row.chapters : [];

  // Same language as the recording → copy, don't machine-translate en→en.
  const sourceRaw = String(row.source_language ?? '').toLowerCase();
  const sourceCode = SCRIBE_TO_PICKER[sourceRaw] ?? sourceRaw.split(/[-_]/)[0];
  if (sourceCode && sourceCode === langCode.split(/[-_]/)[0]) {
    await db.from('stage_transcript_translations').upsert({
      stage_id: stageId,
      language: langCode,
      status: 'ready',
      segments,
      summary,
      chapters,
      error: null,
    }, { onConflict: 'stage_id,language' });
    return new Response(JSON.stringify({ ok: true, status: 'ready', sameAsSource: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // The row goes in before we answer so the drawer's very next poll sees
  // 'processing'; the translation itself finishes in the background.
  await db.from('stage_transcript_translations').upsert({
    stage_id: stageId,
    language: langCode,
    status: 'processing',
    error: null,
  }, { onConflict: 'stage_id,language' });

  const work = (async () => {
    try {
      // Segments, summary lines and chapter titles ride the same numbered-line
      // protocol, then get split back apart by position.
      const summaryLines = summary ? summary.split('\n') : [];
      const items = [
        ...segments.map((s) => ({ text: s.text ?? '' })),
        ...summaryLines.map((text) => ({ text })),
        ...chapters.map((c) => ({ text: c.title ?? '' })),
      ];

      const texts: string[] = [];
      for (const pack of packItems(items)) {
        if (pack.length === 1 && pack[0].text.length > STAGE_CHUNK_MAX_CHARS) {
          texts.push(await translateLongText(pack[0].text, langName));
        } else {
          texts.push(...await translateChunk(pack, langName));
        }
      }
      // Unlike the video path there is no caller to hand a degraded result to —
      // whatever lands in this row is served as the translation from then on,
      // so a failed chunk fails the whole run (translateChunk throws) rather
      // than persisting untranslated lines as if they were a translation.

      const segTexts = texts.slice(0, segments.length);
      const sumTexts = texts.slice(segments.length, segments.length + summaryLines.length);
      const chapTexts = texts.slice(segments.length + summaryLines.length);

      await db.from('stage_transcript_translations').update({
        status: 'ready',
        segments: segments.map((s, i) => ({ ...s, text: segTexts[i] ?? s.text })),
        summary: summary ? sumTexts.join('\n') : null,
        chapters: chapters.map((c, i) => ({ ...c, title: chapTexts[i] || c.title })),
        error: null,
      }).eq('stage_id', stageId).eq('language', langCode);
    } catch (e) {
      await db.from('stage_transcript_translations').update({
        status: 'failed',
        error: String((e as Error).message || e).slice(0, 500),
      }).eq('stage_id', stageId).eq('language', langCode);
    }
  })();

  // @ts-ignore - EdgeRuntime is provided in Deno deploy
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
  else await work;

  return new Response(JSON.stringify({ ok: true, status: 'processing' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    // The stage drawer's contract delivers results through
    // stage_transcript_translations rather than the response body. Everything
    // below this branch is the video subtitle path.
    if (body?.stageId) {
      return await translateStage(String(body.stageId), String(body.language ?? body.lang ?? ''));
    }
    const { tokenId, lang } = body ?? {};
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
