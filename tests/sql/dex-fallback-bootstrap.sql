create schema if not exists cron;
create table cron.job(jobid bigint primary key, jobname text, schedule text, active boolean);
insert into cron.job values (1, 'dex-shared-minute-price', '* * * * *', false);
create function cron.alter_job(target bigint, schedule text) returns void language sql as $$
  update cron.job set schedule = $2 where jobid = $1;
$$;
