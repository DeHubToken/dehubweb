-- Anonymous views: return which token ids were new
-- ================================================
-- Views used to be displayed as "the DeHub count plus the total here", added
-- together by the client after the card had already painted — which is why a
-- post's view number appeared low and then jumped. The DeHub API now holds one
-- number (`totalViews`), and the anon-views edge function forwards each newly
-- recorded view to it.
--
-- To forward them, the edge function needs to know WHICH ids survived dedup, not
-- just how many. record_anonymous_views already computes exactly that internally
-- (v_new_ids) and then throws it away to return a count.
--
-- The return type changes, so the old function has to be dropped rather than
-- replaced — Postgres will not CREATE OR REPLACE across a different signature.
-- Callers reading the old integer must be updated in the same deploy; the only
-- caller is the anon-views edge function.
--
-- anonymous_post_view_totals stays as it is. It is no longer what gets
-- displayed, but it remains the record of the signed-out half and the thing a
-- re-import would be rebuilt from.

drop function if exists public.record_anonymous_views(text[], text);

create function public.record_anonymous_views(
  p_token_ids text[],
  p_viewer_hash text
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_new_ids text[];
begin
  if p_viewer_hash is null or p_viewer_hash = '' then
    raise exception 'viewer_hash is required';
  end if;

  -- Insert the ledger rows, keeping only the token ids that were genuinely new.
  with candidates as (
    select distinct unnest(p_token_ids) as token_id
  ),
  inserted as (
    insert into public.anonymous_post_views (token_id, viewer_hash, view_date)
    select c.token_id, p_viewer_hash, v_today
    from candidates c
    where c.token_id is not null and c.token_id <> ''
    on conflict (token_id, viewer_hash, view_date) do nothing
    returning token_id
  )
  select coalesce(array_agg(token_id), '{}') into v_new_ids from inserted;

  if array_length(v_new_ids, 1) is null then
    return '{}';
  end if;

  insert into public.anonymous_post_view_totals as t (token_id, view_count, updated_at)
  select id, 1, now() from unnest(v_new_ids) as id
  on conflict (token_id) do update
    set view_count = t.view_count + 1,
        updated_at = now();

  return v_new_ids;
end;
$$;

-- Still not granted to anon/authenticated: the function is called by the
-- anon-views edge function with the service role, which is where the viewer_hash
-- is derived from the request IP. Granting it to clients would let a caller
-- supply any hash it liked.
