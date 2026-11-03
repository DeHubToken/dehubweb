-- Mini app review queue. A submitted app goes live at once as unlisted; staff
-- then approve it into the store (tier listed/verified) or reject it with a
-- reason the developer sees on /apps/dev. `status` stays the live/suspended
-- switch; `review_state` is only about the store listing.
alter table public.miniapp_apps
  add column if not exists review_state text check (review_state is null or review_state in ('pending', 'approved', 'rejected')),
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text;

-- Unlisted live apps already waiting are in the queue from day one.
update public.miniapp_apps
   set review_state = 'pending', submitted_at = coalesce(submitted_at, updated_at, created_at)
 where review_state is null and tier = 'unlisted' and status = 'live';

update public.miniapp_apps
   set review_state = 'approved'
 where review_state is null and tier in ('listed', 'verified');

create index if not exists miniapp_apps_review_idx on public.miniapp_apps (review_state, submitted_at);
