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
const MAX_PAGES = 500; // Safety cap: 50,000 posts max per sync
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
    const activeTokenIds = new Set<number>();
    let page = 1;
    let hasMore = true;
    let fetchedAll = false;

    while (hasMore && page <= MAX_PAGES) {
      const url = `${DEHUB_API}/api/feed?page=${page}&limit=${PAGE_SIZE}&sortBy=createdAt&sortOrder=desc&status=all`;
      let res: Response | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        res = await fetch(url, {
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        });
        if (res.status !== 429) break;
        await res.text();
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
      if (!res || !res.ok) {
        console.error(`Feed API error on page ${page}: ${res?.status}`);
        break;
      }

      const json = await res.json();
      const items: FeedItem[] = json.result || [];

      if (items.length === 0) { fetchedAll = true; break; }

      for (const item of items) {
        if (!item.tokenId || !item.createdAt) continue;
        activeTokenIds.add(item.tokenId);

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
      if (!hasMore) fetchedAll = true;
    }
    if (page > MAX_PAGES) {
      console.warn(`[sync-category-log] Hit MAX_PAGES cap; skipping purge`);
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

    // 4. Purge log rows whose token_id no longer exists in the feed (deleted posts).
    let purged = 0;
    if (fetchedAll && activeTokenIds.size > 0) {
      // Fetch all token_ids currently in log
      const loggedTokenIds = new Set<number>();
      let offset = 0;
      const LOG_PAGE = 1000;
      while (true) {
        const r = await fetch(
          `${supabaseUrl}/rest/v1/category_post_log?select=token_id&limit=${LOG_PAGE}&offset=${offset}`,
          { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
        );
        if (!r.ok) { await r.text(); break; }
        const rows: Array<{ token_id: number }> = await r.json();
        if (!rows.length) break;
        for (const row of rows) loggedTokenIds.add(row.token_id);
        if (rows.length < LOG_PAGE) break;
        offset += LOG_PAGE;
      }

      const toDelete = [...loggedTokenIds].filter(id => !activeTokenIds.has(id));
      console.log(`[sync-category-log] Purging ${toDelete.length} stale token_ids`);
      for (let i = 0; i < toDelete.length; i += 200) {
        const batch = toDelete.slice(i, i + 200);
        const delRes = await fetch(
          `${supabaseUrl}/rest/v1/category_post_log?token_id=in.(${batch.join(',')})`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, Prefer: 'return=minimal' } },
        );
        if (delRes.ok) purged += batch.length;
        else console.error(`[sync-category-log] Purge batch failed: ${delRes.status} ${await delRes.text()}`);
      }
    }

    // 5. Recompute the trending_categories aggregate table from the now-clean log.
    if (fetchedAll) {
      const aggCounts = new Map<string, number>();
      let offset = 0;
      const AGG_PAGE = 1000;
      while (true) {
        const r = await fetch(
          `${supabaseUrl}/rest/v1/category_post_log?select=name&limit=${AGG_PAGE}&offset=${offset}`,
          { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
        );
        if (!r.ok) { await r.text(); break; }
        const rows: Array<{ name: string }> = await r.json();
        if (!rows.length) break;
        for (const row of rows) {
          const n = (row.name || '').trim().toLowerCase();
          if (!n || EXCLUDED.has(n)) continue;
          aggCounts.set(n, (aggCounts.get(n) || 0) + 1);
        }
        if (rows.length < AGG_PAGE) break;
        offset += AGG_PAGE;
      }
      // Wipe and rewrite aggregate
      await fetch(`${supabaseUrl}/rest/v1/trending_categories?name=not.is.null`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, Prefer: 'return=minimal' },
      });
      const aggRows = [...aggCounts.entries()].map(([name, post_count]) => ({
        name, post_count, updated_at: new Date().toISOString(),
      }));
      for (let i = 0; i < aggRows.length; i += 500) {
        const batch = aggRows.slice(i, i + 500);
        await fetch(`${supabaseUrl}/rest/v1/trending_categories`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            Prefer: 'return=minimal,resolution=merge-duplicates',
          },
          body: JSON.stringify(batch),
        });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, pages: page - 1, synced: upserted, purged, fetchedAll }),
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
