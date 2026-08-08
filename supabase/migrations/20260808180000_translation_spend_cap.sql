-- Daily ceiling on paid translations
-- ==================================
-- The paid tiers of translate-text used to sit behind a wallet check. That is
-- gone: translating a post is a public reading feature, and the check made
-- signed-out readers the only people who could not have one. It also protected
-- nothing — requireDeHubAuth resolves its token against an unguarded public
-- endpoint, so any caller can present any wallet.
--
-- A spend ceiling is the honest version of what that check was reaching for.
-- It does not care who is calling, which is the point: it bounds the blast
-- radius rather than pretending to establish identity. Abuse can waste a day's
-- budget and cannot empty an account, and tomorrow starts clean.
--
-- The counter is per UTC day and global. It is deliberately NOT per user: the
-- endpoint has no trustworthy notion of a user, and inventing one here would
-- repeat the mistake this replaces.
--
-- Sizing note for whoever tunes the cap: only a (text, language) pair that
-- misses both cache layers ever reaches this counter, so it tracks roughly
-- "new posts × languages actually read", not views. If it trips under ordinary
-- traffic, the caches are not doing their job and that is the thing to fix.

create table if not exists public.translation_spend_daily (
  day        date    primary key,
  paid_calls integer not null default 0
);

comment on table public.translation_spend_daily is
  'Global per-UTC-day counter of paid translate-text calls. Written only by claim_paid_translation.';

alter table public.translation_spend_daily enable row level security;

-- Increment and test in one statement so concurrent isolates cannot both read
-- the same count and both decide they are under the cap.
--
-- The counter keeps climbing after the cap is passed rather than clamping. That
-- is deliberate: the overshoot is the record of how much demand got refused,
-- which is what tells you whether the cap is too low or you are being hammered.
create or replace function public.claim_paid_translation(p_cap integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day   date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  insert into public.translation_spend_daily as t (day, paid_calls)
  values (v_day, 1)
  on conflict (day) do update
    set paid_calls = t.paid_calls + 1
  returning t.paid_calls into v_count;

  return v_count <= p_cap;
end;
$$;

revoke all on function public.claim_paid_translation(integer) from public, anon, authenticated;
