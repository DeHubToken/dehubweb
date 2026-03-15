/**
 * Sync Category Log
 * =================
 * Fetches all posts from the DeHub feed API, extracts categories with their
 * creation dates, and upserts them into category_post_log for accurate
 * time-windowed trending topic calculations (1D/1W/1M/1Y).
 *
 * Called on a schedule (every 30 min) or manually.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEHUB_API = 'https://api.dehub.io';
const PAGE_SIZE = 100;
const MAX_PAGES = 50; // Safety cap: 5000 posts max per sync
const EXCLUDED = new Set(['general', '', 'other']);

interface FeedItem {
  tokenId: number;
  category?: string | string[];
  createdAt: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Fetch posts from DeHub feed API, paginating through all content
    const allRows: Array<{ token_id: number; name: string; posted_at: string }> = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= MAX_PAGES) {
      const url = `${DEHUB_API}/api/feed?page=${page}&limit=${PAGE_SIZE}&sortBy=createdAt&sortOrder=desc&status=all`;
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      });

      if (!res.ok) {
        console.error(`Feed API error on page ${page}: ${res.status}`);
        break;
      }

      const json = await res.json();
      const items: FeedItem[] = json.result || [];

      if (items.length === 0) break;

      for (const item of items) {
        if (!item.tokenId || !item.createdAt) continue;

        const cats = Array.isArray(item.category)
          ? item.category
          : item.category
            ? [item.category]
            : [];

        for (const raw of cats) {
          const name = (raw || '').trim().toLowerCase();
          if (!name || EXCLUDED.has(name)) continue;

          allRows.push({
            token_id: item.tokenId,
            name,
            posted_at: item.createdAt,
          });
        }
      }

      hasMore = json.pagination?.hasMore ?? items.length >= PAGE_SIZE;
      page++;
    }

    console.log(`[sync-category-log] Fetched ${page - 1} pages, ${allRows.length} category entries`);

    if (allRows.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, synced: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. Upsert into category_post_log in batches
    // Using the Supabase REST API directly for bulk upsert
    const BATCH_SIZE = 500;
    let upserted = 0;

    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
      const batch = allRows.slice(i, i + BATCH_SIZE);

      const upsertRes = await fetch(
        `${supabaseUrl}/rest/v1/category_post_log`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
            'Prefer': 'resolution=ignore-duplicates,return=headers-only',
          },
          body: JSON.stringify(batch),
        },
      );

      if (!upsertRes.ok) {
        const errText = await upsertRes.text();
        console.error(`[sync-category-log] Upsert batch error: ${upsertRes.status} ${errText}`);
        // Continue with next batch
      } else {
        upserted += batch.length;
      }
    }

    console.log(`[sync-category-log] Upserted ${upserted} rows`);

    return new Response(
      JSON.stringify({ ok: true, pages: page - 1, synced: upserted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[sync-category-log] Error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
