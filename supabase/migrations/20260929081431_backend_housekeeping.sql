-- Backend housekeeping: cheaper translation cache hits, DEX sampler yields to the edge,
-- index and cron cleanup, and closing writes on tables only the server should touch.
-- Already applied to the database (version 20260929081431); idempotent so a re-run is harmless.
-- Also applied at this point: supabase/migrations/20260825140000_film_reviews.sql as written, and
-- only the recount_space() block of 20260819180000_stage_write_policies.sql (its policies are NOT live).

-- Record the first read, then at most one write per row per day (was one non-HOT update per hit).
create or replace function public.touch_post_translation(p_text_hash text, p_target_lang text)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.post_translations set hit_count = hit_count + 1, last_used_at = now()
  where text_hash = p_text_hash and target_lang = p_target_lang
    and (hit_count = 0 or last_used_at < now() - interval '1 day');
$function$;

-- One linear statement; the old loop re-visited its own deletes and grew quadratically.
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

-- The SQL fallback used to win the sampler lock on every idle wake-up and throw away the edge
-- function's sample. Waiting 15 s lets the edge write land; sample_market() then sees the minute
-- is recorded and returns. The 90 s safety net is unchanged.
create or replace function dex_private.sample_market_fallback()
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare last_observed numeric;
begin
  select (payload->>'observedAt')::numeric into last_observed from dex_private.market_state where id;
  if last_observed is not null and last_observed > extract(epoch from now()) - 90 then return; end if;
  if not dex_private.market_wanted() then return; end if;
  perform pg_sleep(15);
  perform dex_private.sample_market();
end $function$;

-- Nothing reads price_minutes.positions; the live book comes from market_state.payload.
create or replace function dex_private.price_minutes_strip_positions()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  new.positions := '[]'::jsonb;
  return new;
end $function$;
revoke all on function dex_private.price_minutes_strip_positions() from public, anon, authenticated;
drop trigger if exists price_minutes_strip_positions on dex_private.price_minutes;
create trigger price_minutes_strip_positions before insert on dex_private.price_minutes
  for each row execute function dex_private.price_minutes_strip_positions();

-- The (p_since is null or ...) form could not use idx_category_post_log_posted_at.
create or replace function public.category_counts(p_since timestamp with time zone default null::timestamp with time zone)
returns table(name text, post_count bigint)
language sql
stable
set search_path to 'public'
as $function$
  select l.name, count(*)::bigint as post_count
  from public.category_post_log l
  where l.name is not null
    and l.posted_at >= coalesce(p_since, '-infinity'::timestamptz)
  group by l.name
  order by count(*) desc, l.name asc
$function$;

-- Each is a non-unique copy or leading-column prefix of a unique index.
do $$
declare
  n text;
begin
  foreach n in array array['idx_leaderboard_snapshots_account', 'idx_communities_slug', 'idx_feature_request_votes_feature_id',
                           'idx_leaderboard_cache_lookup', 'idx_ai_agents_api_key', 'idx_unsubscribe_tokens_token',
                           'idx_suppressed_emails_email', 'idx_premium_subscriptions_stripe_id', 'chess_moves_match_idx',
                           'idx_space_participants_space', 'idx_stage_reminders_space', 'transcript_translations_transcript_idx',
                           'user_wallet_passkeys_user_id_idx', 'idx_work_apps_job'] loop
    if to_regclass('public.' || n) is not null
       and not exists (select 1 from pg_constraint where conindid = to_regclass('public.' || n)) then
      execute format('drop index if exists public.%I', n);
    end if;
  end loop;
end $$;

-- Retention the tables were designed for but never had.
select cron.schedule('cleanup-anonymous-post-views-daily', '35 3 * * *', 'SELECT public.cleanup_old_anonymous_post_views()');
select cron.schedule('cleanup-edge-rate-limits-daily', '55 3 * * *', $$DELETE FROM public.edge_rate_limits WHERE window_start < now() - interval '2 days'$$);

-- Finished or no-op jobs (pg_net already expires its responses after 6 h; Stories is gone).
select cron.unschedule(jobname) from cron.job
where jobname in ('migrate-ai-images-daily', 'cleanup-net-http-response-daily', 'cleanup-story-views-weekly');

-- Page opens already trigger a scan; the cron only needs to run while someone is watching, plus hourly.
select cron.alter_job(
  jobid,
  command := regexp_replace(command, '[\s;]+$', '') || E'\n      WHERE ((SELECT last_read_at > now() - interval ''15 minutes'' FROM dex_private.market_readers WHERE id) OR extract(minute FROM now()) < 10);'
)
from cron.job
where jobname = 'dex-pool-position-scan' and command not like '%market_readers%';

-- Sat in public and was callable by anon; nothing used it.
drop extension if exists pgstattuple;

-- Written and read only by the server (service role bypasses RLS).
drop policy if exists "Allow authenticated read access" on public.client_error_logs;
revoke all on public.client_error_logs from anon, authenticated;
drop policy if exists "Anyone can insert" on public.category_post_log;
drop policy if exists "Anyone can insert trending categories" on public.trending_categories;
drop policy if exists "Anyone can update trending categories" on public.trending_categories;

-- Stake rows come only from sync-staking-deposits; clients record withdrawals with a real tx hash.
drop policy if exists "Anyone can insert staking records" on public.staking_records;
drop policy if exists "Clients record withdrawals only" on public.staking_records;
create policy "Clients record withdrawals only" on public.staking_records
  for insert to anon, authenticated
  with check (action = 'unstake' and tx_hash ~* '^0x[0-9a-f]{64}$');

-- No client deletes feature media; temp-compress no longer exists.
drop policy if exists "Owners can delete feature media" on storage.objects;
drop policy if exists "Allow public read on temp-compress" on storage.objects;

-- Pending rows past the 24 h give-up were never retried but spun forever in the player.
update public.transcripts set status = 'failed', attempts = 5, last_attempt_at = now()
where status = 'pending' and created_at < now() - interval '24 hours';

-- Disposable windowed counters; no need to WAL-log them.
alter table if exists public.edge_rate_limits set unlogged;

-- Unreferenced: chess_settle_wagers called a dropped function, get_community_role was anon-callable
-- and unused, work_view_snapshots was never written.
drop function if exists public.chess_settle_wagers(uuid);
drop function if exists public.get_community_role(uuid, text);
drop table if exists public.work_view_snapshots;

create or replace function public.recount_space(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.audio_spaces s
  set listener_count = (
        select count(*) from public.space_participants p
        where p.space_id = s.id and p.role = 'listener' and p.left_at is null
      ),
      speaker_count = (
        select count(*) from public.space_participants p
        where p.space_id = s.id and p.role in ('host', 'speaker') and p.left_at is null
      )
  where s.id = p_space_id;
end;
$function$;
revoke all on function public.recount_space(uuid) from public;
grant execute on function public.recount_space(uuid) to anon, authenticated;

-- Wallet-scoped reads compare lower(column); these let them use an index.
create index if not exists custom_notifications_lower_recipient_created_idx on public.custom_notifications (lower(recipient_address), created_at desc);
create index if not exists ai_conversations_lower_wallet_updated_idx on public.ai_conversations (lower(wallet_address), updated_at desc);

-- A call's parties are fixed once created, so nobody can write themselves into someone else's call.
-- Status stays writable, so every app version keeps working.
create or replace function public.call_sessions_freeze_parties()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.caller_address is distinct from old.caller_address
     or new.recipient_address is distinct from old.recipient_address
     or new.call_type is distinct from old.call_type
     or new.created_at is distinct from old.created_at then
    raise exception 'call parties are fixed' using errcode = '42501';
  end if;
  return new;
end $function$;
drop trigger if exists call_sessions_freeze_parties on public.call_sessions;
create trigger call_sessions_freeze_parties before update on public.call_sessions
  for each row execute function public.call_sessions_freeze_parties();
