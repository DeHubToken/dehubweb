-- Dubbing tabs: let a paid stage be listened to again, and make a replayed
-- transfer collide instead of closing a second tab.
--
-- NOT YET APPLIED. Migrations in this repo do not auto-apply — run this in the
-- SQL editor, then note the date here as 20260821000000_stage_dub_usage.sql
-- does. The dub-session function keeps working against the old shape until it
-- is run; nothing here is required by code already on main.
--
-- Three problems in 20260821000000, all of them in the constraints rather than
-- the logic:
--
-- 1. `unique (space_id, wallet_address)` is one row per wallet per stage for
--    all time, but `stage_dub_tick` only updates `where settled_at is null`.
--    So the moment a listener pays, the next tick on that stage matches no row
--    and raises DUB_ALREADY_SETTLED — the client stops dubbing and cannot
--    start again. The comment in that function says the opposite ("Listening
--    again after paying opens a new tab"), which is what it was written to do
--    and what the constraint prevented. A listener who pays at the three-hour
--    settle point buys one token and then silence.
--
-- 2. `settled_ref` carries no unique constraint, though the settle path
--    documents one: "settled_ref is unique, so the same transfer cannot close
--    a second tab". It is a plain text column, so one transfer closes as many
--    tabs as it is presented against.
--
-- 3. `start` mints an entitlement without opening a tab, so a client that
--    re-starts just inside the token's life never ticks and never accrues.
--    That one is fixed in the function, not here, but it needs the column
--    below to see when a session was last opened.

-- ── 1. One OPEN tab per wallet per stage, any number of settled ones ────────
alter table public.stage_dub_usage
  drop constraint if exists stage_dub_usage_space_id_wallet_address_key;

create unique index if not exists stage_dub_usage_open_tab_idx
  on public.stage_dub_usage (space_id, wallet_address)
  where settled_at is null;

-- ── 2. A transfer closes exactly one tab ───────────────────────────────────
-- Partial, because 'zero' is written for every tab that ended up owing nothing
-- and is deliberately not a transfer.
create unique index if not exists stage_dub_usage_settled_ref_idx
  on public.stage_dub_usage (settled_ref)
  where settled_ref is not null and settled_ref <> 'zero';

-- ── 3. When the current tab was last opened ────────────────────────────────
alter table public.stage_dub_usage
  add column if not exists last_started_at timestamptz;

-- ── The tick, against the open tab ─────────────────────────────────────────
-- Same accounting as before. What changes is that "the row" is now "the open
-- row", so a settled tab is left alone and a new one opens beside it rather
-- than the insert colliding with a closed row.
--
-- `p_start` finally does something. It existed in the original signature and
-- was never read.
--
-- The FIRST start opens the tab at zero: a listener who changes their mind in
-- the first few seconds owes nothing, which is the behaviour the function's
-- comment promised. A start against a tab that is already open costs a minute,
-- because a start hands out an entitlement block and the previous one was
-- already issued. Without that, re-starting just inside the token's life dubs
-- indefinitely and never ticks — start was the one path that granted airtime
-- without accruing any.
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

  -- An open tab: both a tick and a re-start cost one block.
  update public.stage_dub_usage
     set minutes = minutes + 1,
         language = p_language,
         last_started_at = case when p_start then now() else last_started_at end,
         updated_at = now()
   where space_id = p_space_id
     and wallet_address = v_wallet
     and settled_at is null
  returning minutes into v_minutes;

  if v_minutes is null then
    -- No open tab. A first start opens one at zero and owes nothing yet; a
    -- tick that arrives without one opens it at its first minute, which is
    -- what the old function did.
    insert into public.stage_dub_usage
      (space_id, wallet_address, language, minutes, price_dhb_per_min, last_started_at)
    values
      (p_space_id, v_wallet, p_language, case when p_start then 0 else 1 end, p_price_per_min, now())
    returning minutes into v_minutes;
  end if;

  return v_minutes;
end;
$$;

-- `stage_dub_unsettled` is unchanged and still filters `minutes > 0`, so a tab
-- opened by `start` and abandoned before its first minute blocks nothing.
