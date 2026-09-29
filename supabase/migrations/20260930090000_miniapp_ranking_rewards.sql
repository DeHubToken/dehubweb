-- Mini app store, phase 4: a published ranking and weekly developer rewards.
-- Already applied to the database; idempotent so a re-run is harmless.
--
-- Ranking (nightly, 00:15 UTC, for the day just ended), listed apps only:
--   score = 0.55 × returning users / most returning users of any app
--         + 0.35 × weekly users    / most weekly users of any app
--         + 0.10 if the app is in its first 14 days
-- "Weekly users" are signed-in people who opened the app in the last 7 days;
-- "returning" are those of them who had also opened it in the 7 days before.
-- Opens alone, or opens by signed-out visitors, earn nothing.
--
-- Rewards (Mondays, 00:45 UTC, for the week just ended): the monthly pool in
-- miniapp_config, × 12 / 52, split by each app's average score that week.
-- Only live apps with a verified owner wallet and at least 3 returning users
-- on some day of the week qualify. Payment is manual: the treasury sends the
-- DHB and records it with
--   update miniapp_rewards set paid_tx = '0x…', paid_at = now()
--   where week_start = '…' and app_id = '…';

create table if not exists public.miniapp_config (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
alter table public.miniapp_config enable row level security;
drop policy if exists "Mini app config is public" on public.miniapp_config;
create policy "Mini app config is public" on public.miniapp_config for select to anon, authenticated using (true);
insert into public.miniapp_config (key, value) values ('monthly_reward_pool_dhb', '1000000'::jsonb) on conflict (key) do nothing;

create table if not exists public.miniapp_opens (
  app_id uuid not null references public.miniapp_apps(id) on delete cascade,
  wallet text not null,
  day date not null default (now() at time zone 'utc')::date,
  primary key (app_id, wallet, day)
);
create index if not exists miniapp_opens_day_idx on public.miniapp_opens (day, app_id);
alter table public.miniapp_opens enable row level security;

create table if not exists public.miniapp_scores (
  app_id uuid not null references public.miniapp_apps(id) on delete cascade,
  day date not null,
  weekly_users integer not null default 0,
  returning_users integer not null default 0,
  is_new boolean not null default false,
  score numeric not null default 0,
  rank integer,
  primary key (app_id, day)
);
alter table public.miniapp_scores enable row level security;
drop policy if exists "Mini app scores are public" on public.miniapp_scores;
create policy "Mini app scores are public" on public.miniapp_scores for select to anon, authenticated using (true);

create table if not exists public.miniapp_rewards (
  week_start date not null,
  app_id uuid not null references public.miniapp_apps(id) on delete cascade,
  owner_wallet text not null,
  weight numeric not null,
  share numeric not null,
  amount_dhb numeric not null,
  paid_tx text,
  paid_at timestamptz,
  computed_at timestamptz not null default now(),
  primary key (week_start, app_id)
);
alter table public.miniapp_rewards enable row level security;
drop policy if exists "Mini app rewards are public" on public.miniapp_rewards;
create policy "Mini app rewards are public" on public.miniapp_rewards for select to anon, authenticated using (true);

create or replace function public.miniapp_compute_scores(p_day date default ((now() at time zone 'utc')::date - 1))
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with stats as (
    select a.id as app_id,
      count(distinct o.wallet) filter (where o.day > p_day - 7 and o.day <= p_day) as weekly_users,
      count(distinct o.wallet) filter (where o.day > p_day - 7 and o.day <= p_day and exists (
        select 1 from miniapp_opens p where p.app_id = a.id and p.wallet = o.wallet and p.day > p_day - 14 and p.day <= p_day - 7
      )) as returning_users,
      (a.created_at > (p_day::timestamptz - interval '14 days')) as is_new
    from miniapp_apps a
    left join miniapp_opens o on o.app_id = a.id and o.day > p_day - 14 and o.day <= p_day
    where a.status = 'live' and a.tier in ('listed', 'verified')
    group by a.id, a.created_at
  ), mx as (
    select greatest(max(weekly_users), 1)::numeric as mw, greatest(max(returning_users), 1)::numeric as mr from stats
  ), scored as (
    select s.*, round(0.55 * s.returning_users / mx.mr + 0.35 * s.weekly_users / mx.mw + 0.10 * (case when s.is_new then 1 else 0 end), 6) as score
    from stats s cross join mx
  )
  insert into miniapp_scores (app_id, day, weekly_users, returning_users, is_new, score, rank)
  select app_id, p_day, weekly_users, returning_users, is_new, score,
         row_number() over (order by score desc, weekly_users desc, app_id)
  from scored
  on conflict (app_id, day) do update set weekly_users = excluded.weekly_users, returning_users = excluded.returning_users,
    is_new = excluded.is_new, score = excluded.score, rank = excluded.rank;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.miniapp_compute_rewards(p_week_start date default (date_trunc('week', now() at time zone 'utc')::date - 7))
returns integer language plpgsql security definer set search_path = public as $$
declare pool numeric; n integer;
begin
  select (value #>> '{}')::numeric * 12 / 52 into pool from miniapp_config where key = 'monthly_reward_pool_dhb';
  if coalesce(pool, 0) <= 0 then return 0; end if;
  if exists (select 1 from miniapp_rewards where week_start = p_week_start and paid_at is not null) then return 0; end if;
  delete from miniapp_rewards where week_start = p_week_start and paid_at is null;
  with w as (
    select s.app_id, a.owner_wallet, avg(s.score) as weight
    from miniapp_scores s join miniapp_apps a on a.id = s.app_id
    where s.day between p_week_start and p_week_start + 6
      and a.status = 'live' and a.owner_wallet is not null
    group by s.app_id, a.owner_wallet
    having max(s.returning_users) >= 3 and avg(s.score) > 0
  ), t as (select sum(weight) as total from w)
  insert into miniapp_rewards (week_start, app_id, owner_wallet, weight, share, amount_dhb)
  select p_week_start, w.app_id, w.owner_wallet, round(w.weight, 6), round(w.weight / t.total, 6), round(pool * w.weight / t.total, 2)
  from w cross join t where t.total > 0;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.miniapp_compute_scores(date) from public, anon, authenticated;
revoke all on function public.miniapp_compute_rewards(date) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('miniapp-scores-nightly', 'miniapp-rewards-weekly');
select cron.schedule('miniapp-scores-nightly', '15 0 * * *', $cron$select public.miniapp_compute_scores()$cron$);
select cron.schedule('miniapp-rewards-weekly', '45 0 * * 1', $cron$select public.miniapp_compute_rewards()$cron$);
