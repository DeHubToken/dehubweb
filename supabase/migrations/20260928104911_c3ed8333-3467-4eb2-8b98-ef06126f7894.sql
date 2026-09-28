create table if not exists public.miniapp_signing_keys (
  kid          text primary key,
  alg          text not null default 'ES256',
  private_jwk  jsonb not null,
  public_jwk   jsonb not null,
  created_at   timestamptz not null default now(),
  retired_at   timestamptz
);

alter table public.miniapp_signing_keys enable row level security;

create table if not exists public.miniapp_apps (
  id                       uuid primary key default gen_random_uuid(),
  slug                     text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  domain                   text not null unique,
  home_url                 text not null,
  owner_wallet             text check (owner_wallet is null or owner_wallet ~ '^0x[a-f0-9]{40}$'),
  source                   text not null default 'dehub' check (source in ('dehub', 'farcaster', 'base', 'first_party')),
  manifest                 jsonb not null default '{}'::jsonb,
  name                     text not null,
  subtitle                 text,
  description              text,
  icon_url                 text,
  splash_image_url         text,
  splash_background_color  text,
  category                 text,
  tags                     text[] not null default '{}',
  permissions              text[] not null default '{}',
  tier                     text not null default 'unlisted' check (tier in ('unlisted', 'listed', 'verified')),
  status                   text not null default 'pending' check (status in ('pending', 'live', 'suspended', 'rejected')),
  crawled_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists miniapp_apps_live_idx on public.miniapp_apps (status, tier, category);

alter table public.miniapp_apps enable row level security;

drop policy if exists "Live mini apps are public" on public.miniapp_apps;
create policy "Live mini apps are public"
  on public.miniapp_apps for select
  to anon, authenticated
  using (status = 'live');