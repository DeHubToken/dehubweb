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

// api.dehub.io rate-limits per IP and publishes the budget on every response
// (X-RateLimit-*-short is the tight one: 20 requests per 10s). A full
// enumeration is ~33 requests from a single Supabase colo, so it does not fit
// in one window and a naive run is throttled partway through every time. We
// read the headers and wait out the window rather than guessing a fixed delay:
// no slower than the API requires, and no faster than it allows.
const RATE_LIMIT_HEADROOM = 1; // start waiting with this many requests to spare
const MAX_WAIT_SECONDS = 30; // never trust an absurd Reset value
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
 * Seconds to wait before the next request, read from the response's own
 * rate-limit budget. Zero when there is headroom left.
 *
 * The API answers with `X-RateLimit-{Limit,Remaining,Reset}-{short,medium,long}`
 * and enforces all three. Whichever bucket is closest to empty decides.
 */
function rateLimitWaitSeconds(headers: Headers): number {
  let wait = 0;
  for (const bucket of ["short", "medium", "long"]) {
    const remaining = Number(headers.get(`x-ratelimit-remaining-${bucket}`));
    const reset = Number(headers.get(`x-ratelimit-reset-${bucket}`));
    if (!Number.isFinite(remaining) || !Number.isFinite(reset)) continue;
    if (remaining > RATE_LIMIT_HEADROOM) continue;
    wait = Math.max(wait, Math.min(reset, MAX_WAIT_SECONDS));
  }
  return wait;
}

/**
 * One page of the feed, retried through transient failures.
 *
 * Returns null only once the retries are spent. The caller must treat that as
 * an incomplete run rather than as the end of the data — see the loop below.
 */
async function fetchFeedPage(page: number): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt < FEED_RETRIES; attempt++) {
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
      if (!res.ok) {
        await res.body?.cancel();
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Math.max(
          rateLimitWaitSeconds(res.headers),
          Number.isFinite(retryAfter) ? Math.min(retryAfter, MAX_WAIT_SECONDS) : 0,
          // A 5xx carries no budget to read, so fall back to plain backoff.
          2 ** attempt,
        );
        console.error(`sitemap-posts feed page ${page}: ${res.status}, waiting ${wait}s`);
        await sleep(wait * 1000);
        continue;
      }

      const json = await res.json();
      // Spend the remaining budget before it runs out rather than after: being
      // throttled costs a full window, waiting for one costs the seconds left
      // in it. On a healthy run with headroom this is a no-op.
      const wait = rateLimitWaitSeconds(res.headers);
      if (wait > 0) await sleep(wait * 1000);
      return json;
    } catch (e) {
      console.error(`sitemap-posts feed page ${page} attempt ${attempt + 1}:`, e);
      await sleep(1000 * 2 ** attempt);
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
