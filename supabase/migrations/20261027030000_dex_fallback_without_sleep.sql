-- Give the edge sampler the first 15 seconds without holding an idle database
-- transaction. pg_cron 1.6 supports interval schedules. Disabled jobs stay disabled.
create or replace function dex_private.market_fallback_due(observed numeric, at_time timestamptz)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select extract(second from at_time) >= 15
    and (observed is null or observed <= extract(epoch from at_time) - 90);
$$;
revoke all on function dex_private.market_fallback_due(numeric, timestamptz) from public;

create or replace function dex_private.sample_market_fallback()
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare last_observed numeric;
begin
  if extract(second from clock_timestamp()) < 15 then return; end if;
  select (payload->>'observedAt')::numeric into last_observed from dex_private.market_state where id;
  if not dex_private.market_fallback_due(last_observed, clock_timestamp()) then return; end if;
  if not dex_private.market_wanted() then return; end if;
  -- sample_market already takes the advisory lock and rejects duplicate minutes.
  perform dex_private.sample_market();
end;
$$;

do $$
declare target bigint;
begin
  select jobid into target from cron.job where jobname = 'dex-shared-minute-price';
  if target is not null then perform cron.alter_job(target, schedule => '15 seconds'); end if;
end;
$$;
