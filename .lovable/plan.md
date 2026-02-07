

## Feature Request Page (`/features`)

A community-driven feature request board where logged-in users can submit ideas and all users can vote them up or down. Think of it as a lightweight "Canny" or "UserVoice" built directly into DeHub.

---

### What users will see

**Header Section**
- Page title "Feature Requests" with a lightbulb icon
- Subtitle showing total request count
- "Submit Feature" button (opens a form modal/drawer for logged-in users, triggers login for others)

**Filter/Sort Bar**
- Category filter pills: All, UI/UX, Performance, New Feature, Bug Fix, Integration
- Sort options: Most Voted, Newest, Trending (most votes in last 7 days)
- Search bar to filter by title/description

**Feature Request Cards**
- Each card shows: title, description (truncated), category badge, author info (avatar + username), vote count, comment count, and creation date
- Left side: vote buttons (up arrow / down arrow) with net vote count between them
- Status badge: Open, Under Review, Planned, In Progress, Completed, Declined
- Clicking a card expands it inline to show the full description

**Submit Feature Form (Drawer)**
- Title input (required, max 100 chars)
- Description textarea (required, max 1000 chars) 
- Category selector dropdown
- Submit button with loading state

**Empty State**
- Friendly message encouraging the first feature request

---

### Database Design

Two new tables:

**`feature_requests`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Auto-generated |
| title | text | Required, max 100 chars |
| description | text | Required, max 1000 chars |
| category | text | One of: ui_ux, performance, new_feature, bug_fix, integration, other |
| status | text | Default: 'open'. One of: open, under_review, planned, in_progress, completed, declined |
| author_wallet_address | text | Wallet address of submitter |
| author_username | text | Cached at time of submission |
| author_avatar | text | Cached at time of submission |
| vote_count | integer | Denormalized net votes (upvotes - downvotes), default 0 |
| comment_count | integer | Reserved for future use, default 0 |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

**`feature_request_votes`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Auto-generated |
| feature_request_id | uuid (FK) | References feature_requests.id |
| wallet_address | text | Voter's wallet |
| vote_type | integer | +1 for upvote, -1 for downvote |
| created_at | timestamptz | Default now() |
| **UNIQUE** | | (feature_request_id, wallet_address) -- one vote per user per request |

**RLS Policies:**
- `feature_requests`: SELECT open to everyone (anon + authenticated). INSERT for authenticated users only. UPDATE/DELETE restricted to the author (matching wallet address).
- `feature_request_votes`: SELECT open to everyone. INSERT/UPDATE/DELETE for authenticated users only, scoped to their own wallet address.

**Database trigger**: On INSERT/UPDATE/DELETE on `feature_request_votes`, automatically recalculate `vote_count` on the parent `feature_requests` row.

---

### Technical Implementation

**1. Database Migration**
- Create both tables with proper indexes
- Add RLS policies
- Create a trigger function to sync `vote_count`
- Enable realtime on `feature_requests` for live vote count updates

**2. New Page: `src/pages/app/FeaturesPage.tsx`**
- Follows the existing page pattern (see LeaderboardPage, BookmarksPage)
- Uses `useQuery` for fetching feature requests with sort/filter params
- Optimistic voting UI (instant visual feedback, rollback on error)
- Submit form uses a Drawer component (matching app's glass morphism style)
- Zod validation for the submission form
- Category pills with horizontal scroll on mobile

**3. New Hook: `src/hooks/use-feature-requests.ts`**
- `useFeatureRequests(sort, category, search)` -- paginated query
- `useSubmitFeatureRequest()` -- mutation with optimistic update
- `useVoteFeatureRequest()` -- mutation with optimistic vote count update
- Uses Supabase client directly (not the DeHub API)

**4. Routing**
- Add route `/app/features` inside the AppLayout routes in `App.tsx`
- Also add `/features` as a top-level redirect to `/app/features` so `dehub.io/features` works
- Place the route ABOVE the `/:username` catch-all to prevent it from being treated as a username

**5. Navigation**
- No sidebar nav item added (keep sidebar clean) -- accessible via direct URL or a link from settings/about

**6. Design Consistency**
- Black/white palette only (zinc scale)
- Rounded-2xl cards on zinc-900 backgrounds
- Glass morphism drawer for submission form
- Vote buttons use `bg-zinc-800 hover:bg-zinc-700` with white text
- Active upvote: white fill. Active downvote: white fill. Matching the existing action bar pattern.
- Category badges use `bg-zinc-800 text-zinc-300` style

---

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/pages/app/FeaturesPage.tsx` | **Create** -- Main page component |
| `src/hooks/use-feature-requests.ts` | **Create** -- Data fetching and mutations |
| `src/App.tsx` | **Modify** -- Add route for `/features` and `/app/features` |
| Database migration | **Create** -- Tables, RLS, trigger |

---

### Security Considerations

- RLS ensures users can only create/edit/delete their own requests and votes
- Input validation with Zod on the client side (title max 100 chars, description max 1000 chars)
- Wallet address is read from auth context, never from user input
- The `vote_count` trigger runs as a database function (SECURITY DEFINER) to prevent manipulation
- One vote per user per feature request enforced at the database level via UNIQUE constraint
