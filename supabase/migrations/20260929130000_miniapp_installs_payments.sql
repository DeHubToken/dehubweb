-- Mini app store, phase 3: installs (who added which app, and whether it may
-- notify them), payments made through the host, and the notification log that
-- rate-limits them. Already applied to the database; idempotent.

create table if not exists public.miniapp_installs (
  wallet text not null check (wallet ~ '^0x[a-f0-9]{40}$'),
  app_id uuid not null references public.miniapp_apps(id) on delete cascade,
  notifications_on boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (wallet, app_id)
);
alter table public.miniapp_installs enable row level security;
drop policy if exists "Own mini app installs are readable" on public.miniapp_installs;
create policy "Own mini app installs are readable" on public.miniapp_installs for select using (wallet = get_request_wallet_address());

create table if not exists public.miniapp_payments (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.miniapp_apps(id) on delete cascade,
  payer_wallet text not null,
  payer_account text,
  recipient text not null,
  amount_dhb numeric not null check (amount_dhb > 0),
  chain_id integer not null,
  tx_hash text not null unique,
  memo text,
  created_at timestamptz not null default now()
);
create index if not exists miniapp_payments_app_idx on public.miniapp_payments (app_id, created_at desc);
alter table public.miniapp_payments enable row level security;
drop policy if exists "Own mini app payments are readable" on public.miniapp_payments;
create policy "Own mini app payments are readable" on public.miniapp_payments for select using (payer_wallet = get_request_wallet_address());

create table if not exists public.miniapp_notification_log (
  app_id uuid not null references public.miniapp_apps(id) on delete cascade,
  wallet text not null,
  notification_id text not null,
  sent_at timestamptz not null default now(),
  primary key (app_id, wallet, notification_id)
);
create index if not exists miniapp_notification_log_recent_idx on public.miniapp_notification_log (app_id, wallet, sent_at desc);
alter table public.miniapp_notification_log enable row level security;

-- sha-256 of the app's notification API key; the key itself is shown once.
alter table public.miniapp_apps add column if not exists notify_key_hash text;
