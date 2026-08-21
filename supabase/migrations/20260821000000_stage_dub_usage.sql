-- Live dubbing runs a tab: minutes accrue during the stage and are charged
-- once, on confirmation, at the end. The count has to live on the server —
-- the client is the party that benefits from under-reporting it.
--
-- Applied to production 2026-08-21. Repo copy for the record; pushed
-- migrations do not auto-apply here.

create table if not exists public.stage_dub_usage (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.audio_spaces(id) on delete cascade,
  wallet_address text not null,
  language text not null,
  minutes integer not null default 0,
  -- Recorded when the tab opens so a price change mid-stage cannot reprice
  -- minutes already listened to.
  price_dhb_per_min integer not null,
  settled_at timestamptz,
  settled_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, wallet_address)
);

-- No policies, deliberately. Only the service role touches this, through the
-- dub-session function; a listener reads their own tab from that function's
-- response rather than from the table.
alter table public.stage_dub_usage enable row level security;

create index if not exists stage_dub_usage_unsettled_idx
  on public.stage_dub_usage (wallet_address)
  where settled_at is null;

-- One minute of listening.
--
-- Advisory-locked per (stage, wallet): two ticks landing together would
-- otherwise both read the same count and both write count + 1, billing one
-- minute twice.
create or replace function public.stage_dub_tick(
  p_space_id uuid,
  p_wallet text,
  p_language text,
  p_price_per_min integer,
  p_start boolean default false
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet text := lower(p_wallet);
  v_minutes integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_space_id::text || ':' || v_wallet));

  insert into public.stage_dub_usage (space_id, wallet_address, language, minutes, price_dhb_per_min)
  values (p_space_id, v_wallet, p_language, 1, p_price_per_min)
  on conflict (space_id, wallet_address) do update
    set minutes = public.stage_dub_usage.minutes + 1,
        language = excluded.language,
        updated_at = now()
    -- A settled row is closed. Listening again after paying opens a new tab
    -- rather than silently reopening one already settled.
    where public.stage_dub_usage.settled_at is null
  returning minutes into v_minutes;

  if v_minutes is null then
    raise exception 'DUB_ALREADY_SETTLED';
  end if;

  return v_minutes;
end;
$$;

-- Open tabs for a wallet. Used to refuse a new session while an old one is
-- unpaid, which is the only collection lever a post-paid model has.
create or replace function public.stage_dub_unsettled(p_wallet text)
returns table (space_id uuid, minutes integer, price_dhb_per_min integer, owed_dhb integer)
language sql
stable
security definer
set search_path = public
as $$
  select u.space_id, u.minutes, u.price_dhb_per_min, (u.minutes * u.price_dhb_per_min)::integer
  from public.stage_dub_usage u
  where u.wallet_address = lower(p_wallet) and u.settled_at is null and u.minutes > 0;
$$;
