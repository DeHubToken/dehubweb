// Sitemap index — root of the sitemap tree served at https://dehub.io/sitemap.xml
// Auto-discovers how many chunk sitemaps are needed based on:
//   - max post tokenId from api.dehub.io (chunks of 50,000)
//   - profile count from suggested_profiles_cache (chunks of 50,000)

const APP_URL = "https://dehub.io";
const DEHUB_API_BASE = "https://api.dehub.io";
const CHUNK_SIZE = 50000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getLatestPost(): Promise<{ maxId: number; lastmod: string }> {
  try {
    const res = await fetch(`${DEHUB_API_BASE}/api/feed?limit=1&page=1`);
    if (!res.ok) return { maxId: 0, lastmod: new Date().toISOString().split("T")[0] };
    const json = await res.json();
    const first = json?.result?.[0];
    const maxId = Number(first?.tokenId ?? 0);
    const createdAt = first?.createdAt ? new Date(first.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
    return { maxId, lastmod: createdAt };
  } catch {
    return { maxId: 0, lastmod: new Date().toISOString().split("T")[0] };
  }
}

async function getProfilesMeta(): Promise<{ count: number; lastmod: string }> {
  const fallback = new Date().toISOString().split("T")[0];
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/suggested_profiles_cache?select=updated_at&order=updated_at.desc.nullslast&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Prefer: "count=exact",
        },
      },
    );
    const range = res.headers.get("content-range") ?? "";
    const total = Number(range.split("/")[1] ?? 0);
    let lastmod = fallback;
    if (res.ok) {
      const rows = await res.json();
      if (rows?.[0]?.updated_at) {
        lastmod = new Date(rows[0].updated_at).toISOString().split("T")[0];
      }
    }
    return { count: Number.isFinite(total) ? total : 0, lastmod };
  } catch {
    return { count: 0, lastmod: fallback };
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const today = new Date().toISOString().split("T")[0];
  const [posts, profiles] = await Promise.all([getLatestPost(), getProfilesMeta()]);

  const postChunks = Math.max(1, Math.ceil(posts.maxId / CHUNK_SIZE));
  const profileChunks = Math.max(1, Math.ceil(profiles.count / CHUNK_SIZE));

  const entries: string[] = [];
  entries.push(`  <sitemap><loc>${APP_URL}/sitemap-static.xml</loc><lastmod>${today}</lastmod></sitemap>`);
  for (let i = 1; i <= postChunks; i++) {
    // Only the last (newest) chunk changes; older chunks are effectively frozen.
    const lm = i === postChunks ? posts.lastmod : today;
    entries.push(`  <sitemap><loc>${APP_URL}/sitemap-posts-${i}.xml</loc><lastmod>${lm}</lastmod></sitemap>`);
  }
  for (let i = 1; i <= profileChunks; i++) {
    const lm = i === profileChunks ? profiles.lastmod : today;
    entries.push(`  <sitemap><loc>${APP_URL}/sitemap-profiles-${i}.xml</loc><lastmod>${lm}</lastmod></sitemap>`);
  }


  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</sitemapindex>`;

  return new Response(xml, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, max-age=600",
    },
  });
});
