import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async () => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const bucket = 'temp-compress';
  const paths: string[] = [];
  const walk = async (prefix: string) => {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) throw error;
    for (const f of data ?? []) {
      const p = prefix ? `${prefix}/${f.name}` : f.name;
      if (f.id) paths.push(p); else await walk(p);
    }
  };
  try {
    await walk('');
    const before = paths.length;
    if (before) {
      const { error } = await sb.storage.from(bucket).remove(paths);
      if (error) throw error;
    }
    const { error: be } = await sb.storage.deleteBucket(bucket);
    return Response.json({ before, removed: before, bucketDeleted: !be, bucketError: be?.message ?? null });
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
});
