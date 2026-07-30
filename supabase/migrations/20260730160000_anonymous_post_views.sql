-- Anonymous post views
-- ====================
-- The DeHub API (api.dehub.io) requires a valid JWT on /api/record-view and
-- /api/view/batch, so a signed-out visitor scrolling the feed records nothing.
-- This is the anonymous half of the view count: views from visitors with no
-- DeHub session. Displayed counts are the DeHub count plus the total here, and
-- the two never double-count the same person — a signed-in viewer only hits the
-- DeHub API, a signed-out one only hits this.
--
-- Two tables on purpose:
--   * anonymous_post_view_totals — permanent, monotonic count per post. This is
--     what gets displayed, so it is never pruned.
--   * anonymous_post_views — the dedup ledger, one row per viewer/post/UTC day.
--     Prunable, because dedup only looks at the current day.
--
-- viewer_hash is a salted SHA-256 of the client's device id plus its IP address,
-- computed in the anon-views edge function — the raw IP is never stored.

create table if not exists public.anonymous_post_view_totals (
  token_id text primary key,
  view_count bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.anonymous_post_views (
  id bigint generated always as identity primary key,
  token_id text not null,
  viewer_hash text not null,
  view_date date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now()
);

-- The dedup constraint: one view per viewer per post per UTC day.
create unique index if not exists anonymous_post_views_dedup_idx
  on public.anonymous_post_views (token_id, viewer_hash, view_date);

-- Serves retention pruning.
create index if not exists anonymous_post_views_view_date_idx
  on public.anonymous_post_views (view_date);

-- RLS on with no policies on either table: writes go only through the
-- security-definer function below (or the service role). Anonymous clients can
-- read aggregate totals via get_anonymous_view_counts but never touch rows.
alter table public.anonymous_post_view_totals enable row level security;
alter table public.anonymous_post_views enable row level security;

-- ── Write path ──
-- Records a batch of views for one viewer. Returns the number that were new
-- (i.e. survived dedup); the rest are same-viewer/same-day repeats and are
-- silently dropped. Atomic per token: the ledger insert is what decides whether
-- the total moves, so a concurrent duplicate can never double-increment.
create or replace function public.record_anonymous_views(
  p_token_ids text[],
  p_viewer_hash text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_new_ids text[];
begin
  if p_viewer_hash is null or p_viewer_hash = '' then
    raise exception 'viewer_hash is required';
  end if;

  -- Insert the ledger rows, keeping only the token ids that were genuinely new.
  with candidates as (
    select distinct unnest(p_token_ids) as token_id
  ),
  inserted as (
    insert into public.anonymous_post_views (token_id, viewer_hash, view_date)
    select c.token_id, p_viewer_hash, v_today
    from candidates c
    where c.token_id is not null and c.token_id <> ''
    on conflict (token_id, viewer_hash, view_date) do nothing
    returning token_id
  )
  select coalesce(array_agg(token_id), '{}') into v_new_ids from inserted;

  if array_length(v_new_ids, 1) is null then
    return 0;
  end if;

  insert into public.anonymous_post_view_totals as t (token_id, view_count, updated_at)
  select id, 1, now() from unnest(v_new_ids) as id
  on conflict (token_id) do update
    set view_count = t.view_count + 1,
        updated_at = now();

  return array_length(v_new_ids, 1);
end;
$$;

-- ── Read path ──
-- Returns only tokens that have anonymous views, so callers treat a missing key
-- as zero.
create or replace function public.get_anonymous_view_counts(p_token_ids text[])
returns table (token_id text, view_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select t.token_id, t.view_count
  from public.anonymous_post_view_totals t
  where t.token_id = any(p_token_ids)
    and t.view_count > 0;
$$;

grant execute on function public.get_anonymous_view_counts(text[]) to anon, authenticated;
-- record_anonymous_views is deliberately NOT granted to anon/authenticated: it
-- is called by the anon-views edge function with the service role, which is
-- where the viewer_hash is derived from the request IP. Granting it to clients
-- would let a caller supply any hash it liked.

-- ── Retention ──
-- Only the dedup ledger is pruned; totals are permanent. 7 days is already well
-- past what per-day dedup consults, but keeps a little history for debugging.
create or replace function public.cleanup_old_anonymous_post_views()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.anonymous_post_views
  where view_date < ((now() at time zone 'utc')::date - interval '7 days');
$$;
