alter table public.builder_projects
  add column if not exists slug text,
  add column if not exists miniapp_app_id uuid references public.miniapp_apps(id) on delete set null;

update public.builder_projects
  set slug = 'app-' || substr(replace(id::text, '-', ''), 1, 10)
  where slug is null and version > 0;

create unique index if not exists builder_projects_slug_key on public.builder_projects (slug);

create table if not exists public.builder_versions (
  project_id uuid not null references public.builder_projects(id) on delete cascade,
  version integer not null,
  name text not null,
  emoji text not null,
  summary text not null default '',
  files jsonb not null,
  created_at timestamptz not null default now(),
  primary key (project_id, version)
);
alter table public.builder_versions enable row level security;

insert into public.builder_versions (project_id, version, name, emoji, summary, files)
select p.id, p.version, p.name, p.emoji, 'Before version history',
       jsonb_agg(jsonb_build_object('path', f.path, 'content', f.content) order by f.path)
from public.builder_projects p
join public.builder_files f on f.project_id = p.id
where p.version > 0
group by p.id
on conflict (project_id, version) do nothing;