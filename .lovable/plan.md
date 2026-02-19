
## Root Cause: Non-Wallet User IDs Being Sent as Members

The "requires 2 people to create" error comes directly from the DeHub API. Our app sends `members: memberAddresses` to `POST /api/dm/group`, and the API rejects it.

The bug is in this line of `CreateGroupModal.tsx`:

```typescript
const memberAddresses = selectedMembers
  .map(m => m.address || m._id)  // ← m._id is a MongoDB ObjectId, NOT a wallet address
  .filter(Boolean);
```

When a selected user doesn't have a `m.address` field populated (some API search results return users with only `_id`), the code falls back to `m._id` — a MongoDB ObjectId like `"6823ab12ef..."`. The DeHub API doesn't recognise MongoDB ObjectIds as valid member addresses, silently drops them, and ends up with fewer than 2 valid members — hence the "requires 2 people" error.

There's a secondary issue: the case-sensitive `includes()` check for the creator's own wallet address may fail if the casing differs between AuthContext's `walletAddress` and the API's returned `m.address`, potentially duplicating the creator entry.

---

## The Fix — `src/components/app/chat/CreateGroupModal.tsx`

### 1. Only use wallet addresses (filter out MongoDB ObjectIds)

After mapping, filter to only include strings that look like Ethereum wallet addresses (start with `0x` and are 42 chars), discarding `_id` fallbacks:

```typescript
const memberAddresses = selectedMembers
  .map(m => m.address)           // only use wallet address, never _id
  .filter((addr): addr is string => !!addr && addr.startsWith('0x'));
```

This means if a user in search results has no `address`, they simply won't be added — which is correct, because a non-wallet user can't be in a group chat that uses wallet-based addressing.

### 2. Fix case-insensitive creator address dedup

Use `.toLowerCase()` for the includes check so checksummed vs lowercase wallet addresses don't cause double-insertion:

```typescript
const lowerAddresses = memberAddresses.map(a => a.toLowerCase());
if (walletAddress && !lowerAddresses.includes(walletAddress.toLowerCase())) {
  memberAddresses.push(walletAddress);
}
```

### 3. Validate before submitting

Add a guard that shows a clear error before hitting the API if fewer than 2 valid wallet-address members were selected (e.g. user picked users with no wallet address):

```typescript
if (memberAddresses.length < 2) {
  toast.error('Please select at least 2 members with wallet addresses');
  return;
}
```

Wait — per the memory note, the creator is included in `memberAddresses` before sending. So the minimum valid count before pushing the creator is 1 (creator + 1 = 2 total). The current guard `selectedMembers.length === 0` allows 1 selected member which should be fine as long as the creator is also pushed. The real issue is that `_id` values are being sent instead of wallet addresses.

---

## Files to Change

- `src/components/app/chat/CreateGroupModal.tsx` — fix `memberAddresses` mapping to only use `m.address`, fix case-insensitive creator dedup, and optionally surface a clearer error if a selected user has no wallet address
