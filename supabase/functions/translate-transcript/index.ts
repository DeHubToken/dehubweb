// deno-lint-ignore-file no-explicit-any
//
// On-demand transcript translation, one implementation.
//
// There used to be two: the video path cached into a JSONB blob on the parent
// row and answered in the response body, the stage path wrote
// `stage_transcript_translations` and let the client poll. Same work, two
// caches, two failure modes. Everything now lands in
// `transcript_translations`, which is readable straight from PostgREST — so a
// second viewer asking for the same language costs a cached row read and no
// model call at all.
//
// Four request shapes are accepted, because two of them are already in the
// wild:
//   { transcriptId, lang } what a client that has already read the row sends
//   { kind, ref, lang }    the contract for a client that has not
//   { tokenId, lang }      cached web bundles — answered in the body, as before
//   { stageId, language }  the shipped mobile build — answered by the row
import {
  admin,
  corsHeaders,
  json,
  normalizeLang,
  parseTarget,
  type Segment,
  type Target,
} from '../_shared/transcripts.ts';
import { languageNameFor } from '../_shared/language-names.ts';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const FAL_KEY = Deno.env.get('FAL_KEY');

const MODEL = 'google/gemini-2.5-flash-lite';
const CHUNK_SIZE = 60;
/** A speaker turn can run to a thousand characters, so sixty of them would
 *  sail past the provider's max_tokens. Pack by character budget instead,
 *  sized so a translation into CJK still fits. */
const CHUNK_MAX_CHARS = 4000;
/** A translation row nobody finished. Long enough not to race a live run. */
const STALE_TRANSLATION_MS = 10 * 60 * 1000;

interface Chapter { title?: string; start?: number; end?: number }

const subtitleSystemPrompt = (langName: string, count: number) =>
  `You are a subtitle translator. Translate each numbered line to ${langName}. ` +
  `Preserve the exact number and order. Do not merge, split, or add lines. ` +
  `Return ONLY a JSON array of exactly ${count} translated strings, one per input line, in order. ` +
  `No markdown fences, no commentary, no refusals — a line with nothing to translate is returned as given.`;

/** fal leads: the Lovable gateway has returned 402 (out of credits), and when
 *  it did every chunk threw, the catch fell back to the untranslated lines,
 *  and those got persisted as the translation. */
async function chunkViaFal(numbered: string, langName: string, count: number): Promise<string[] | null> {
  if (!FAL_KEY) return null;
  try {
    const res = await fetch('https://fal.run/openrouter/router', {
      method: 'POST',
      headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
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
  if (!LOVABLE_API_KEY) return [];
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
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
      tools: [{
        type: 'function',
        function: {
          name: 'return_translations',
          description: 'Return translations in order',
          parameters: {
            type: 'object',
            properties: { translations: { type: 'array', items: { type: 'string' } } },
            required: ['translations'],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'return_translations' } },
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  const parsed = typeof args === 'string' ? JSON.parse(args) : args;
  return parsed?.translations ?? [];
}

async function translateChunk(items: Array<{ text: string }>, langName: string): Promise<string[]> {
  const numbered = items.map((s, i) => `${i + 1}. ${s.text}`).join('\n');
  let out = await chunkViaFal(numbered, langName, items.length);
  if (!out) out = await chunkViaGateway(numbered, langName);
  // Nothing back at all is a failure, not a chunk of blanks — without this an
  // empty answer padded out to the original lines and was persisted as the
  // translation, which nothing downstream can tell apart from success.
  if (out.length === 0 && items.length > 0) throw new Error('provider returned no translations');
  while (out.length < items.length) out.push(items[out.length].text);
  return out.slice(0, items.length);
}

function packItems(items: Array<{ text: string }>): Array<Array<{ text: string }>> {
  const packs: Array<Array<{ text: string }>> = [];
  let cur: Array<{ text: string }> = [];
  let chars = 0;
  for (const item of items) {
    if (cur.length && (cur.length >= CHUNK_SIZE || chars + item.text.length > CHUNK_MAX_CHARS)) {
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

/** A lone speaker turn can outgrow a whole chunk by itself. Translate it in
 *  sentence pieces and stitch them back together. */
async function translateLongText(text: string, langName: string): Promise<string> {
  const pieces: Array<{ text: string }> = [];
  let cur = '';
  for (const part of text.split(/(?<=[.!?…。！？])\s+/)) {
    if (cur && cur.length + part.length + 1 > CHUNK_MAX_CHARS) {
      pieces.push({ text: cur });
      cur = part;
    } else {
      cur = cur ? `${cur} ${part}` : part;
    }
  }
  if (cur) pieces.push({ text: cur });
  const out: string[] = [];
  for (const pack of packItems(pieces)) out.push(...await translateChunk(pack, langName));
  return out.join(' ');
}

async function translateAll(
  segments: Segment[],
  summary: string | null,
  chapters: Chapter[],
  langName: string,
): Promise<{ segments: Segment[]; summary: string | null; chapters: Chapter[] }> {
  const summaryLines = summary ? summary.split('\n') : [];
  const items = [
    ...segments.map((s) => ({ text: s.text ?? '' })),
    ...summaryLines.map((text) => ({ text })),
    ...chapters.map((c) => ({ text: c.title ?? '' })),
  ];

  const texts: string[] = [];
  for (const pack of packItems(items)) {
    if (pack.length === 1 && pack[0].text.length > CHUNK_MAX_CHARS) {
      texts.push(await translateLongText(pack[0].text, langName));
    } else {
      texts.push(...await translateChunk(pack, langName));
    }
  }

  const segTexts = texts.slice(0, segments.length);
  const sumTexts = texts.slice(segments.length, segments.length + summaryLines.length);
  const chapTexts = texts.slice(segments.length + summaryLines.length);

  return {
    segments: segments.map((s, i) => ({ ...s, text: segTexts[i] ?? s.text })),
    summary: summary ? sumTexts.join('\n') : null,
    chapters: chapters.map((c, i) => ({ ...c, title: chapTexts[i] || c.title })),
  };
}

/* ──────────────────────────────── handler ───────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const transcriptId = typeof body?.transcriptId === 'string' ? body.transcriptId : null;
    const target: Target | null = transcriptId ? null : parseTarget(body);
    // A cached web bundle sends { tokenId, lang } and parses `segments` out of
    // the body. Anything else is answered by the row.
    const legacyVideoBody = !body?.kind && !transcriptId && body?.tokenId !== undefined;
    const wantBody = legacyVideoBody || body?.wait === true;

    const rawLang = String(body?.lang ?? body?.language ?? '').trim();
    if ((!target && !transcriptId) || !rawLang) {
      return json({ error: 'a target and a language are required' }, 400);
    }

    const langCode = rawLang.toLowerCase().slice(0, 16);
    // The prompt needs a language NAME. Passing the code raw invites the model
    // to guess, and for the long-tail codes the picker offers those guesses
    // came back as the wrong language entirely.
    const langName = languageNameFor(langCode);
    if (!langName) return json({ error: `unsupported language '${langCode}'` }, 400);

    const db = admin();
    const lookup = db
      .from('transcripts')
      .select('id, status, segments, summary, chapters, source_lang, visibility');
    const { data: row, error: rowErr } = await (
      transcriptId
        ? lookup.eq('id', transcriptId)
        : lookup.eq('source_kind', target!.kind).eq('source_ref', target!.ref)
    ).maybeSingle();
    if (rowErr) throw rowErr;
    if (!row || row.status !== 'ready') return json({ error: 'transcript not ready' }, 409);

    // Translations are readable by whoever can read the transcript, and this
    // function runs as service role with no way to tell an owner from anyone
    // else. Refusing keeps a private transcript from being republished in
    // another language. The video path never had this check.
    if (row.visibility === 'private') return json({ error: 'transcript is private' }, 403);

    const segments: Segment[] = Array.isArray(row.segments) ? row.segments : [];
    const summary: string | null = row.summary ?? null;
    const chapters: Chapter[] = Array.isArray(row.chapters) ? row.chapters : [];

    const { data: existing } = await db
      .from('transcript_translations')
      .select('status, segments, summary, chapters, updated_at')
      .eq('transcript_id', row.id)
      .eq('language', langCode)
      .maybeSingle();

    if (existing?.status === 'ready') {
      return json(
        wantBody
          ? { segments: existing.segments ?? [], cached: true }
          : { ok: true, status: 'ready', cached: true },
      );
    }
    if (existing?.status === 'processing') {
      // A fresh row is another caller's live run. A stale one is a crashed run
      // that nothing would otherwise retry — the drawer only re-invokes when
      // the row is missing or failed.
      const age = Date.now() - new Date(existing.updated_at).getTime();
      if (age < STALE_TRANSLATION_MS && !wantBody) {
        return json({ ok: true, status: 'processing' });
      }
    }

    // Same language as the recording → copy rather than machine-translate
    // en→en, which produced garbled duplicate lines. The source code is
    // normalised on write now, so this comparison is reliable for both kinds.
    const sourceBase = normalizeLang(row.source_lang);
    const targetBase = normalizeLang(langCode);
    if (sourceBase && targetBase && sourceBase === targetBase) {
      await db.from('transcript_translations').upsert({
        transcript_id: row.id,
        language: langCode,
        status: 'ready',
        segments,
        summary,
        chapters,
        error: null,
      }, { onConflict: 'transcript_id,language' });
      return json(
        wantBody
          ? { segments, cached: true, sameAsSource: true }
          : { ok: true, status: 'ready', cached: true, sameAsSource: true },
      );
    }

    await db.from('transcript_translations').upsert({
      transcript_id: row.id,
      language: langCode,
      status: 'processing',
      error: null,
    }, { onConflict: 'transcript_id,language' });

    const work = (async () => {
      const out = await translateAll(segments, summary, chapters, langName);
      await db.from('transcript_translations').update({
        status: 'ready',
        segments: out.segments,
        summary: out.summary,
        chapters: out.chapters,
        error: null,
      }).eq('transcript_id', row.id).eq('language', langCode);
      return out;
    })();

    if (wantBody) {
      // The caller is parsing the body, so it has to wait. A failure returns
      // the original lines for this one response and leaves nothing cached —
      // persisting a degraded result made the failure permanent, and while the
      // gateway was out of credits that is exactly what happened to every
      // language anyone asked for.
      try {
        const out = await work;
        return json({ segments: out.segments, cached: false });
      } catch (e) {
        await db.from('transcript_translations')
          .update({ status: 'failed', error: String((e as Error).message || e).slice(0, 500) })
          .eq('transcript_id', row.id).eq('language', langCode);
        return json({ segments, cached: false, degraded: true });
      }
    }

    const guarded = work.catch(async (e) => {
      await db.from('transcript_translations')
        .update({ status: 'failed', error: String((e as Error).message || e).slice(0, 500) })
        .eq('transcript_id', row.id).eq('language', langCode);
    });
    // @ts-ignore EdgeRuntime is provided by Supabase
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(guarded);
    else await guarded;

    return json({ ok: true, status: 'processing' });
  } catch (e: any) {
    console.error('translate-transcript error', e);
    return json({ error: e?.message ?? 'error' }, 500);
  }
});
