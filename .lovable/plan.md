

## Plan: Standalone Events Page + Community Events Tab

### Overview
Create a standalone `/app/events` page (Facebook-style) where any user can create public events, and also add an "Events" tab inside each community page for community-specific events. Both use the same database tables.

### Database

**Table: `community_events`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| community_id | uuid, nullable | NULL = global event, set = community event |
| creator_wallet_address | text | |
| creator_username | text, nullable | |
| creator_avatar | text, nullable | |
| title | text | |
| description | text, nullable | |
| cover_image_url | text, nullable | stored in `community-media` bucket |
| location | text, nullable | free-text (URL, address, "Discord", etc.) |
| starts_at | timestamptz | |
| ends_at | timestamptz, nullable | |
| going_count | int, default 0 | denormalized |
| interested_count | int, default 0 | denormalized |
| created_at | timestamptz, default now() | |

RLS: Anyone SELECT. Authenticated users INSERT (wallet check). Creator UPDATE/DELETE.

**Table: `community_event_rsvps`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| event_id | uuid, references community_events | |
| wallet_address | text | |
| status | text | 'going' or 'interested' |
| created_at | timestamptz, default now() | |
| UNIQUE(event_id, wallet_address) | | |

RLS: Anyone SELECT. Users INSERT/UPDATE/DELETE own rows (wallet check).

**Trigger**: On RSVP insert/update/delete, recalculate `going_count` and `interested_count` on the parent event.

### New Files

1. **`src/pages/app/EventsPage.tsx`** -- Standalone events page
   - Header with "Events" title + "Create Event" button
   - Tabs: Upcoming / Past / My Events
   - Event cards showing: cover image, title, date/time, location, going/interested counts
   - Clicking a card opens `EventDetailDrawer`

2. **`src/components/app/events/EventCard.tsx`** -- Reusable event card
   - Cover image with date overlay badge
   - Title, location, time range
   - Going/Interested counts with icons

3. **`src/components/app/events/CreateEventDrawer.tsx`** -- Drawer form
   - Title, description, location inputs
   - Date/time pickers (start + optional end)
   - Cover image upload
   - Optional community selector (if creating from standalone page)

4. **`src/components/app/events/EventDetailDrawer.tsx`** -- Expanded view
   - Full cover image, description, location, time
   - RSVP buttons: Going / Interested (toggle)
   - Attendee list (going + interested)
   - Edit/delete for creator

5. **`src/hooks/use-events.ts`** -- Data hooks
   - `useEvents(communityId?)` -- fetch events, optionally filtered by community
   - `useEventRsvp(eventId)` -- user's RSVP + toggle mutation
   - `useCreateEvent()` / `useDeleteEvent()`

### Modified Files

| File | Change |
|------|--------|
| `src/App.tsx` | Add `events` route under `/app` |
| `src/components/app/PersistentPageCache.tsx` | Add `events` cached page entry |
| `src/constants/app.constants.ts` | Add Events nav item (Calendar icon) |
| `src/pages/app/CommunityPage.tsx` | Add "Events" tab rendering `CommunityEvents` filtered by community ID |

### Nav Item
Add between Communities and Stages in `NAV_ITEMS`:
```
{ icon: CalendarDays, label: 'Events', path: '/app/events' }
```

### Technical Details
- Uses `withWalletHeader` for all Supabase calls (consistent with project RLS pattern)
- Cover images uploaded to existing `community-media` bucket
- `community_id = NULL` means global/standalone event; set means community-scoped
- Community Events tab reuses the same components, just passes `communityId` filter

