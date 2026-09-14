-- Page view events
-- ================
-- Where visitors actually go in the app. Until now nothing recorded a
-- navigation anywhere: client_error_logs only carries explicit error/warn
-- calls, and there is no third-party analytics beacon on the page, so a
-- question as ordinary as "how many people opened the buy page this week"
-- had no answer at all.
--
-- One row per in-app navigation, written in batches by
-- src/lib/page-view-tracker.ts.
--
-- What is deliberately NOT stored: no IP, no user agent, no query strings, no
-- free-text. `path` is normalised client-side to its route shape
-- (/app/post/123 -> /app/post/:id) so ids of posts, wallets and usernames
-- never land here, and the external referrer is reduced to its host.
--
-- viewer_id is the same per-browser random id anonymous post views use
-- (src/lib/anon-view-id.ts). It identifies a browser, not a person, and is
-- here so "visits" can be told apart from "visitors".

create table if not exists public.page_view_events (
  id bigint generated always as identity primary key,
  path text not null,
  prev_path text,
  ext_referrer_host text,
  address text,
  viewer_id text not null,
  created_at timestamptz not null default now()
);

-- The read this table exists for: counts for one route over a window.
create index if not exists page_view_events_path_created_idx
  on public.page_view_events (path, created_at desc);

-- Serves retention pruning and whole-app rollups.
create index if not exists page_view_events_created_idx
  on public.page_view_events (created_at desc);

-- RLS on with no policies: clients can neither read nor write rows directly.
-- Writes go through record_page_views below; reads are service-role only.
alter table public.page_view_events enable row level security;

-- ── Write path ──
-- Takes a batch as jsonb so one round trip covers a burst of navigations.
-- Returns how many rows were written.
--
-- Everything is length-capped and pattern-checked here rather than trusted
-- from the client: the RPC is callable by anon (it has to be — most of the
-- interesting traffic is signed out), so it is a public endpoint and the
-- table's shape is whatever this function lets through.
create or replace function public.record_page_views(
  p_events jsonb,
  p_viewer_id text,
  p_address text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_written integer;
begin
  if p_viewer_id is null or length(p_viewer_id) not between 8 and 64 then
    return 0;
  end if;

  if jsonb_typeof(p_events) <> 'array' then
    return 0;
  end if;

  with incoming as (
    select
      left(e->>'path', 200)               as path,
      left(e->>'prevPath', 200)           as prev_path,
      left(e->>'referrerHost', 120)       as ext_referrer_host
    from jsonb_array_elements(p_events) with ordinality as t(e, ord)
    where ord <= 50
      and e->>'path' is not null
      -- Route shapes only. Anything with a query string, a fragment or an
      -- absolute URL in it is a client that skipped normalisation.
      and e->>'path' ~ '^/[A-Za-z0-9/:_.-]*$'
  )
  insert into public.page_view_events (path, prev_path, ext_referrer_host, address, viewer_id)
  select
    path,
    case when prev_path ~ '^/[A-Za-z0-9/:_.-]*$' then prev_path end,
    ext_referrer_host,
    case when p_address ~ '^0x[a-fA-F0-9]{40}$' then lower(p_address) end,
    p_viewer_id
  from incoming;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

revoke all on function public.record_page_views(jsonb, text, text) from public;
grant execute on function public.record_page_views(jsonb, text, text) to anon, authenticated;
