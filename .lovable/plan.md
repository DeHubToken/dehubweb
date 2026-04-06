

## Add Confirmation Dialog for Clear All History

### Problem
Clicking "Clear All" in the conversation history drawer immediately deletes all conversations with no way to undo. Users can accidentally lose their entire chat history.

### Solution
Add a confirmation step before clearing all conversations. When the user clicks "Clear All", show a confirmation state with "Are you sure?" and two buttons: "Cancel" and "Confirm".

### Implementation

**File: `src/components/app/assistant/ConversationHistoryDrawer.tsx`**

1. Add a `showClearConfirm` boolean state
2. When "Clear All" is clicked, set `showClearConfirm = true` instead of immediately deleting
3. Replace the button with a confirmation UI showing "Are you sure?" with Cancel and Confirm buttons
4. Cancel resets the state; Confirm calls the existing `handleClearAll` and resets the confirm state
5. Auto-reset `showClearConfirm` when the drawer closes

### UI Detail
The confirmation replaces the "Clear All" button inline — no modal/dialog needed. Two small buttons appear: a white "Cancel" and a red "Yes, Clear" button, keeping the interaction lightweight and contextual.

### Files Changed
- `src/components/app/assistant/ConversationHistoryDrawer.tsx` — ~15 lines added

