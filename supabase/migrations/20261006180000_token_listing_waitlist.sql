-- Token listing waitlist
-- ======================
-- Everyone who taps "Notify me" on the $DHB listing-soon card. One row per
-- (token, email): signing up twice refreshes the row instead of duplicating it,
-- so the count is people, not taps.
--
-- The browser never reads this table. RLS is on with no policies and the
-- anon/authenticated grants are revoked; the only way in is
-- join_token_listing_waitlist(), which validates the address and stamps the
-- caller's Supabase user id itself rather than trusting one from the client.

create table if not exists public.token_listing_waitlist (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  email text not null,
  wallet_address text,
  username text,
  supabase_user_id uuid,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint token_listing_waitlist_token_email_key unique (token, email)
);

create index if not exists token_listing_waitlist_created_at_idx
  on public.token_listing_waitlist (token, created_at desc);

alter table public.token_listing_waitlist enable row level security;
revoke all on public.token_listing_waitlist from anon, authenticated;

create or replace function public.join_token_listing_waitlist(
  p_token text,
  p_email text,
  p_wallet_address text default null,
  p_username text default null,
  p_source text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := upper(btrim(coalesce(p_token, '')));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_inserted boolean;
begin
  if v_token not in ('DHB') then
    raise exception 'unsupported token' using errcode = '22023';
  end if;

  if length(v_email) > 254
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or v_email like '%.dehub.internal' then
    raise exception 'invalid email' using errcode = '22023';
  end if;

  insert into public.token_listing_waitlist as w
    (token, email, wallet_address, username, supabase_user_id, source)
  values (
    v_token,
    v_email,
    nullif(left(btrim(coalesce(p_wallet_address, '')), 100), ''),
    nullif(left(btrim(coalesce(p_username, '')), 100), ''),
    auth.uid(),
    nullif(left(btrim(coalesce(p_source, '')), 50), '')
  )
  on conflict (token, email) do update set
    wallet_address = coalesce(excluded.wallet_address, w.wallet_address),
    username = coalesce(excluded.username, w.username),
    supabase_user_id = coalesce(excluded.supabase_user_id, w.supabase_user_id),
    updated_at = now()
  returning (xmax = 0) into v_inserted;

  return jsonb_build_object('ok', true, 'alreadyJoined', not v_inserted);
end;
$$;

revoke all on function public.join_token_listing_waitlist(text, text, text, text, text) from public;
grant execute on function public.join_token_listing_waitlist(text, text, text, text, text) to anon, authenticated;
