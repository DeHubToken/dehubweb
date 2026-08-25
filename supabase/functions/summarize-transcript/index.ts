// deno-lint-ignore-file no-explicit-any
//
// Overview + chapters for any transcript.
//
// This took `{ tokenId }` only, and threw `tokenId required` on anything else
// — but `transcribe-stage` has always called it with `{ stageId }`. Every
// stage transcript in production is therefore sitting at
// summary_status 'processing' with no summary and no chapters, and has been
// since the feature shipped. It now speaks the same `{ kind, ref }` contract
// as the rest of the stack and both old shapes still parse.
import {
  admin,
  corsHeaders,
  json,
  normalizeTarget,
  parseTarget,
  type Segment,
  type Target,
} from '../_shared/transcripts.ts';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const FAL_KEY = Deno.env.get('FAL_KEY');

const OVERVIEW_PROMPT =
  'You write extremely concise overviews of recorded audio and video. ' +
  'Respond with 1-2 sentences (max 40 words) capturing the core topic and key ' +
  'takeaway. No preamble, no quotes, no markdown.';

const CHAPTERS_PROMPT =
  'You split a timestamped transcript into chapters. Return ONLY a JSON array ' +
  'of objects {"title": string, "start": number, "end": number} where start and ' +
  'end are seconds taken from the transcript. Between 2 and 8 chapters, in order, ' +
  'covering the whole recording without gaps or overlaps. Titles are 2-6 words, ' +
  'no numbering, no markdown, no commentary.';

/** fal leads because the Lovable gateway has returned 402 (out of credits)
 *  before now, and a summary that silently never appears is exactly the kind
 *  of failure nobody notices. Returns null so the caller falls through. */
async function viaFal(system: string, prompt: string): Promise<string | null> {
  if (!FAL_KEY) return null;
  try {
    const res = await fetch('https://fal.run/openrouter/router', {
      method: 'POST',
      headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4.5',
        system_prompt: system,
        prompt,
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });
    if (!res.ok) {
      console.error(`fal ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const data = await res.json();
    const out = typeof data.output === 'string' ? data.output.trim() : '';
    return out || null;
  } catch (e) {
    console.error('fal summarize failed', e);
    return null;
  }
}

async function viaGateway(system: string, prompt: string): Promise<string | null> {
  if (!LOVABLE_API_KEY) return null;
  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`gateway ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const j = await res.json();
    return (j?.choices?.[0]?.message?.content ?? '').trim() || null;
  } catch (e) {
    console.error('gateway summarize failed', e);
    return null;
  }
}

async function ask(system: string, prompt: string): Promise<string | null> {
  return (await viaFal(system, prompt)) ?? (await viaGateway(system, prompt));
}

function timedTranscript(segments: Segment[], budget = 12000): string {
  const lines: string[] = [];
  let used = 0;
  for (const s of segments) {
    const line = `[${Math.floor(s.start)}] ${s.text}`;
    if (used + line.length > budget) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}

function parseChapters(raw: string, duration: number | null): Array<{ title: string; start: number; end: number }> {
  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let arr: any;
  try {
    arr = JSON.parse(unfenced);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out = arr
    .map((c: any) => ({
      title: String(c?.title ?? '').trim().slice(0, 80),
      start: Number(c?.start),
      end: Number(c?.end),
    }))
    .filter((c) => c.title && Number.isFinite(c.start) && c.start >= 0)
    .sort((a, b) => a.start - b.start);

  // A model that fumbles an end time should not produce a chapter that never
  // ends — close each one at the next chapter's start.
  return out.map((c, i) => ({
    ...c,
    end: Number.isFinite(c.end) && c.end > c.start
      ? c.end
      : (out[i + 1]?.start ?? duration ?? c.start + 60),
  }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    let target: Target | null = parseTarget(body);
    // `{ tokenId }` with no kind is a video; parseTarget already handles that,
    // but a bare numeric `ref` with a bad kind should not become a stage.
    if (!target && body?.ref) target = normalizeTarget({ kind: 'video', ref: String(body.ref) });
    if (!target) return json({ error: 'a valid { kind, ref } is required' }, 400);

    const force = body?.force === true;
    const db = admin();

    const { data: row, error } = await db
      .from('transcripts')
      .select('id, status, summary, chapters, summary_status, segments, full_text, duration_seconds')
      .eq('source_kind', target.kind)
      .eq('source_ref', target.ref)
      .maybeSingle();
    if (error) throw error;

    if (!row || row.status !== 'ready') {
      return json({ overview: null, summary: null, chapters: [] });
    }
    if (row.summary && !force) {
      return json({ overview: row.summary, summary: row.summary, chapters: row.chapters ?? [] });
    }

    const segments: Segment[] = Array.isArray(row.segments) ? row.segments : [];
    const fullText = String(row.full_text ?? '').trim();
    if (!fullText) {
      await db.from('transcripts').update({ summary_status: 'skipped' }).eq('id', row.id);
      return json({ overview: null, summary: null, chapters: [] });
    }

    const overview = await ask(OVERVIEW_PROMPT, `Transcript:\n\n${fullText.slice(0, 8000)}`);

    // Chapters only earn their call on something long enough to navigate.
    const duration = row.duration_seconds ?? (segments.at(-1)?.end ?? 0);
    let chapters = Array.isArray(row.chapters) ? row.chapters : [];
    if (duration >= 120 && segments.length >= 8) {
      const rawChapters = await ask(
        CHAPTERS_PROMPT,
        `Recording is ${Math.round(duration)} seconds long.\n\n${timedTranscript(segments)}`,
      );
      if (rawChapters) {
        const parsed = parseChapters(rawChapters, duration);
        if (parsed.length) chapters = parsed;
      }
    }

    await db.from('transcripts').update({
      summary: overview ?? row.summary,
      chapters,
      // 'failed' rather than a silent stall: every stage sat at 'processing'
      // forever because nothing ever wrote a terminal value here.
      summary_status: overview ? 'ready' : 'failed',
    }).eq('id', row.id);

    return json({ overview, summary: overview, chapters });
  } catch (e: any) {
    console.error('summarize-transcript error', e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
