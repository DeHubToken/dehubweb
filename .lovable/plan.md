# Editor Cloud Storage with Badge-Tier Quotas

Right now the editor's Media panel only saves to the browser's local IndexedDB — clear cache and everything's gone. This plan moves imported assets to Lovable Cloud storage, gates capacity by staking badge tier, and auto-purges assets that sit unused for 12 months (unless the resulting exported video was posted).

## Storage quotas per badge tier

Using the existing 13-tier staking badge system (from `src/lib/staking-badges.ts`). Everyone gets a fair baseline; each tier roughly doubles.

| Tier | Min DHB | Quota |
|---|---|---|
| No badge | 0 | **500 MB** |
| Crab | 10K | 1 GB |
| Lobster | 25K | 2 GB |
| Piranha | 50K | 4 GB |
| Tortoise | 100K | 8 GB |
| Cobra | 250K | 15 GB |
| Octopus | 500K | 25 GB |
| Crocodite | 1M | 50 GB |
| Dolphin | 2M | 100 GB |
| Tiger Shark | 3M | 200 GB |
| Killer Whale | 5M | 400 GB |
| Great White Shark | 10M | 750 GB |
| Blue Whale | 25M | 1.5 TB |
| Meglodon | 50M | 5 TB |

## What gets kept forever vs auto-deleted

- Every **imported asset** (video / audio / image) is uploaded to cloud storage the moment it enters the Media panel.
- `last_used_at` bumps every time the asset is dragged onto the timeline or used in an export.
- If an **exported MP4 is posted to DeHub**, that final MP4 is flagged `preserved = true` and never expires. Source clips still follow the normal 12-month rule (per your answer).
- A daily cron scans `editor_assets` and deletes rows (+ bucket objects) where `last_used_at < now() - 12 months` AND `preserved = false`.

## UI changes (Media panel)

- Quota bar at the top: `2.4 GB / 8 GB · Tortoise tier` with a subtle progress fill.
- Import blocks with a clear toast if it would exceed quota, showing next-tier upsell.
- Each asset row shows a tiny "expires in X months" hint once it crosses 9 months unused; green pill "Preserved" if it's in a posted video.

## Technical section

**New bucket:** `editor-assets` (private). RLS on `storage.objects` scoped to `x-wallet-address` header (matches existing project pattern in the RLS identity memory).

**New table:** `public.editor_assets`
- `id uuid pk`, `wallet_address text` (lowercased, indexed)
- `name`, `kind` (`video|audio|image|export`), `mime_type`, `size_bytes bigint`
- `storage_path text` (path in `editor-assets` bucket), `thumbnail_path text`
- `duration`, `width`, `height`
- `created_at`, `last_used_at` (default `now()`), `preserved boolean default false`
- `posted_post_id text nullable` (set when linked to a DeHub post)
- RLS: select/insert/update/delete only where `lower(wallet_address) = public.get_request_wallet_address()`
- GRANT to authenticated + anon (project uses anon + header auth), plus service_role

**New view / RPC:** `public.get_editor_storage_usage(_wallet text)` returning `{ used_bytes, asset_count }` — cheap `SUM(size_bytes)`.

**Client:**
- `src/lib/editor/cloudMedia.ts` — upload/list/delete/touch helpers against `editor-assets` bucket via supabase client.
- `src/lib/editor/quota.ts` — pure function `getQuotaBytes(badgeName)` returning the table above.
- `src/hooks/use-editor-quota.ts` — pulls used bytes + user's `lnBalance` → tier + quota + remaining.
- `MediaPanel.tsx` — swap IndexedDB reads for cloud reads, wire quota bar, block over-quota imports. Keep IndexedDB as a fast per-session cache of thumbnails/blobs so scrubbing stays instant, but treat cloud as source of truth.
- `importFiles.ts` — after local processing, upload the blob + thumbnail, insert `editor_assets` row.
- `exporter.ts` — on successful export + PostToDeHub post, mark source asset rows `preserved = true` and also store the final MP4 with `kind='export'`, `preserved=true`.
- Bump `last_used_at` when a clip is added to timeline.

**Cron cleanup:** enable `pg_cron` + `pg_net`, register a daily job that calls a new edge function `editor-assets-cleanup`. The function lists expired rows, deletes their storage objects (source + thumbnail), then deletes the rows. Batched to 500/run.

**Edge function:** `editor-assets-cleanup` (verify_jwt = false, service-role client, CORS included).

**Files touched:**
- new migration (table, RLS, grants, RPC, cron)
- new bucket `editor-assets` via `supabase--storage_create_bucket`
- new: `src/lib/editor/cloudMedia.ts`, `src/lib/editor/quota.ts`, `src/hooks/use-editor-quota.ts`, `supabase/functions/editor-assets-cleanup/index.ts`
- edited: `src/components/editor/MediaPanel.tsx`, `src/lib/editor/importFiles.ts`, `src/lib/editor/exporter.ts`, `src/components/editor/PostToDeHub.tsx`

## Out of scope for this pass

- Migrating any assets users already have sitting in their local IndexedDB into the cloud (they'll re-import; can add a one-shot migration later if needed).
- Manual "extend expiry" button on individual assets.
- Server-side transcoding / compression on upload.
