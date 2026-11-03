-- Every webhook DeHub sends a mini app, so its developer can see what arrived
-- (dehub.io/apps/dev). Service role only; rows older than 14 days are pruned.
create table if not exists public.miniapp_webhook_deliveries (
  id bigserial primary key,
  app_id uuid not null references public.miniapp_apps(id) on delete cascade,
  event text not null,
  url text not null,
  status integer,
  ok boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists miniapp_webhook_deliveries_app_idx on public.miniapp_webhook_deliveries (app_id, created_at desc);
alter table public.miniapp_webhook_deliveries enable row level security;

create or replace function public.prune_miniapp_webhook_deliveries() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if random() < 0.01 then
    delete from public.miniapp_webhook_deliveries where created_at < now() - interval '14 days';
  end if;
  return null;
end $$;
drop trigger if exists miniapp_webhook_deliveries_prune on public.miniapp_webhook_deliveries;
create trigger miniapp_webhook_deliveries_prune after insert on public.miniapp_webhook_deliveries
  for each statement execute function public.prune_miniapp_webhook_deliveries();
