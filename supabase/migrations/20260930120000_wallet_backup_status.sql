-- Whether a person has saved their wallet backup (the 12 words or the private
-- key), so web and app stop reminding them once they have, on every device.
-- Holds no secret: only when it was saved and how many reminders were waved
-- off. A row for a different eth_address than the current wallet means the
-- wallet was replaced and the new one is not backed up yet.
-- Idempotent so a re-run is harmless.

create table if not exists public.wallet_backup_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  eth_address text not null,
  backed_up_at timestamptz,
  reminders_dismissed integer not null default 0,
  last_dismissed_at timestamptz,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.wallet_backup_status to authenticated;
grant all on public.wallet_backup_status to service_role;

alter table public.wallet_backup_status enable row level security;

drop policy if exists "Users manage own wallet backup status" on public.wallet_backup_status;
create policy "Users manage own wallet backup status" on public.wallet_backup_status
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
