-- Fixed-window rate-limit counters for edge functions.
-- Written only by edge functions via the service role; RLS-locked to clients.
create table if not exists public.edge_rate_limits (
  bucket_key text not null,
  action_type text not null,
  count integer not null default 0,
  window_start timestamptz not null default now(),
  primary key (bucket_key, action_type)
);

comment on table public.edge_rate_limits is 'Fixed-window rate-limit counters for edge functions. Written only by edge functions via the service role; RLS-locked to clients.';

create index if not exists edge_rate_limits_window_start_idx on public.edge_rate_limits (window_start);

-- Enable RLS with NO policies: the service role (used by edge functions) bypasses
-- RLS, while anon/authenticated clients get no access at all.
alter table public.edge_rate_limits enable row level security;
