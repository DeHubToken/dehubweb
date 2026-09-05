-- Count categories in the database, not in the browser.
--
-- Applied 2026-09-05.
--
-- `use-trending-categories` paged the whole of `category_post_log` into the
-- client in 1,000-row chunks and counted there. The table is 12,533 rows and
-- yields 335 distinct names, so every view of the trending rail cost thirteen
-- round trips and ~225 kB to render ten words — 962,555 requests and ~10 GB of
-- egress over a nine-week window, the largest single query on the project.
--
-- `security invoker` is deliberate: `category_post_log` already carries an
-- "Anyone can view" SELECT policy, so the function inherits exactly the access
-- the direct table read had. It grants no reach the caller did not already
-- have, which is why it is safe to expose to `anon`.
--
-- Grouping is on the raw `name`. Callers still normalise and merge, because two
-- raw spellings can fold to one key and only the client knows the exclusion
-- list — that merge now runs over 335 rows instead of 12,533.

create or replace function public.category_counts(p_since timestamptz default null)
returns table(name text, post_count bigint)
language sql
stable
security invoker
set search_path = public
as $fn$
  select l.name, count(*)::bigint as post_count
  from public.category_post_log l
  where l.name is not null
    and (p_since is null or l.posted_at >= p_since)
  group by l.name
  order by count(*) desc, l.name asc
$fn$;

grant execute on function public.category_counts(timestamptz) to anon, authenticated, service_role;
