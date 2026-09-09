create table if not exists public.arcade_map_presence (
  wallet_address text primary key check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  precision_km integer not null default 25 check (precision_km between 1 and 100),
  username text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

alter table public.arcade_map_presence enable row level security;
revoke all on public.arcade_map_presence from anon, authenticated;

comment on table public.arcade_map_presence is
  'Explicitly opt-in, deliberately coarse Arcade globe presence. Written and read only by map-presence.';
