-- Creators' own AI provider keys.
--
-- The key itself lives in Supabase Vault (encrypted at rest, one secret per
-- wallet + provider). This table only holds what the settings screen and the
-- admin hub may show: provider, last 4 characters, status and timestamps.
-- Nothing here is readable by anon or authenticated clients; only the server
-- functions (service role) touch it.

create table if not exists public.user_provider_keys (
  wallet_address text not null check (wallet_address = lower(wallet_address)),
  provider text not null check (provider ~ '^[a-z0-9]{2,20}$'),
  secret_id uuid not null,
  last4 text not null check (char_length(last4) <= 4),
  status text not null default 'working' check (status in ('working', 'invalid', 'no_credit', 'disabled')),
  checked_at timestamptz not null default now(),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (wallet_address, provider)
);

alter table public.user_provider_keys enable row level security;
revoke all on public.user_provider_keys from public, anon, authenticated;
grant select, insert, update, delete on public.user_provider_keys to service_role;

create index if not exists user_provider_keys_provider_status
  on public.user_provider_keys (provider, status);

-- Save or replace a key. Returns nothing; the key is never read back here.
create or replace function public.byok_save(p_wallet text, p_provider text, p_key text, p_status text default 'working')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet text := lower(p_wallet);
  v_name text := 'byok:' || lower(p_wallet) || ':' || p_provider;
  v_secret uuid;
begin
  if p_key is null or char_length(p_key) < 8 or char_length(p_key) > 4096 then
    raise exception 'invalid key';
  end if;
  select secret_id into v_secret from public.user_provider_keys
    where wallet_address = v_wallet and provider = p_provider;
  if v_secret is null then
    select id into v_secret from vault.secrets where name = v_name;
  end if;
  if v_secret is null then
    v_secret := vault.create_secret(p_key, v_name, 'Creator provider key');
  else
    perform vault.update_secret(v_secret, p_key, v_name, 'Creator provider key');
  end if;
  insert into public.user_provider_keys (wallet_address, provider, secret_id, last4, status, checked_at, updated_at)
  values (v_wallet, p_provider, v_secret, right(p_key, 4), p_status, now(), now())
  on conflict (wallet_address, provider) do update
    set secret_id = excluded.secret_id, last4 = excluded.last4, status = excluded.status,
        checked_at = now(), updated_at = now();
end;
$$;

-- The decrypted key for one request. Disabled or invalid keys are not returned.
create or replace function public.byok_get(p_wallet text, p_provider text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select s.decrypted_secret into v_key
    from public.user_provider_keys k
    join vault.decrypted_secrets s on s.id = k.secret_id
   where k.wallet_address = lower(p_wallet) and k.provider = p_provider
     and k.status in ('working', 'no_credit');
  if v_key is not null then
    update public.user_provider_keys set last_used_at = now()
     where wallet_address = lower(p_wallet) and provider = p_provider;
  end if;
  return v_key;
end;
$$;

-- Remove a key for real: the Vault secret and the row.
create or replace function public.byok_delete(p_wallet text, p_provider text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
begin
  delete from public.user_provider_keys
   where wallet_address = lower(p_wallet) and provider = p_provider
   returning secret_id into v_secret;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
end;
$$;

revoke all on function public.byok_save(text, text, text, text) from public, anon, authenticated;
revoke all on function public.byok_get(text, text) from public, anon, authenticated;
revoke all on function public.byok_delete(text, text) from public, anon, authenticated;
grant execute on function public.byok_save(text, text, text, text) to service_role;
grant execute on function public.byok_get(text, text) to service_role;
grant execute on function public.byok_delete(text, text) to service_role;

notify pgrst, 'reload schema';
