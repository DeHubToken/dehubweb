-- DeHub Builder — AI app builder (prompt → generated static app → hosted preview).
create table if not exists public.builder_projects (
  id uuid primary key default gen_random_uuid(),
  wallet text not null,
  name text not null default 'New App',
  emoji text not null default '✨',
  prompt text not null,
  status text not null default 'queued',
  status_detail text,
  error text,
  version integer not null default 0,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.builder_projects is 'DeHub Builder apps: one row per AI-built app. Service-role only; served publicly via the builder-serve edge function when is_public.';

create index if not exists builder_projects_wallet_idx
  on public.builder_projects (wallet, updated_at desc);

create table if not exists public.builder_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.builder_projects(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

comment on table public.builder_messages is 'Per-project build chat: user prompts, agent replies, and build-progress log lines.';

create index if not exists builder_messages_project_idx
  on public.builder_messages (project_id, created_at);

create table if not exists public.builder_files (
  project_id uuid not null references public.builder_projects(id) on delete cascade,
  path text not null,
  content text not null,
  updated_at timestamptz not null default now(),
  primary key (project_id, path)
);

comment on table public.builder_files is 'Generated static app files (html/css/js), served as-is by the builder-serve edge function.';

create table if not exists public.builder_usage (
  wallet text not null,
  day date not null,
  builds integer not null default 0,
  primary key (wallet, day)
);

comment on table public.builder_usage is 'Daily AI build counter per wallet — checked against the DHB staking-badge allowance tier in builder-api.';

alter table public.builder_projects enable row level security;
alter table public.builder_messages enable row level security;
alter table public.builder_files enable row level security;
alter table public.builder_usage enable row level security;