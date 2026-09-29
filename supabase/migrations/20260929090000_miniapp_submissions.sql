-- Mini app submissions: who submitted an app, and the reviewer's note.
-- Already applied to the database; idempotent so a re-run is harmless.
alter table public.miniapp_apps
  add column if not exists submitted_by text check (submitted_by is null or submitted_by ~ '^0x[a-f0-9]{40}$'),
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz;

create index if not exists miniapp_apps_submitted_by_idx on public.miniapp_apps (submitted_by);
