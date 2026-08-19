-- Post link-copy counting: one copy per actor, signed in or not
-- ==============================================================
-- The original table (20260716120000_post_link_copies.sql) deduped on
-- `wallet_address` through a PARTIAL unique index — `where wallet_address is
-- not null`. Signed-out copies therefore had no dedupe key at all: every
-- anonymous copy inserted a fresh row, so anyone logged out could inflate any
-- post's share count without limit.
--
-- This replaces that key with `actor_id`, which the client always supplies:
-- the lowercased wallet address when signed in, otherwise a per-install id
-- (localStorage on web, SecureStore on mobile). The unique index is now
-- unconditional, so a copy counts exactly once per actor per post — the same
-- shape as a repost, which is what the share counter shows it next to.
--
-- `wallet_address` is kept and still written when the copier is signed in. It
-- is no longer the dedupe key, only provenance.

alter table public.post_link_copies
  add column if not exists actor_id text;

-- Existing rows: the wallet was the identity where we had one. Rows without a
-- wallet were the un-deduped anonymous ones and have no recoverable identity,
-- so give each a unique synthetic id rather than collapsing them together —
-- that keeps the counts they already contribute unchanged.
update public.post_link_copies
   set actor_id = lower(wallet_address)
 where actor_id is null and wallet_address is not null;

update public.post_link_copies
   set actor_id = 'legacy:' || id::text
 where actor_id is null;

alter table public.post_link_copies
  alter column actor_id set not null;

drop index if exists post_link_copies_token_wallet_uniq;

create unique index if not exists post_link_copies_token_actor_uniq
  on public.post_link_copies (token_id, actor_id);

-- The signature changes (p_wallet -> p_actor + p_wallet), so the old function
-- has to go rather than be replaced: leaving both would give PostgREST an
-- overload, and the two-arg version is exactly the un-deduped path being
-- closed. Clients swallow PGRST202, so a bundle deployed before this migration
-- lands simply records nothing — the counter falls back to reposts only, which
-- is what it showed before any of this.
drop function if exists public.track_post_link_copy(bigint, text);

create or replace function public.track_post_link_copy(
  p_token_id bigint,
  p_actor text,
  p_wallet text default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.post_link_copies (token_id, actor_id, wallet_address)
  select p_token_id, lower(p_actor), nullif(lower(p_wallet), '')
  where nullif(trim(p_actor), '') is not null
  on conflict (token_id, actor_id) do nothing;
$$;

grant execute on function public.track_post_link_copy(bigint, text, text) to anon, authenticated;
