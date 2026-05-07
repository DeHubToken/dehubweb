// Translates a stage transcript (segments + summary + chapter titles) into a
// target language. Caches per (stage_id, language) in stage_transcript_translations.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Segment { speaker: string; text: string; start: number; end: number }
interface Chapter { title: string; start: number; end: number }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

  try {
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');
    const body = await req.json().catch(() => ({}));
    const stageId: string | undefined = body?.stageId;
    const language: string | undefined = body?.language;
    const force: boolean = !!body?.force;
    if (!stageId || !language) throw new Error('stageId and language required');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    if (!force) {
      const { data: cached } = await admin
        .from('stage_transcript_translations')
        .select('status')
        .eq('stage_id', stageId)
        .eq('language', language)
        .maybeSingle();
      if (cached && (cached.status === 'ready' || cached.status === 'processing')) {
        return new Response(JSON.stringify({ ok: true, status: cached.status }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { data: tr, error } = await admin
      .from('stage_transcripts')
      .select('segments, summary, chapters, source_language')
      .eq('stage_id', stageId)
      .maybeSingle();
    if (error || !tr) throw new Error('transcript not found');

    await admin
      .from('stage_transcript_translations')
      .upsert({
        stage_id: stageId,
        language,
        status: 'processing',
        segments: [],
        summary: null,
        chapters: [],
        error: null,
      }, { onConflict: 'stage_id,language' });

    const work = (async () => {
      try {
        const segments = (tr.segments as Segment[]) || [];
        const chapters = (tr.chapters as Chapter[]) || [];
        const summary = (tr.summary as string | null) || null;

        // Translate texts in one shot — keep as JSON arrays so model preserves order.
        const payload = {
          texts: segments.map((s) => s.text),
          summary,
          chapter_titles: chapters.map((c) => c.title),
        };

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
                  `You are a translator. Translate every string into the language with code "${language}". Preserve meaning, tone, and proper names. Reply ONLY with strict JSON of the exact same shape as the user input: {"texts": string[], "summary": string|null, "chapter_titles": string[]}. Array lengths MUST match the input.`,
              },
              { role: 'user', content: JSON.stringify(payload) },
            ],
            response_format: { type: 'json_object' },
          }),
        });

        if (!res.ok) {
          const t = await res.text();
          throw new Error(`AI ${res.status}: ${t.slice(0, 200)}`);
        }
        const j = await res.json();
        const out = JSON.parse(j?.choices?.[0]?.message?.content || '{}');
        const tTexts: string[] = Array.isArray(out.texts) ? out.texts : [];
        const tTitles: string[] = Array.isArray(out.chapter_titles) ? out.chapter_titles : [];
        const tSummary: string | null = typeof out.summary === 'string' ? out.summary : null;

        const translatedSegments: Segment[] = segments.map((s, i) => ({
          ...s,
          text: tTexts[i] ?? s.text,
        }));
        const translatedChapters: Chapter[] = chapters.map((c, i) => ({
          ...c,
          title: tTitles[i] ?? c.title,
        }));

        await admin
          .from('stage_transcript_translations')
          .update({
            status: 'ready',
            segments: translatedSegments,
            summary: tSummary,
            chapters: translatedChapters,
            error: null,
          })
          .eq('stage_id', stageId)
          .eq('language', language);
      } catch (e) {
        await admin
          .from('stage_transcript_translations')
          .update({ status: 'failed', error: String((e as Error).message || e) })
          .eq('stage_id', stageId)
          .eq('language', language);
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
