// Daily cleanup: deletes editor assets that have been unused for 12+ months
// and are not flagged preserved (i.e. not attached to a posted DeHub video).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  let totalDeleted = 0;
  let totalBytes = 0;

  try {
    for (let i = 0; i < 20; i++) {
      const { data: rows, error } = await supabase
        .from('editor_assets')
        .select('id, storage_path, thumbnail_path, size_bytes')
        .eq('preserved', false)
        .lt('last_used_at', cutoff)
        .limit(500);

      if (error) throw error;
      if (!rows || rows.length === 0) break;

      const paths: string[] = [];
      for (const r of rows) {
        if (r.storage_path) paths.push(r.storage_path);
        if (r.thumbnail_path) paths.push(r.thumbnail_path);
      }
      if (paths.length) {
        const { error: rmErr } = await supabase.storage.from('editor-assets').remove(paths);
        if (rmErr) console.error('storage remove error', rmErr);
      }

      const ids = rows.map((r) => r.id);
      const { error: delErr } = await supabase.from('editor_assets').delete().in('id', ids);
      if (delErr) throw delErr;

      totalDeleted += rows.length;
      totalBytes += rows.reduce((s, r) => s + Number(r.size_bytes || 0), 0);
      if (rows.length < 500) break;
    }

    return new Response(
      JSON.stringify({ ok: true, deleted: totalDeleted, bytes_freed: totalBytes }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('cleanup error', e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
