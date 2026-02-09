
# Improvement Sprint: 13 Fixes and Enhancements

A task list covering all 13 identified improvements from the end-to-end audit, organized for efficient implementation.

---

## Task List

### 1. Restrict "End Stream" to Creator Only
**File:** `src/components/app/cards/LiveStreamCard.tsx`
- Add a creator ownership check comparing `stream.creatorId` against the current user's wallet address / user ID from `useAuth()`
- Only render the "End Stream" dropdown item when the current user is the stream creator
- Change from: `{!streamEnded && isAuthenticated && (...)}` to: `{!streamEnded && isAuthenticated && isOwner && (...)}`

### 2. Show Balance in Gift Drawer
**File:** `src/components/app/cards/LiveStreamCard.tsx`
- Import and use the coin balance hook or fetch the user's DHB/USDC balance
- Display the balance above the amount input inside the Gift Drawer as a small text line: "Your balance: X DHB"
- Update dynamically when currency toggles between DHB and USDC

### 3. Add Confirmation Dialog Before Subscribing
**File:** `src/components/app/subscriptions/PlanCard.tsx`
- Wrap the subscribe action with an `AlertDialog` confirmation
- Show the plan name, price, and duration in the dialog body
- Require explicit "Confirm" click before calling `buyPlanMutation.mutateAsync`

### 4. Add Success Feedback After Subscribing
**File:** `src/components/app/subscriptions/PlanCard.tsx`
- After successful `buyPlanMutation`, show a toast success notification ("Successfully subscribed to {plan.name}!")
- Add error handling toast for failed subscriptions
- Show a brief checkmark animation or transition the button state

### 5. Build Shared Videos Gallery Drawer
**File:** `src/components/app/chat/DirectMessageChat.tsx`
- Replace the current toast-only `getDMVideos` handler with a Drawer component
- The drawer shows a grid of video thumbnails fetched from the API
- Each item links to the video or plays inline
- Show empty state if no videos found

### 6. Add "Add Member" to Group Settings
**File:** `src/components/app/chat/GroupSettingsDrawer.tsx`
- Add an "Add Member" button that opens a user search input
- Use the existing `/api/search` endpoint with `type: accounts` to find users
- Call the group update/join endpoint to add the selected user
- Show the new member in the list after adding

### 7. Online Status Indicator Already Implemented
**File:** `src/pages/app/MessagesPage.tsx`
- This was already implemented during the audit review. The `ConversationItem` component fetches `getUserOnlineStatus` and renders a green dot.
- **No changes needed** -- mark as done.

### 8. Add "Unban" to LiveChat Message Menu
**File:** `src/components/app/chat/ChatMessage.tsx`
- Add an "Unban User" option to the message dropdown alongside "Ban User"
- Pass an `onUnban` callback prop from `PublicChat.tsx`
- In `PublicChat.tsx`, wire the handler to call `unbanLiveChatUser(roomId, userId)`
- Show "Unban" only if the user is known to be banned (via profile data or conditional display)

### 9. Show Moderator Badge Next to LiveChat Names
**File:** `src/components/app/chat/ChatMessage.tsx`
- Fetch the user's profile using `useLiveChatUser` (already available in the component via `UserProfilePopover`)
- Display a small shield/moderator badge inline next to the username for moderator users
- Use a subtle green shield icon (`ShieldCheck`) with a small size

### 10. Fix Comment Edit Pre-fill Edge Case
**File:** `src/components/app/cards/CommentsSection.tsx`
- The `handleEditComment` currently receives `commentId` and `newContent` -- the edit UI in the comment component handles pre-filling
- Inspect the comment component's edit mode to ensure the `text` field is always correctly read from the comment object regardless of API response shape (check for `content` vs `text` vs `body` field names)

### 11. Wire Transaction Time Filters
**File:** `src/components/app/command-centre/TransactionsTab.tsx`
- Currently `activeFilter` state updates but doesn't filter data
- Add client-side date filtering: compute a `startDate` based on the selected filter (1h = 1 hour ago, 1d = 1 day ago, etc.)
- Filter the transactions array and re-derive `chartData` and `breakdownData` from the filtered subset
- Pass `activeFilter` into the `useQuery` key or filter in a `useMemo`

### 12. Dynamic Block Explorer Links
**File:** `src/components/app/command-centre/TransactionsTab.tsx` and `src/lib/api/dpay.ts`
- Add `chainId` to the `DPayTransaction` type in `dpay.ts` (extract from API response)
- In the transaction table, use `chainId` to determine the correct explorer URL:
  - `chainId === 56` -> `https://bscscan.com/tx/`
  - `chainId === 8453` (or default) -> `https://basescan.org/tx/`

### 13. Wire Reports Admin Endpoints
**Files:** New `src/pages/app/ReportsPage.tsx` or integrate into existing admin UI
- Wire `getAllReports` and `getReportsForNFT` endpoints
- Create a simple reports list view with post links
- This is lower priority and only useful if an admin dashboard exists

---

## Implementation Order

The tasks are grouped into 4 batches for efficient parallel editing:

**Batch 1 -- Quick Fixes (Tasks 1, 11, 12):**
Straightforward logic changes in existing components with minimal UI impact.

**Batch 2 -- UX Polish (Tasks 2, 3, 4, 10):**
Adding confirmation dialogs, balance displays, and fixing edge cases.

**Batch 3 -- Feature Additions (Tasks 5, 6, 8, 9):**
New UI components: Shared Videos drawer, Add Member flow, Unban option, moderator badges.

**Batch 4 -- Admin/Optional (Task 13):**
Reports admin -- lowest priority, only if needed.

Task 7 is already complete (online status dot).

---

## Technical Notes

- All API functions are centralized in `src/lib/api/dehub.ts` and `src/lib/api/dpay.ts`
- The `useAuth()` hook provides `walletAddress`, `user`, and `isAuthenticated`
- The liquid glass design system (`bg-black/40`, `backdrop-blur-[24px]`, `rounded-xl`) applies to all new drawers and dialogs
- Transaction filtering will use `date-fns` utilities already imported in the project
- The `DPayTransaction.chainId` field needs to be added to the type and extracted during API response mapping
