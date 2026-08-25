// deno-lint-ignore-file no-explicit-any
//
// Compatibility shim. The work moved to `transcribe`; this name stays alive
// because a browser holding a cached bundle still invokes it, and it answers
// in the shape that bundle parses — a `video_transcripts` row.
//
// New callers should use `transcribe` with `{ kind: 'video', ref }` and read
// the result from `public.transcripts` directly.
import { corsHeaders, json, parseTarget } from '../_shared/transcripts.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function db() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

async function legacyRow(tokenId: string) {
  const { data } = await db()
    .from('video_transcripts')
    .select('*')
    .eq('token_id', Number(tokenId))
    .maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const target = parseTarget(body);
    if (!target || target.kind !== 'video') return json({ error: 'invalid tokenId' }, 400);

    const action = String(body?.action ?? 'status');

    if (action === 'start') {
      await fetch(`${SUPABASE_URL}/functions/v1/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ kind: 'video', ref: target.ref, action: 'start' }),
      }).catch((e) => console.warn('forward to transcribe failed', e));
    }

    const row = await legacyRow(target.ref);
    return json(row ?? { status: 'absent', token_id: Number(target.ref) });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
