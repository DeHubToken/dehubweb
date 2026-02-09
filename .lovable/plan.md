

# Fix: Voting (Likes/Dislikes) Broken Everywhere

## Problem

There are two vote functions in `src/lib/api/dehub.ts`:

- **`voteOnNFT`** (line 846) -- sends `{ streamTokenId: number, vote: boolean }` -- **correct format**
- **`voteOnPost`** (line 3472) -- sends `{ tokenId: number, voteType: 'for' | 'against' }` -- **wrong format**

Both `ActionBar` and `ShortsViewer` use `voteOnPost`, which sends the wrong field names. The API rejects the request and every vote fails with "Failed to vote."

## Fix

### File: `src/lib/api/dehub.ts` (~line 3476-3483)

Update the request body in `voteOnPost` to match what the API actually expects (same format that `voteOnNFT` already uses correctly):

```text
Current (broken):
  body: { tokenId: params.tokenId, voteType: params.voteType }

Fixed:
  body: { streamTokenId: params.tokenId, vote: params.voteType === 'for' }
```

That is the only change needed. Both `ActionBar` and `ShortsViewer` call `voteOnPost` with the same interface, so this single fix resolves voting everywhere.

