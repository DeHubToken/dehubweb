import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const out: Record<string, unknown> = {};
  for (const bucket of ["stories", "dex-pool-images"]) {
    const r: Record<string, unknown> = {};
    const { data: before } = await sb.schema("storage" as any).from("objects").select("name").eq("bucket_id", bucket);
    r.before = before?.length ?? null;
    const names = (before ?? []).map((o: any) => o.name);
    for (let i = 0; i < names.length; i += 100) {
      const { error } = await sb.storage.from(bucket).remove(names.slice(i, i + 100));
      if (error) r.removeError = error.message;
    }
    const { error: emptyErr } = await sb.storage.emptyBucket(bucket);
    if (emptyErr) r.emptyError = emptyErr.message;
    const { error: delErr } = await sb.storage.deleteBucket(bucket);
    r.deleteError = delErr?.message ?? null;
    out[bucket] = r;
  }
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
});
