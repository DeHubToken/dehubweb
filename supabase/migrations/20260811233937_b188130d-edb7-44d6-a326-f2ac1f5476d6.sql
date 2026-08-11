do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'auto-transcribe-ended-stages';
  if v_jobid is null then
    raise notice 'cron job auto-transcribe-ended-stages not found; nothing to do';
    return;
  end if;
  perform cron.alter_job(v_jobid, schedule => '*/15 * * * *');
end
$$;