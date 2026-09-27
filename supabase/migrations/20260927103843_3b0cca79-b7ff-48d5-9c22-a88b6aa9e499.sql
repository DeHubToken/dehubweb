create table if not exists public.social_profiles (
  wallet_address text primary key,
  zernio_profile_id text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.social_post_credits (
  wallet_address text primary key,
  credits integer not null default 0 check (credits >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.social_credit_topups (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  tx_hash text not null unique,
  chain text not null,
  dhb numeric not null,
  dhb_price_usd numeric not null,
  usd numeric not null,
  posts integer not null check (posts > 0),
  discount_pct numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists social_credit_topups_wallet_idx on public.social_credit_topups (wallet_address, created_at desc);
create table if not exists public.social_crossposts (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  zernio_post_id text,
  platforms jsonb not null default '[]'::jsonb,
  credits_charged integer not null default 0,
  credits_refunded integer not null default 0,
  scheduled_for timestamptz,
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now()
);
create index if not exists social_crossposts_wallet_idx on public.social_crossposts (wallet_address, created_at desc);
alter table public.social_profiles enable row level security;
alter table public.social_post_credits enable row level security;
alter table public.social_credit_topups enable row level security;
alter table public.social_crossposts enable row level security;

create or replace function public.social_credit_add(
  p_wallet text, p_tx_hash text, p_chain text, p_dhb numeric, p_price numeric,
  p_usd numeric, p_posts integer, p_discount numeric
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  begin
    insert into social_credit_topups (wallet_address, tx_hash, chain, dhb, dhb_price_usd, usd, posts, discount_pct)
    values (lower(p_wallet), lower(p_tx_hash), p_chain, p_dhb, p_price, p_usd, p_posts, p_discount);
  exception when unique_violation then
    raise exception 'TX_ALREADY_CREDITED';
  end;
  insert into social_post_credits (wallet_address, credits, updated_at)
  values (lower(p_wallet), p_posts, now())
  on conflict (wallet_address) do update
    set credits = social_post_credits.credits + excluded.credits, updated_at = now()
  returning credits into v_balance;
  return v_balance;
end $$;

create or replace function public.social_credit_consume(p_wallet text, p_n integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  update social_post_credits
    set credits = credits - p_n, updated_at = now()
    where wallet_address = lower(p_wallet) and credits >= p_n
    returning credits into v_balance;
  if v_balance is null then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;
  return v_balance;
end $$;

create or replace function public.social_credit_refund(p_wallet text, p_n integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  insert into social_post_credits (wallet_address, credits, updated_at)
  values (lower(p_wallet), p_n, now())
  on conflict (wallet_address) do update
    set credits = social_post_credits.credits + excluded.credits, updated_at = now()
  returning credits into v_balance;
  return v_balance;
end $$;

revoke all on function public.social_credit_add(text, text, text, numeric, numeric, numeric, integer, numeric) from public, anon, authenticated;
revoke all on function public.social_credit_consume(text, integer) from public, anon, authenticated;
revoke all on function public.social_credit_refund(text, integer) from public, anon, authenticated;
grant execute on function public.social_credit_add(text, text, text, numeric, numeric, numeric, integer, numeric) to service_role;
grant execute on function public.social_credit_consume(text, integer) to service_role;
grant execute on function public.social_credit_refund(text, integer) to service_role;