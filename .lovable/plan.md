

## Fix: Posts taking 30 seconds after token is minted

### Problem
Same root cause as the tip delay we just fixed. `mintOnChain()` calls `result.wait(1)` which polls for on-chain confirmation (up to 60s at 500ms intervals). The entire post flow blocks on this before showing "Posted successfully" and creating the optimistic post.

The flow today:
1. Upload files + API call (`mintPost`) — variable time
2. Submit tx to chain — ~1-2s
3. **Wait for block confirmation** — 3-15s+ (this is the bottleneck)
4. Show success toast + create optimistic post

### Solution
Split `mintOnChain` into submission and confirmation, same pattern as tips:

1. **Submit tx** → immediately return the hash
2. **Show "Posted successfully"** + create optimistic post + close modal
3. **Background**: wait for confirmation silently; if it fails, show a warning toast

### Files to change

| File | Change |
|------|--------|
| `src/lib/contracts/stream-collection.ts` | Return both `hash` and a `confirmed` promise from `mintOnChain` instead of awaiting `result.wait(1)` synchronously. Return `{ hash, confirmed: result.wait(1).then(...) }` |
| `src/features/post/hooks/usePostForm.ts` | After getting `txHash` from `mintOnChain`, immediately show success + create optimistic post. Await `confirmed` in background with error handling (warning toast if confirmation fails) |
| `src/components/app/modals/QuotePostModal.tsx` | Same pattern — don't block on confirmation for quote posts |
| `src/components/app/modals/GoLiveModal.tsx` | Same pattern for live stream minting |

### Result
- **Before**: User waits 15-30s after clicking Post (upload + tx + confirmation)
- **After**: User waits only for upload + tx submission (~5-10s for video, ~2s for text), then modal closes. Confirmation happens silently in background.

