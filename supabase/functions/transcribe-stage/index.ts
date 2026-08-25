// deno-lint-ignore-file no-explicit-any
//
// Compatibility shim. Scribe, the speaker map and the timeline matching all
// moved to `transcribe`, which is now the only transcriber. This name stays
// alive because the shipped mobile build invokes it and cannot be rebuilt in
// the same breath, and it answers in the shape that build expects.
import { corsHeaders, json, parseTarget } from '../_shared/transcripts.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const target = parseTarget(body);
    if (!target || target.kind !== 'stage') return json({ error: 'stageId required' }, 400);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({
        kind: 'stage',
        ref: target.ref,
        action: 'start',
        force: body?.force === true,
        timeline: Array.isArray(body?.timeline) ? body.timeline : [],
      }),
    });

    const out = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: out?.error ?? `transcribe ${res.status}` }, 400);
    return json({ ok: true, status: out?.status ?? 'processing' });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 400);
  }
});
