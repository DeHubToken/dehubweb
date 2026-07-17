// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { tokenId, force } = await req.json();
    if (!tokenId) throw new Error('tokenId required');

    const db = admin();
    const { data: row, error } = await db
      .from('video_transcripts')
      .select('overview, transcript, status')
      .eq('token_id', tokenId)
      .maybeSingle();
    if (error) throw error;
    if (!row || row.status !== 'ready' || !row.transcript) {
      return new Response(JSON.stringify({ overview: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (row.overview && !force) {
      return new Response(JSON.stringify({ overview: row.overview }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fullText: string = (row.transcript as any)?.full_text ?? '';
    const snippet = fullText.slice(0, 8000);
    if (!snippet.trim()) {
      return new Response(JSON.stringify({ overview: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          {
            role: 'system',
            content:
              'You write extremely concise video overviews. Respond with 1-2 sentences (max 40 words) capturing the core topic and key takeaway. No preamble, no quotes, no markdown.',
          },
          { role: 'user', content: `Transcript:\n\n${snippet}` },
        ],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`AI gateway ${resp.status}: ${t}`);
    }
    const j = await resp.json();
    const overview: string = (j?.choices?.[0]?.message?.content ?? '').trim();
    if (overview) {
      await db.from('video_transcripts').update({ overview }).eq('token_id', tokenId);
    }
    return new Response(JSON.stringify({ overview }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
