// Sitemap chunk for user posts — up to 50,000 URLs per page.
// Post tokenIds are sequential integers minted in order.
// ?page=1 → tokenIds 1..50000, ?page=2 → 50001..100000, etc.
//
// We page through api.dehub.io/api/feed to enumerate real minted posts in
// the target range (gaps skipped) and emit <loc>https://dehub.io/app/post/{id}</loc>.

const APP_URL = "https://dehub.io";
const DEHUB_API_BASE = "https://api.dehub.io";
const CHUNK_SIZE = 50000;
const FEED_PAGE_SIZE = 500; // per DeHub /api/feed request

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FeedPost {
  tokenId: number;
  createdAt?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const minId = (page - 1) * CHUNK_SIZE + 1;
  const maxId = page * CHUNK_SIZE;

  const posts: FeedPost[] = [];
  try {
    let feedPage = 1;
    while (true) {
      const res = await fetch(`${DEHUB_API_BASE}/api/feed?limit=${FEED_PAGE_SIZE}&page=${feedPage}`);
      if (!res.ok) break;
      const json = await res.json();
      const rows: FeedPost[] = json?.result ?? [];
      if (rows.length === 0) break;

      for (const row of rows) {
        const id = Number(row.tokenId);
        if (!Number.isFinite(id)) continue;
        if (id >= minId && id <= maxId) {
          posts.push({ tokenId: id, createdAt: row.createdAt });
        }
      }

      // Feed is newest-first. Once the smallest id we saw is below our range,
      // no later page can add ids inside the range.
      const smallest = rows.reduce((m, r) => Math.min(m, Number(r.tokenId) || Infinity), Infinity);
      if (smallest < minId) break;

      const hasMore = json?.pagination?.hasMore;
      if (!hasMore) break;
      feedPage++;
      if (feedPage > 500) break; // hard safety cap
    }
  } catch (e) {
    console.error("sitemap-posts feed fetch error:", e);
  }

  const urls = posts.map((p) => {
    const lastmod = p.createdAt ? `<lastmod>${p.createdAt}</lastmod>` : "";
    return `  <url><loc>${APP_URL}/app/post/${p.tokenId}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.6</priority></url>`;
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
