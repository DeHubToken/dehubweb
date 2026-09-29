import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const out: Record<string, unknown> = {};
  for (const bucket of ["stories", "dex-pool-images"]) {
    const { error: emptyErr } = await sb.storage.emptyBucket(bucket);
    const { error: delErr } = await sb.storage.deleteBucket(bucket);
    out[bucket] = { emptyError: emptyErr?.message ?? null, deleteError: delErr?.message ?? null };
  }
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
});
