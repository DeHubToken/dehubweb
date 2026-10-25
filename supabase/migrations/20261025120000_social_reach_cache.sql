-- Follower counts read from the social accounts a creator has connected, so a
-- profile's total reach is the platforms' own numbers rather than typed ones.
-- One row per wallet, refreshed from Zernio at most every few hours; the
-- social-reach edge function is the only reader and writer.
create table if not exists public.social_reach_cache (
  wallet_address text primary key,
  accounts jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now()
);
alter table public.social_reach_cache enable row level security;
