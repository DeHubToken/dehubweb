// Generates an AI summary + chapter markers for a stage transcript.
// Uses Lovable AI Gateway (google/gemini-3-flash-preview) — no extra secrets.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Segment { speaker: string; text: string; start: number; end: number }
interface Chapter { title: string; start: number; end: number }

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

  try {
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');
    const body = await req.json().catch(() => ({}));
    const stageId: string | undefined = body?.stageId;
    const force: boolean = !!body?.force;
    if (!stageId) throw new Error('stageId required');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: tr, error } = await admin
      .from('stage_transcripts')
      .select('segments, summary_status')
      .eq('stage_id', stageId)
      .maybeSingle();
    if (error || !tr) throw new Error('transcript not found');

    if (!force && tr.summary_status === 'ready') {
      return new Response(JSON.stringify({ ok: true, status: 'ready' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const segments = (tr.segments as Segment[]) || [];
    if (!segments.length) {
      await admin.from('stage_transcripts')
        .update({ summary_status: 'failed' })
        .eq('stage_id', stageId);
      throw new Error('no segments to summarize');
    }

    await admin.from('stage_transcripts')
      .update({ summary_status: 'processing' })
      .eq('stage_id', stageId);

    const work = (async () => {
      try {
        const transcriptText = segments
          .map((s) => `[${fmt(s.start)}] ${s.text}`)
          .join('\n')
          .slice(0, 24000);

        const lastEnd = segments[segments.length - 1]?.end ?? 0;

        const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: [
              {
                role: 'system',
                content:
                  'You summarize audio room transcripts. Reply ONLY with strict JSON: {"summary": string (3-5 bullet sentences joined by newlines), "chapters": [{"title": string (max 6 words), "start": number (seconds), "end": number (seconds)}]}. Use 3-6 chapters covering the whole timespan in order. No prose outside JSON.',
              },
              {
                role: 'user',
                content: `Transcript ends at ${fmt(lastEnd)} (${Math.round(lastEnd)}s).\n\n${transcriptText}`,
              },
            ],
            response_format: { type: 'json_object' },
          }),
        });

        if (!res.ok) {
          const t = await res.text();
          throw new Error(`AI ${res.status}: ${t.slice(0, 200)}`);
        }
        const j = await res.json();
        const content = j?.choices?.[0]?.message?.content || '{}';
        const parsed = JSON.parse(content);
        const summary: string = typeof parsed.summary === 'string' ? parsed.summary : '';
        const chapters: Chapter[] = Array.isArray(parsed.chapters)
          ? parsed.chapters
              .filter((c: any) => c && typeof c.title === 'string' && typeof c.start === 'number')
              .map((c: any) => ({
                title: String(c.title).slice(0, 80),
                start: Math.max(0, Number(c.start) || 0),
                end: Math.max(Number(c.start) || 0, Number(c.end) || lastEnd),
              }))
          : [];

        await admin.from('stage_transcripts')
          .update({ summary, chapters, summary_status: 'ready' })
          .eq('stage_id', stageId);
      } catch (e) {
        await admin.from('stage_transcripts')
          .update({ summary_status: 'failed' })
          .eq('stage_id', stageId);
        console.error('summarize-transcript error', e);
      }
    })();

    // @ts-ignore EdgeRuntime
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
    else await work;

    return new Response(JSON.stringify({ ok: true, status: 'processing' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
