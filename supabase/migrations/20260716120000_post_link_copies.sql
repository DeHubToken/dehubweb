-- Post link-copy tracking
-- =======================
-- Counts how many users copied a post's share link, so the shorts share
-- button can show reposts + link copies. Rows are write-only from the
-- client via RPC; reads are aggregate-only via RPC. Direct table access
-- stays locked down by RLS with no policies.

create table if not exists public.post_link_copies (
  id uuid primary key default gen_random_uuid(),
  token_id bigint not null,
  wallet_address text,
  created_at timestamptz not null default now()
);

-- One copy per wallet per post (anonymous copies are not deduped)
create unique index if not exists post_link_copies_token_wallet_uniq
  on public.post_link_copies (token_id, wallet_address)
  where wallet_address is not null;

create index if not exists post_link_copies_token_idx
  on public.post_link_copies (token_id);

alter table public.post_link_copies enable row level security;
-- no policies: all access goes through the security-definer functions below

create or replace function public.track_post_link_copy(
  p_token_id bigint,
  p_wallet text default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.post_link_copies (token_id, wallet_address)
  values (p_token_id, nullif(lower(p_wallet), ''))
  on conflict (token_id, wallet_address) where wallet_address is not null
  do nothing;
$$;

create or replace function public.get_post_link_copy_counts(
  p_token_ids bigint[]
) returns table (token_id bigint, copies bigint)
language sql
security definer
stable
set search_path = public
as $$
  select c.token_id, count(*)::bigint as copies
  from public.post_link_copies c
  where c.token_id = any(p_token_ids)
  group by c.token_id;
$$;

grant execute on function public.track_post_link_copy(bigint, text) to anon, authenticated;
grant execute on function public.get_post_link_copy_counts(bigint[]) to anon, authenticated;
