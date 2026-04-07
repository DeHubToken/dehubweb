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
          const cleaned = (raw || '').trim().toLowerCase();
          if (!cleaned) continue;

          // Split multi-word entries (e.g. "#home #web3 $dhb") into individual words
          // and strip # / $ prefixes
          const words = cleaned.split(/\s+/).map(w => w.replace(/^[#$]+/, '').trim()).filter(Boolean);

          for (const name of words) {
            if (!name || EXCLUDED.has(name)) continue;
            allRows.push({
              token_id: item.tokenId,
              name,
              posted_at: item.createdAt,
            });
          }
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

    // 2. Fetch existing token_ids to avoid duplicates
    const existingTokenIds = new Set<string>();
    const uniqueTokenIds = [...new Set(allRows.map(r => r.token_id))];
    
    // Fetch in batches of 200
    for (let i = 0; i < uniqueTokenIds.length; i += 200) {
      const batch = uniqueTokenIds.slice(i, i + 200);
      const checkRes = await fetch(
        `${supabaseUrl}/rest/v1/category_post_log?select=token_id,name&token_id=in.(${batch.join(',')})`,
        {
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
          },
        },
      );
      if (checkRes.ok) {
        const existing = await checkRes.json();
        for (const row of existing) {
          existingTokenIds.add(`${row.token_id}:${row.name}`);
        }
      } else {
        await checkRes.text();
      }
    }

    // Filter to only new rows
    const newRows = allRows.filter(r => !existingTokenIds.has(`${r.token_id}:${r.name}`));
    console.log(`[sync-category-log] ${newRows.length} new entries to insert (${allRows.length - newRows.length} already exist)`);

    if (newRows.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, pages: page - 1, synced: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 3. Insert via RPC with ON CONFLICT DO NOTHING
    const BATCH_SIZE = 500;
    let upserted = 0;

    for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
      const batch = newRows.slice(i, i + BATCH_SIZE);

      const rpcRes = await fetch(
        `${supabaseUrl}/rest/v1/rpc/bulk_insert_category_log`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
          },
          body: JSON.stringify({ entries: batch }),
        },
      );

      if (!rpcRes.ok) {
        const errText = await rpcRes.text();
        console.error(`[sync-category-log] RPC batch error: ${rpcRes.status} ${errText}`);
      } else {
        const count = await rpcRes.json();
        upserted += (typeof count === 'number' ? count : 0);
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
