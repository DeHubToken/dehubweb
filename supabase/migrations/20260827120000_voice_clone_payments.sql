-- A host pays once, in DHB, to have their voice cloned for stage dubbing.
--
-- This table exists for one reason: the payment lands on chain BEFORE the
-- clone is attempted, and the clone can fail. Without a record of what has
-- been paid for and whether it was ever delivered, a failed clone would mean
-- either paying twice to retry or handing out a free one to anyone who claims
-- a failure. So the transfer is recorded on arrival, and only marked consumed
-- once a voice actually exists — a retry re-presents the same hash and costs
-- nothing.
--
-- `tx_hash` is unique, which is also the replay guard: one transfer buys one
-- voice, and a hash already spent collides instead of buying a second.

create table if not exists public.voice_clone_payments (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  tx_hash text not null unique,
  price_dhb integer not null,
  chain text not null,
  -- Set together, when the clone succeeds. Null means paid but not delivered,
  -- which is exactly the state a free retry is allowed from.
  voice_id text,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

-- No policies, deliberately — the same shape as stage_dub_usage. Only the
-- service role touches this, through the stage-voice-clone function; the host
-- learns the outcome from that function's response, never from the table.
alter table public.voice_clone_payments enable row level security;

-- The lookup the retry path makes: has this wallet already paid for a clone
-- it never received?
create index if not exists voice_clone_payments_unconsumed_idx
  on public.voice_clone_payments (wallet_address)
  where consumed_at is null;

-- Which of a wallet's voices is the one dubbing speaks in.
--
-- A wallet can hold several custom voices — the Studio's voice designer and
-- the training drawer both write here, and people make character voices. Until
-- now dubbing simply took the most recent row, which means training a monster
-- voice for a video on Tuesday silently replaced the host's own voice on
-- Wednesday's stage. Once that voice is something they PAID for, "most recent
-- wins" stops being a rough edge and becomes taking money for a thing that
-- then gets shadowed. So the stage voice is marked, and dubbing asks for the
-- marked one.
alter table public.custom_voices
  add column if not exists is_stage_voice boolean not null default false;

-- One paid stage voice per wallet — that IS the pricing model, since the clone
-- is cached and reused by every later stage. Partial, so the character voices
-- alongside it are unaffected.
create unique index if not exists custom_voices_one_stage_voice_idx
  on public.custom_voices (lower(wallet_address))
  where is_stage_voice;
