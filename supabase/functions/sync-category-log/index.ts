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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer',
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
      else await new Promise(r => setTimeout(r, 150));
    }
    if (page > MAX_PAGES) {
      console.warn(`[sync-category-log] Hit MAX_PAGES cap; skipping purge`);
    }

    console.log(`[sync-category-log] Fetched ${page - 1} pages, ${allRows.length} category entries`);

    if (allRows.length === 0 && !fetchedAll) {
      return new Response(
        JSON.stringify({ ok: true, synced: 0, fetchedAll }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let inserted = 0;
    let purged = 0;

    if (fetchedAll) {
      // DELTA SYNC — work out what actually changed, then write only that.
      //
      // This used to wipe the whole log and re-insert every row on every run.
      // For a 12,500-row log that is ~25,000 write operations a day to record
      // a handful of new posts, and those writes are not free: every one lands
      // in the WAL that Supabase Realtime's decoder walks on each poll, which
      // made this job the largest single source of database churn on the
      // project. The feed is still the source of truth and the end state is
      // identical — deleted posts and edited categories both still propagate.
      // The only difference is that we diff before writing.
      const existing = new Map<string, string>();
      const READ_PAGE = 1000;
      let readOk = true;

      for (let offset = 0; ; offset += READ_PAGE) {
        const snapRes = await fetch(
          `${supabaseUrl}/rest/v1/category_post_log?select=id,token_id,name&token_id=not.is.null&order=id.asc&offset=${offset}&limit=${READ_PAGE}`,
          { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
        );
        if (!snapRes.ok) {
          console.error(`[sync-category-log] Snapshot read failed: ${snapRes.status} ${await snapRes.text()}`);
          readOk = false;
          break;
        }
        const rows: Array<{ id: string; token_id: number; name: string }> = await snapRes.json();
        for (const r of rows) existing.set(`${r.token_id}|${r.name}`, r.id);
        if (rows.length < READ_PAGE) break;
      }

      const wanted = new Map<string, { token_id: number; name: string; posted_at: string }>();
      for (const row of allRows) wanted.set(`${row.token_id}|${row.name}`, row);

      // A failed snapshot read makes the "no longer present" set untrustworthy,
      // so skip the purge and insert only — the same defence the partial-fetch
      // branch below uses. Never delete on incomplete information.
      const toInsert = readOk
        ? [...wanted].filter(([key]) => !existing.has(key)).map(([, row]) => row)
        : [...wanted.values()];
      const staleIds = readOk
        ? [...existing].filter(([key]) => !wanted.has(key)).map(([, id]) => id)
        : [];

      const DELETE_BATCH = 200;
      for (let i = 0; i < staleIds.length; i += DELETE_BATCH) {
        const batch = staleIds.slice(i, i + DELETE_BATCH);
        const delRes = await fetch(
          `${supabaseUrl}/rest/v1/category_post_log?id=in.(${batch.join(',')})`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, Prefer: 'return=minimal' } },
        );
        if (!delRes.ok) {
          console.error(`[sync-category-log] Purge batch failed: ${delRes.status} ${await delRes.text()}`);
        } else {
          purged += batch.length;
        }
      }

      const BATCH_SIZE = 500;
      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        const rpcRes = await fetch(
          `${supabaseUrl}/rest/v1/rpc/bulk_insert_category_log`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
            },
            body: JSON.stringify({ entries: batch }),
          },
        );
        if (!rpcRes.ok) {
          console.error(`[sync-category-log] RPC batch error: ${rpcRes.status} ${await rpcRes.text()}`);
        } else {
          const count = await rpcRes.json();
          inserted += (typeof count === 'number' ? count : 0);
        }
      }

      // Rebuild trending_categories aggregate from allRows directly.
      const aggCounts = new Map<string, number>();
      for (const row of allRows) {
        const n = (row.name || '').trim().toLowerCase();
        if (!n || EXCLUDED.has(n)) continue;
        aggCounts.set(n, (aggCounts.get(n) || 0) + 1);
      }
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
    } else {
      // Partial fetch (e.g. rate-limited) — fall back to insert-only to avoid wiping data.
      const existingTokenIds = new Set<string>();
      const uniqueTokenIds = [...new Set(allRows.map(r => r.token_id))];
      for (let i = 0; i < uniqueTokenIds.length; i += 200) {
        const batch = uniqueTokenIds.slice(i, i + 200);
        const checkRes = await fetch(
          `${supabaseUrl}/rest/v1/category_post_log?select=token_id,name&token_id=in.(${batch.join(',')})`,
          { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
        );
        if (checkRes.ok) {
          const existing = await checkRes.json();
          for (const row of existing) existingTokenIds.add(`${row.token_id}:${row.name}`);
        } else await checkRes.text();
      }
      const newRows = allRows.filter(r => !existingTokenIds.has(`${r.token_id}:${r.name}`));
      const BATCH_SIZE = 500;
      for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
        const batch = newRows.slice(i, i + BATCH_SIZE);
        const rpcRes = await fetch(
          `${supabaseUrl}/rest/v1/rpc/bulk_insert_category_log`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
            },
            body: JSON.stringify({ entries: batch }),
          },
        );
        if (rpcRes.ok) {
          const count = await rpcRes.json();
          inserted += (typeof count === 'number' ? count : 0);
        }
      }
    }

    console.log(`[sync-category-log] fetchedAll=${fetchedAll} inserted=${inserted} rows=${allRows.length}`);

    return new Response(
      JSON.stringify({ ok: true, pages: page - 1, inserted, rows: allRows.length, fetchedAll, purged }),
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
