

## Lock Down Public Chat: Remove Topic Switcher, Admin-Gate Create & Settings

### Changes

**File: `src/components/app/chat/PublicChat.tsx`**

1. **Remove the room selector dropdown** (lines 206-218) -- delete the `<select>` element entirely since there should only be one public chat room.

2. **Gate "Create new room" button to moderators only** (lines 219-233) -- change the condition from `isAuthenticated` to `isModerator` so only room moderators (admins) can create new topic rooms.

3. **Gate "Room Settings" button to moderators only** (lines 234-246) -- wrap the settings button in an `isModerator` check so only moderators can access room settings.

No other files need to change. The `CreateTopicRoomModal` and `RoomSettingsModal` components stay in the codebase but are only accessible to moderators.

### Technical Detail

Three targeted edits in `PublicChat.tsx`:
- Lines 206-218: Delete the `<select>` block
- Line 219: Change `{isAuthenticated && (` to `{isModerator && (`
- Lines 234-246: Wrap in `{isModerator && (...)}`

