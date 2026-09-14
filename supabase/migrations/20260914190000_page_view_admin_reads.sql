-- Admin reads over page_view_events
-- =================================
-- The table has RLS on with no policies, so nothing but the service role can
-- read it (20260914120000). These are the shapes the admin panel's Traffic page
-- needs, kept in SQL because PostgREST cannot group.
--
-- Granted to service_role only: the caller is the `admin-page-views` edge
-- function, which verifies a SUPER_ADMIN token against api.dehub.io before it
-- uses the key. No anon or authenticated grant — a page anyone can reach must
-- never be one query string away from the whole traffic log.

-- Totals across the whole app for a window.
create or replace function public.admin_page_view_totals(p_since timestamptz)
returns table (visits bigint, visitors bigint, signed_in_visits bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*)::bigint,
    count(distinct viewer_id)::bigint,
    count(*) filter (where address is not null)::bigint
  from public.page_view_events
  where created_at >= p_since;
$$;

-- Every route, busiest first.
create or replace function public.admin_page_view_paths(p_since timestamptz, p_limit integer default 100)
returns table (path text, visits bigint, visitors bigint)
language sql
security definer
set search_path = public
stable
as $$
  select path, count(*)::bigint, count(distinct viewer_id)::bigint
  from public.page_view_events
  where created_at >= p_since
  group by path
  order by 2 desc
  limit greatest(1, least(500, p_limit));
$$;

-- One route's day-by-day series.
create or replace function public.admin_page_view_daily(p_paths text[], p_since timestamptz)
returns table (day date, visits bigint, visitors bigint)
language sql
security definer
set search_path = public
stable
as $$
  select (created_at at time zone 'utc')::date as day,
         count(*)::bigint,
         count(distinct viewer_id)::bigint
  from public.page_view_events
  where created_at >= p_since
    and (p_paths is null or path = any(p_paths))
  group by 1
  order by 1;
$$;

-- Where a route's visitors came from: the in-app surface before it, or the
-- external host when it was the first page of the visit.
create or replace function public.admin_page_view_sources(p_paths text[], p_since timestamptz, p_limit integer default 25)
returns table (source text, kind text, visits bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(prev_path, ext_referrer_host, 'direct') as source,
    case
      when prev_path is not null then 'in-app'
      when ext_referrer_host is not null then 'referrer'
      else 'direct'
    end as kind,
    count(*)::bigint
  from public.page_view_events
  where created_at >= p_since
    and (p_paths is null or path = any(p_paths))
  group by 1, 2
  order by 3 desc
  limit greatest(1, least(200, p_limit));
$$;

revoke all on function public.admin_page_view_totals(timestamptz) from public, anon, authenticated;
revoke all on function public.admin_page_view_paths(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.admin_page_view_daily(text[], timestamptz) from public, anon, authenticated;
revoke all on function public.admin_page_view_sources(text[], timestamptz, integer) from public, anon, authenticated;

grant execute on function public.admin_page_view_totals(timestamptz) to service_role;
grant execute on function public.admin_page_view_paths(timestamptz, integer) to service_role;
grant execute on function public.admin_page_view_daily(text[], timestamptz) to service_role;
grant execute on function public.admin_page_view_sources(text[], timestamptz, integer) to service_role;
