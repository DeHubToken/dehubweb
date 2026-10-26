-- Bank cash-outs through an off-ramp partner. The partner holds identity,
-- bank details and KYC; we keep only the order reference and its status.
create table if not exists public.cashout_orders (
  id uuid primary key default gen_random_uuid(),
  wallet text not null check (wallet ~ '^0x[a-f0-9]{40}$'),
  partner text not null default 'transak',
  partner_order_id text,
  crypto_currency text not null,
  network text not null,
  crypto_amount numeric not null check (crypto_amount > 0),
  fiat_currency text,
  fiat_amount numeric,
  status text not null default 'started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cashout_orders_partner_ref
  on public.cashout_orders (partner, partner_order_id) where partner_order_id is not null;
create index if not exists cashout_orders_wallet_created
  on public.cashout_orders (wallet, created_at desc);

-- Service role only: the cashout function reads and writes on the caller's behalf.
alter table public.cashout_orders enable row level security;

-- Partner access tokens. Refreshing one revokes the last, so every function
-- instance shares this row instead of minting its own.
create table if not exists public.partner_access_tokens (
  partner text primary key,
  token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.partner_access_tokens enable row level security;
