-- Signup attribution
-- ==================
-- Where each account came from. The browser keeps its first touch (UTM tags,
-- external referrer host, landing page) for 90 days, first touch wins, like
-- the affiliate cookie; src/lib/first-touch.ts writes it here once, the first
-- time that browser signs in. One row per wallet.
--
-- is_new_account is the backend's isNewAccount for that sign-in, so rows for
-- accounts that existed before this table can be told apart from signups.

create table if not exists public.signup_attribution (
  wallet_address text primary key check (wallet_address ~ '^0x[a-f0-9]{40}$'),
  utm_source text check (length(utm_source) <= 100),
  utm_medium text check (length(utm_medium) <= 100),
  utm_campaign text check (length(utm_campaign) <= 100),
  utm_content text check (length(utm_content) <= 100),
  utm_term text check (length(utm_term) <= 100),
  referrer_host text check (length(referrer_host) <= 120),
  landing_path text check (length(landing_path) <= 200 and landing_path like '/%'),
  ref_code text check (ref_code ~ '^[A-Za-z0-9_-]{3,40}$'),
  first_seen_at timestamptz,
  is_new_account boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists signup_attribution_created_idx
  on public.signup_attribution (created_at desc);

-- Clients may insert their own row and nothing else. There is no select,
-- update or delete policy: reads are service-role only, the same as
-- page_view_events, so the admin panel goes through an edge function that
-- verifies a SUPER_ADMIN token before it uses the key.
alter table public.signup_attribution enable row level security;
revoke all on public.signup_attribution from public, anon, authenticated;
grant insert on public.signup_attribution to anon, authenticated;
grant all on public.signup_attribution to service_role;

drop policy if exists "Wallets insert their own attribution" on public.signup_attribution;
create policy "Wallets insert their own attribution" on public.signup_attribution
  for insert to anon, authenticated
  with check (wallet_address = public.affiliate_wallet() and created_at > now() - interval '1 minute');

-- ── UTM tags on page views ──
-- The first view of each page load carries the campaign tags it arrived
-- with, so traffic by campaign can be read next to traffic by route.
alter table public.page_view_events
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;

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
      left(e->>'referrerHost', 120)       as ext_referrer_host,
      left(e->>'utmSource', 100)          as utm_source,
      left(e->>'utmMedium', 100)          as utm_medium,
      left(e->>'utmCampaign', 100)        as utm_campaign
    from jsonb_array_elements(p_events) with ordinality as t(e, ord)
    where ord <= 50
      and e->>'path' is not null
      -- Route shapes only. Anything with a query string, a fragment or an
      -- absolute URL in it is a client that skipped normalisation.
      and e->>'path' ~ '^/[A-Za-z0-9/:_.-]*$'
  )
  insert into public.page_view_events (path, prev_path, ext_referrer_host, address, viewer_id, utm_source, utm_medium, utm_campaign)
  select
    path,
    case when prev_path ~ '^/[A-Za-z0-9/:_.-]*$' then prev_path end,
    ext_referrer_host,
    case when p_address ~ '^0x[a-fA-F0-9]{40}$' then lower(p_address) end,
    p_viewer_id,
    utm_source,
    utm_medium,
    utm_campaign
  from incoming;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

revoke all on function public.record_page_views(jsonb, text, text) from public;
grant execute on function public.record_page_views(jsonb, text, text) to anon, authenticated;
