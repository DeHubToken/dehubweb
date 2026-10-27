do $$
begin
  if dex_private.market_fallback_due(null, '2026-10-27 12:00:14+00') then raise exception 'edge head start lost'; end if;
  if not dex_private.market_fallback_due(null, '2026-10-27 12:00:15+00') then raise exception 'missing sample not recovered'; end if;
  if dex_private.market_fallback_due(extract(epoch from timestamptz '2026-10-27 12:00:00+00'), '2026-10-27 12:00:45+00') then raise exception 'fresh sample overwritten'; end if;
  if not dex_private.market_fallback_due(extract(epoch from timestamptz '2026-10-27 11:58:00+00'), '2026-10-27 12:00:15+00') then raise exception 'stale sample not recovered'; end if;
  if (select active from cron.job where jobid = 1) then raise exception 'disabled job enabled'; end if;
  if (select schedule from cron.job where jobid = 1) <> '15 seconds' then raise exception 'schedule unchanged'; end if;
  if position('pg_sleep' in pg_get_functiondef('dex_private.sample_market_fallback()'::regprocedure)) > 0 then raise exception 'fallback still sleeps'; end if;
end;
$$;
