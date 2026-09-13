// Sitemap chunk for user posts — up to 50,000 URLs per page.
// Post tokenIds are sequential integers minted in order.
// ?page=1 → tokenIds 1..50000, ?page=2 → 50001..100000, etc.
//
// We page through api.dehub.io/api/feed to enumerate real minted posts in
// the target range (gaps skipped) and emit <loc>https://dehub.io/app/post/{id}</loc>.

const APP_URL = "https://dehub.io";
const DEHUB_API_BASE = "https://api.dehub.io";
const CHUNK_SIZE = 50000;

// The API caps `limit` at 100 and silently returns 100 for anything larger.
// This asked for 500 and then reasoned about its own progress as if it had
// received 500 — five times fewer requests than it was actually making, which
// is how a run walked into the per-IP rate limit without the safety cap ever
// coming close to firing.
const FEED_PAGE_SIZE = 100;

// A 429 or a 5xx from the feed is answered by backing off and asking again
// (see fetchFeedPage) rather than by pacing every request: a full enumeration
// is ~33 requests and the edge holds the result for an hour, so the run should
// be quick when the API is healthy and slow only when it is not.
const FEED_RETRIES = 4;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer",
};

interface FeedPost {
  tokenId: number;
  createdAt?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One page of the feed, retried through transient failures.
 *
 * Returns null only once the retries are spent. The caller must treat that as
 * an incomplete run rather than as the end of the data — see the loop below.
 */
async function fetchFeedPage(page: number): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt < FEED_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    try {
      const res = await fetch(
        `${DEHUB_API_BASE}/api/feed?limit=${FEED_PAGE_SIZE}&page=${page}` +
          // Match sitemap-index, which reads the same feed. Without an explicit
          // sort the API's page boundaries can shift between our requests, so a
          // post slides across a boundary and is listed twice or not at all;
          // without status=minted the list carries posts whose /app/post/ page
          // does not resolve, i.e. a sitemap of 404s.
          `&sortBy=createdAt&sortOrder=desc&status=minted`,
        { signal: AbortSignal.timeout(15000) },
      );
      // A 429 or a 502 is "ask again", not "there are no more posts". The old
      // code broke out of the loop here, which published however many URLs it
      // had managed to collect as a complete, cacheable sitemap.
      if (!res.ok) continue;
      return await res.json();
    } catch (e) {
      console.error(`sitemap-posts feed page ${page} attempt ${attempt + 1}:`, e);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const minId = (page - 1) * CHUNK_SIZE + 1;
  const maxId = page * CHUNK_SIZE;

  const posts: FeedPost[] = [];
  const seen = new Set<number>();
  // Only a page that actually said "no more" — or one that ran off the bottom
  // of our id range — means we enumerated everything we were asked for.
  let complete = false;

  let feedPage = 1;
  while (true) {
    const json = await fetchFeedPage(feedPage);
    if (!json) break;

    const rows: FeedPost[] = (json as { result?: FeedPost[] })?.result ?? [];
    if (rows.length === 0) {
      complete = true;
      break;
    }

    for (const row of rows) {
      const id = Number(row.tokenId);
      if (!Number.isFinite(id)) continue;
      if (id < minId || id > maxId) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      posts.push({ tokenId: id, createdAt: row.createdAt });
    }

    // Feed is newest-first. Once the smallest id we saw is below our range,
    // no later page can add ids inside the range.
    const smallest = rows.reduce((m, r) => Math.min(m, Number(r.tokenId) || Infinity), Infinity);
    if (smallest < minId) {
      complete = true;
      break;
    }

    const pagination = (json as { pagination?: { hasMore?: boolean } })?.pagination;
    if (!pagination?.hasMore) {
      complete = true;
      break;
    }
    feedPage++;
    if (feedPage > 2000) break; // hard safety cap
  }

  // A truncated sitemap is worse than no sitemap: it is a 200 that the edge
  // caches for an hour and that tells Google the posts it omits were removed.
  // 500 here becomes a 503 at the worker, which crawlers retry.
  if (!complete) {
    console.error(
      `sitemap-posts incomplete for page ${page} after ${feedPage} feed pages (${posts.length} urls) — refusing to publish`,
    );
    return new Response("sitemap-posts: upstream feed enumeration incomplete", {
      status: 500,
      headers: { ...corsHeaders, "Cache-Control": "no-store" },
    });
  }

  posts.sort((a, b) => a.tokenId - b.tokenId);

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
