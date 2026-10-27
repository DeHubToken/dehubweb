-- Durable circuit breakers and bounded translation work, shared by every edge instance.
create table if not exists public.provider_circuits (
  provider text primary key,
  blocked_until timestamptz not null default '-infinity',
  probe_until timestamptz not null default '-infinity',
  probe_token uuid,
  failures integer not null default 0
);
create table if not exists public.translation_work_leases (
  cache_key text primary key,
  token uuid not null,
  expires_at timestamptz not null
);
create table if not exists public.translation_attempt_budgets (
  day date not null,
  scope text not null check (scope in ('all', 'i18n')),
  attempts bigint not null default 0,
  input_bytes bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (day, scope)
);
create index if not exists translation_work_leases_expiry on public.translation_work_leases(expires_at);
alter table public.provider_circuits enable row level security;
alter table public.translation_work_leases enable row level security;
alter table public.translation_attempt_budgets enable row level security;
revoke all on public.provider_circuits, public.translation_work_leases, public.translation_attempt_budgets from public, anon, authenticated;
grant all on public.provider_circuits, public.translation_work_leases, public.translation_attempt_budgets to service_role;

create or replace function public.claim_provider_attempt(p_provider text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.provider_circuits;
begin
  if length(p_provider) > 160 or p_provider = '' then raise exception 'Invalid provider'; end if;
  insert into public.provider_circuits(provider) values(p_provider) on conflict do nothing;
  select * into c from public.provider_circuits where provider=p_provider for update;
  if c.blocked_until > now() or (c.failures > 0 and c.probe_until > now()) then
    return jsonb_build_object('allowed',false);
  end if;
  if c.failures > 0 then
    update public.provider_circuits set probe_token=p_token, probe_until=now()+interval '45 seconds' where provider=p_provider;
    return jsonb_build_object('allowed',true,'probe',true);
  end if;
  return jsonb_build_object('allowed',true,'probe',false);
end $$;

create or replace function public.finish_provider_attempt(p_provider text, p_token uuid, p_probe boolean, p_cooldown_seconds integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_cooldown_seconds > 0 then
    update public.provider_circuits set
      blocked_until=greatest(blocked_until,now()+make_interval(secs=>least(p_cooldown_seconds,3600))),
      failures=least(failures+1,1000000), probe_until='-infinity', probe_token=null
    where provider=p_provider and (not p_probe or probe_token=p_token);
  elsif p_probe then
    -- An old successful request cannot reopen a breaker closed by a newer failure.
    update public.provider_circuits set failures=0, blocked_until='-infinity', probe_until='-infinity', probe_token=null
    where provider=p_provider and probe_token=p_token;
  end if;
end $$;

create or replace function public.claim_translation_work(p_key text, p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed text;
begin
  if length(p_key)>160 then raise exception 'Invalid cache key'; end if;
  -- Reclaim crashed requests without adding another scheduled job or a full scan.
  delete from public.translation_work_leases where cache_key in (
    select cache_key from public.translation_work_leases where expires_at < now()-interval '1 day'
    order by expires_at limit 16 for update skip locked
  );
  insert into public.translation_work_leases(cache_key,token,expires_at)
  values(p_key,p_token,now()+interval '5 minutes')
  on conflict(cache_key) do update set token=excluded.token,expires_at=excluded.expires_at
  where translation_work_leases.expires_at<=now()
  returning cache_key into claimed;
  return claimed is not null;
end $$;
create or replace function public.release_translation_work(p_key text,p_token uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.translation_work_leases where cache_key=p_key and token=p_token;
$$;

-- Reserve the full possible output before EACH model call, including rejected
-- output and quota-tier providers. No refunds based on absent usage reports.
-- Bulk work has a sub-budget; labelling a request i18n never bypasses the total.
create or replace function public.reserve_translation_attempt(p_bulk boolean,p_input_bytes integer,p_output_tokens integer,p_cap integer default 20000)
returns boolean language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'utc')::date; a public.translation_attempt_budgets; b public.translation_attempt_budgets;
begin
  if p_bulk is null or p_cap is null or p_input_bytes is null or p_output_tokens is null
    or p_input_bytes<0 or p_input_bytes>200000 or p_output_tokens<1 or p_output_tokens>16384 then return false; end if;
  insert into public.translation_attempt_budgets(day,scope) values(d,'all'),(d,'i18n') on conflict do nothing;
  select * into a from public.translation_attempt_budgets where day=d and scope='all' for update;
  if a.attempts>=least(greatest(p_cap,0),20000) or a.input_bytes+p_input_bytes>200000000
    or a.output_tokens+p_output_tokens>80000000 then return false; end if;
  if p_bulk then
    select * into b from public.translation_attempt_budgets where day=d and scope='i18n' for update;
    if b.attempts>=2000 or b.input_bytes+p_input_bytes>20000000 or b.output_tokens+p_output_tokens>8000000 then return false; end if;
    update public.translation_attempt_budgets set attempts=attempts+1,input_bytes=input_bytes+p_input_bytes,output_tokens=output_tokens+p_output_tokens where day=d and scope='i18n';
  end if;
  update public.translation_attempt_budgets set attempts=attempts+1,input_bytes=input_bytes+p_input_bytes,output_tokens=output_tokens+p_output_tokens where day=d and scope='all';
  return true;
end $$;

revoke all on function public.claim_provider_attempt(text,uuid),public.finish_provider_attempt(text,uuid,boolean,integer),public.claim_translation_work(text,uuid),public.release_translation_work(text,uuid),public.reserve_translation_attempt(boolean,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_provider_attempt(text,uuid),public.finish_provider_attempt(text,uuid,boolean,integer),public.claim_translation_work(text,uuid),public.release_translation_work(text,uuid),public.reserve_translation_attempt(boolean,integer,integer,integer) to service_role;
