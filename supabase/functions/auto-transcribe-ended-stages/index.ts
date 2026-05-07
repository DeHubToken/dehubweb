// Cron-invoked: finds recently-ended stages with recordings and no transcript,
// then triggers transcribe-stage for each (capped per run).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_PER_RUN = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // Pull ended stages with a recording
    const { data: stages, error } = await admin
      .from('audio_spaces')
      .select('id')
      .eq('status', 'ended')
      .not('recording_url', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    // Get existing transcripts for those stages
    const ids = (stages || []).map((s) => s.id);
    const { data: existing } = await admin
      .from('stage_transcripts')
      .select('stage_id, status')
      .in('stage_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);

    const existingMap = new Map<string, string>();
    (existing || []).forEach((e: any) => existingMap.set(e.stage_id, e.status));

    const todo = (stages || [])
      .filter((s) => {
        const st = existingMap.get(s.id);
        return !st || st === 'failed';
      })
      .slice(0, MAX_PER_RUN);

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const s of todo) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-stage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({ stageId: s.id }),
        });
        results.push({ id: s.id, ok: r.ok });
      } catch (e) {
        results.push({ id: s.id, ok: false, error: String((e as Error).message) });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
