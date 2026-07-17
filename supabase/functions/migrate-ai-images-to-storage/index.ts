import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const BUCKET = 'ai-media-uploads';

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const batch = Math.min(50, Math.max(1, Number(url.searchParams.get('batch') ?? 20)));

  // Fetch a batch of rows whose image_url is a data URL (avoid big payloads: only id)
  const { data: rows, error } = await supabase
    .from('ai_messages')
    .select('id, image_url')
    .like('image_url', 'data:%')
    .limit(batch);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let migrated = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const row of rows ?? []) {
    try {
      const dataUrl: string = row.image_url;
      const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.*)$/.exec(dataUrl);
      if (!match) throw new Error('not a data url');
      const mime = match[1];
      const b64 = match[2];
      const bytes = b64ToBytes(b64);
      const ext = mime.split('/')[1]?.split('+')[0] ?? 'png';
      const path = `assistant/${row.id}.${ext}`;

      const up = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType: mime,
        upsert: true,
      });
      if (up.error) throw up.error;

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      const upd = await supabase
        .from('ai_messages')
        .update({ image_url: publicUrl })
        .eq('id', row.id);
      if (upd.error) throw upd.error;

      migrated++;
    } catch (e) {
      errors.push({ id: row.id, error: (e as Error).message });
    }
  }

  const { count: remaining } = await supabase
    .from('ai_messages')
    .select('id', { count: 'exact', head: true })
    .like('image_url', 'data:%');

  return new Response(
    JSON.stringify({ migrated, errors, remaining }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
