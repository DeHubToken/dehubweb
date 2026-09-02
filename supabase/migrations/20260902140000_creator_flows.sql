-- Creator Flow — node-based generation pipelines on /creator/flow.
--
-- A flow (heliosgen calls them "spaces") is one canvas: its nodes, edges and
-- viewport live in a single jsonb blob because the client is the source of
-- truth for the graph and rewrites it whole on every debounced save. The row
-- exists so a flow survives the browser, follows the wallet between devices,
-- and can be shared read-only when is_public flips on.
--
-- Ids are client-generated (text, not uuid): a flow is created and edited
-- offline first and only reaches this table once the owner signs in, so the
-- id has to exist before the row does.
--
-- Service-role only for writes, via the creator-flows edge function
-- (wallet-native auth, same shape as builder-api). One anon SELECT policy
-- exists so a public flow can be read straight from PostgREST — that is what
-- the SEO worker uses to build a share card for /creator/flow/<id>.

create table if not exists public.creator_flows (
  id          text primary key,
  wallet      text not null,
  name        text not null default 'Flow 1',
  data        jsonb not null default '{}'::jsonb,
  is_public   boolean not null default false,
  -- First finished image in the flow, denormalised so a share card does not
  -- have to walk the graph.
  cover_url   text,
  node_count  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.creator_flows is
  'Creator Flow canvases: nodes/edges/viewport as one jsonb blob per flow. Written by the creator-flows edge function only; readable anonymously when is_public.';

create index if not exists creator_flows_wallet_idx
  on public.creator_flows (wallet, updated_at desc);

create index if not exists creator_flows_public_idx
  on public.creator_flows (is_public, updated_at desc)
  where is_public;

alter table public.creator_flows enable row level security;

drop policy if exists "anyone reads public creator flows" on public.creator_flows;
create policy "anyone reads public creator flows"
  on public.creator_flows for select
  using (is_public = true);

-- ── Folders over the generation library ──────────────────────────────────────
--
-- The library itself is client-side (generationStore, localStorage per
-- wallet), so a folder only ever holds job ids. The membership table is what
-- lets the same folders show up on another device once the jobs sync there.

create table if not exists public.creator_folders (
  id          uuid primary key default gen_random_uuid(),
  wallet      text not null,
  name        text not null,
  parent_id   uuid references public.creator_folders(id) on delete cascade,
  order_index integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.creator_folders is
  'Folders a creator sorts their generation library into. Service-role only (creator-flows edge function).';

create index if not exists creator_folders_wallet_idx
  on public.creator_folders (wallet, order_index);

create table if not exists public.creator_folder_items (
  folder_id   uuid not null references public.creator_folders(id) on delete cascade,
  item_id     text not null,
  wallet      text not null,
  created_at  timestamptz not null default now(),
  primary key (folder_id, item_id)
);

comment on table public.creator_folder_items is
  'Generation job ids filed under a creator folder. Service-role only.';

create index if not exists creator_folder_items_wallet_idx
  on public.creator_folder_items (wallet);

alter table public.creator_folders enable row level security;
alter table public.creator_folder_items enable row level security;
