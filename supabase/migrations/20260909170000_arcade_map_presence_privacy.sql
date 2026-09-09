alter table public.arcade_map_presence
  add column if not exists public_id uuid not null default gen_random_uuid();

create unique index if not exists arcade_map_presence_public_id_idx
  on public.arcade_map_presence (public_id);

comment on column public.arcade_map_presence.public_id is
  'Opaque identifier returned by map-presence instead of the account wallet address.';
