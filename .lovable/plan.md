

## Communities Feature — Revised Plan

### Key Changes from Previous Plan

1. **Membership-gated feed**: Anyone can tag a post with a community category, but the community feed only shows posts from members. Non-member posts with that tag still appear in the global feed / explore — just not inside the community page.

2. **Community toggle in PostModal**: A new "Community" toggle sits below the existing "Category" toggle in `PostAccessToggles`. When enabled, it shows the user's joined communities as selectable options. Selecting a community adds `community:{slug}` as a category (same `|||`-delimited string). Fully backward compatible — the DeHub API treats it as a normal category.

3. **Pin communities to profile**: Users can pin up to 3 communities to their profile, displayed as small badges/chips under their bio in `ProfileHeader`.

---

### Database (3 tables, 1 storage bucket)

**`communities`** — metadata
- id, name, slug (unique), description, avatar_url, banner_url, creator_wallet_address, is_private (default false), member_count (default 1), rules (jsonb), created_at, updated_at
- RLS: public SELECT; creator can UPDATE/DELETE; wallet-auth INSERT

**`community_members`** — membership + roles
- id, community_id (FK), wallet_address, role (text: owner/admin/moderator/member), status (text: active/pending/banned), joined_at
- Unique on (community_id, wallet_address)
- Trigger: auto-increment/decrement `communities.member_count`
- RLS: public SELECT; wallet-owner INSERT/DELETE; owner/admin UPDATE

**`pinned_communities`** — profile pins
- id, wallet_address, community_id (FK), display_order (int), created_at
- Unique on (wallet_address, community_id), max 3 enforced client-side
- RLS: public SELECT; wallet-owner INSERT/DELETE

**Storage bucket**: `community-media` (public) for avatars and banners

---

### Post Creation Integration

In `PostAccessToggles.tsx`, add a **"Community"** toggle row (with Users icon) below the existing Category toggle:
- Only visible to logged-in users who belong to at least one community
- When toggled on, shows a drawer listing the user's communities (fetched from `community_members`)
- Selecting a community adds `community:{slug}` to the same `selectedCategory` state using the existing `|||` delimiter
- Result: the `mintPost` call sends it as a regular category — zero API changes needed
- Community chips appear alongside category chips with a distinct icon

---

### Community Feed Filtering

On `CommunityPage`, the feed calls `searchNFTs({ category: "community:{slug}" })` but then **client-side filters** results to only show posts from addresses that exist in `community_members` for that community. This ensures:
- Anyone can use the tag (it's just a category)
- Only member posts appear in the community feed
- Non-member tagged posts still show in global/explore feeds

---

### Profile Pinned Communities

In `ProfileHeader.tsx`, after the bio section, render pinned community chips:
- Query `pinned_communities` joined with `communities` for the profile's wallet address
- Display as small clickable chips (avatar + name) linking to `/app/communities/:slug`
- Own profile shows a "+" button to pin/unpin from joined communities

---

### Pages & Routes

1. **CommunitiesPage** (`/app/communities`) — "Your Communities" + "Discover" tabs, create button
2. **CommunityPage** (`/app/communities/:slug`) — header, member-filtered feed, members tab, about/rules tab
3. Add "Communities" nav item to sidebar

---

### Implementation Order

1. Database migration (3 tables + triggers + RLS)
2. Create `community-media` storage bucket
3. Build `CommunitiesPage` + `CreateCommunityModal`
4. Build `CommunityPage` with member-filtered feed
5. Add "Community" toggle to `PostAccessToggles`
6. Add pinned communities to `ProfileHeader`
7. Add nav item + routes to `App.tsx` and `PersistentPageCache`

