-- Developer stats for one mini app (dehub.io/apps/dev → Stats). Called by
-- miniapp-registry with the service role after it checks the caller owns the app.
create or replace function public.miniapp_app_stats(p_app uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select generate_series((now() at time zone 'utc')::date - 29, (now() at time zone 'utc')::date, interval '1 day')::date as day
  ),
  opens as (
    select day, count(*)::int as people from miniapp_opens where app_id = p_app and day >= (now() at time zone 'utc')::date - 29 group by day
  )
  select jsonb_build_object(
    'daily', (select jsonb_agg(jsonb_build_object('day', d.day, 'people', coalesce(o.people, 0)) order by d.day) from days d left join opens o using (day)),
    'people30', (select count(distinct wallet)::int from miniapp_opens where app_id = p_app and day >= (now() at time zone 'utc')::date - 29),
    'people7', (select count(distinct wallet)::int from miniapp_opens where app_id = p_app and day >= (now() at time zone 'utc')::date - 6),
    'added', (select count(*)::int from miniapp_installs where app_id = p_app),
    'added30', (select count(*)::int from miniapp_installs where app_id = p_app and created_at > now() - interval '30 days'),
    'notificationsOn', (select count(*)::int from miniapp_installs where app_id = p_app and notifications_on),
    'payments30', (select count(*)::int from miniapp_payments where app_id = p_app and created_at > now() - interval '30 days'),
    'dhb30', (select coalesce(sum(amount_dhb), 0) from miniapp_payments where app_id = p_app and created_at > now() - interval '30 days'),
    'dhbAll', (select coalesce(sum(amount_dhb), 0) from miniapp_payments where app_id = p_app),
    'notified30', (select count(*)::int from miniapp_notification_log where app_id = p_app and sent_at > now() - interval '30 days'),
    'rewardsDhb', (select coalesce(sum(amount_dhb), 0) from miniapp_rewards where app_id = p_app)
  );
$$;
revoke all on function public.miniapp_app_stats(uuid) from public, anon, authenticated;
