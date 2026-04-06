

## Add Buy Bot Alerts to Public Chat and Sidebar

### Overview
Extract the existing buy alert card from community chat into a shared component, then inject live buy alerts into both the sidebar chat panel and the full-screen public chat (Messages page).

### Architecture
The buy bot currently posts to the `community_chat_messages` Supabase table with `message_type = 'buy_alert'`. Public chat uses a separate DeHub socket-based system. Rather than modifying the DeHub API, we'll fetch buy alerts directly from Supabase and merge them into the chat views.

### Steps

**1. Extract BuyAlertCard into shared component**
- Move `BuyAlertCard`, `BuyAlertData`, `fmt`, `fmtTokens` from `CommunityChat.tsx` into a new file `src/components/app/chat/BuyAlertCard.tsx`
- Update `CommunityChat.tsx` to import from the new shared location

**2. Create `useBuyAlerts` hook**
- New file `src/hooks/use-buy-alerts.ts`
- Queries `community_chat_messages` where `message_type = 'buy_alert'`, ordered by `created_at desc`, limit 50
- Subscribes to Supabase Realtime for new `buy_alert` inserts
- Returns an array of buy alert messages

**3. Integrate into SidebarChat**
- Import `useBuyAlerts` and `BuyAlertCard`
- Merge buy alerts into the message stream by timestamp
- Render `BuyAlertCard` for buy alert items instead of the normal message bubble

**4. Integrate into PublicChat**
- Same approach: import hook and component
- Merge buy alerts into the `filteredMessages` array by timestamp
- Render `BuyAlertCard` for buy alert entries

### Files to create
- `src/components/app/chat/BuyAlertCard.tsx`
- `src/hooks/use-buy-alerts.ts`

### Files to modify
- `src/components/app/communities/CommunityChat.tsx` — import from shared component
- `src/components/app/sidebar/SidebarChat.tsx` — add buy alerts
- `src/components/app/chat/PublicChat.tsx` — add buy alerts
- `src/components/app/chat/index.ts` — export new component

