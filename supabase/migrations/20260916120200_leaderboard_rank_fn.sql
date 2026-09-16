-- Applied to production 2026-09-16.
--
-- The assistant context hook read the whole holdings/all cache row (~50 KB of
-- JSON) into the browser to find one wallet's position. This answers the same
-- question server-side from the same row.
create or replace function public.leaderboard_rank(p_address text, p_sort text default 'holdings')
returns table(rank integer, total numeric, entries integer)
language sql stable security definer set search_path = public as $$
  with rows as (
    select e.ord, e.j
    from leaderboard_cache c,
         jsonb_array_elements(c.data->'result'->'byWalletBalance') with ordinality e(j, ord)
    where c.sort_mode = p_sort and c.period = 'all'
  )
  select r.ord::int as rank,
         nullif(r.j->>'total','')::numeric as total,
         (select count(*)::int from rows) as entries
  from rows r
  where lower(r.j->>'account') = lower(p_address)
  limit 1;
$$;
revoke all on function public.leaderboard_rank(text, text) from public;
grant execute on function public.leaderboard_rank(text, text) to anon, authenticated;
