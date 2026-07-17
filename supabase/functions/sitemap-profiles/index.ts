// Sitemap chunk for user profiles — up to 50,000 URLs per page.
// ?page=1 → rows 0..49999, ?page=2 → 50000..99999, etc.
// Source: suggested_profiles_cache (profiles known to have content).

const APP_URL = "https://dehub.io";
const CHUNK_SIZE = 50000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const offset = (page - 1) * CHUNK_SIZE;
  const rangeEnd = offset + CHUNK_SIZE - 1;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  let profiles: Array<{ username: string; updated_at?: string }> = [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/suggested_profiles_cache?select=username,updated_at&order=followers.desc.nullslast`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Range: `${offset}-${rangeEnd}`,
        },
      },
    );
    if (res.ok) profiles = await res.json();
  } catch (e) {
    console.error("sitemap-profiles fetch error:", e);
  }

  const urls = profiles
    .filter((p) => p.username)
    .map((p) => {
      const lastmod = p.updated_at ? `<lastmod>${p.updated_at}</lastmod>` : "";
      const uname = encodeURIComponent(p.username);
      return `  <url><loc>${APP_URL}/${uname}</loc>${lastmod}<changefreq>daily</changefreq><priority>0.6</priority></url>`;
    });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, max-age=600",
    },
  });
});
