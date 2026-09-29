-- Translation cache eviction, cron HTTP timeouts, auto-dub pause and realtime trim.
-- Already applied to the database (version 20260929040614); idempotent so a re-run is harmless.
-- The eviction function body is superseded by 20260929081431.

-- Nightly eviction of cached translations nobody has read for 30 days.
create or replace function public.evict_stale_post_translations()
returns bigint
language sql
security definer
set search_path to 'public'
as $function$
  with v as (select ctid from public.post_translations where last_used_at < now() - interval '30 days' order by last_used_at limit 200000),
       d as (delete from public.post_translations t using v where t.ctid = v.ctid returning 1)
  select count(*) from d;
$function$;
revoke all on function public.evict_stale_post_translations() from public, anon, authenticated;
grant execute on function public.evict_stale_post_translations() to service_role;

select cron.schedule('evict-stale-post-translations', '40 3 * * *', 'SELECT public.evict_stale_post_translations();');

-- pg_net defaults to a 5 s timeout, which cut these jobs off mid-request.
-- Looked up by name: job ids differ between environments.
do $$
declare
  r record;
begin
  for r in
    select jobid, jobname, command from cron.job
    where jobname in ('sync-category-log-daily', 'refresh-leaderboard-full-daily', 'refresh-leaderboard-periods-daily',
                      'auto-transcribe-ended-stages', 'editor-assets-cleanup-daily', 'creator-job-recovery')
      and command not like '%timeout_milliseconds%'
  loop
    perform cron.alter_job(
      r.jobid,
      command := regexp_replace(
        r.command,
        '(body := ''[^'']*''::jsonb)',
        '\1,' || E'\n' || '    timeout_milliseconds := ' ||
          case when r.jobname like 'refresh-leaderboard-%' then '300000' else '55000' end
      )
    );
  end loop;
end $$;

-- The dubbing worker has no credentials; every sweep was a no-op. Paused, not removed.
select cron.alter_job(jobid, active := false) from cron.job where jobname = 'auto-dub-sweep';

-- No client subscribes to these, so their changes were decoded for nothing.
do $$
declare
  t text;
begin
  foreach t in array array['feature_requests', 'store_reviews', 'stories', 'video_dubs'] loop
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;
