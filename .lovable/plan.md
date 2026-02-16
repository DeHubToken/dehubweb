

# Fix: Group Creation "2 people must be added" Error

## Problem
The DeHub API endpoint `POST /api/dm/group` returns an error requiring at least 2 members. The current code sends only the selected members in the `members` field, but the API likely expects the creator's address to also be included in the members array -- meaning you need to select at least 2 *other* people, or the API counts total participants (including you) and needs 3+.

## Solution
Update the `handleCreateGroup` function to include the current user's wallet address in the `members` array sent to the API.

## Technical Details

### File: `src/components/app/chat/CreateGroupModal.tsx`

**Change**: In `handleCreateGroup`, append the current user's `walletAddress` to the `memberAddresses` array before sending it to the API.

```typescript
// Current code (line 127):
const memberAddresses = selectedMembers.map(m => m.address || m._id).filter(Boolean);

// Updated code:
const memberAddresses = selectedMembers.map(m => m.address || m._id).filter(Boolean);
if (walletAddress && !memberAddresses.includes(walletAddress)) {
  memberAddresses.push(walletAddress);
}
```

This ensures the API receives all participants including the creator, satisfying the minimum member requirement.

