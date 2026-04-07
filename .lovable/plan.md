

## Fix: Tip confirmation taking too long

### Problem
The current flow waits sequentially for: tx submission → on-chain block confirmation (~3-5s) → DB insert with retries → then shows success. That's 10-20 seconds of waiting after the user already signed the transaction.

### Solution: Hybrid approach — optimistic success + guaranteed background persistence

Show "Tip sent!" immediately after the transaction is **submitted** (not confirmed), then run confirmation + DB save in the background. If the background DB save fails, show a delayed error toast so the user knows.

This gives the best of both worlds:
- **Fast UX**: Success shown in ~1-2 seconds
- **Data integrity**: DB save still happens reliably with retries
- **No silent failures**: If DB save fails after retries, a warning toast appears

### Changes to `src/hooks/use-tip-payment.ts`

1. After `sendTip()` returns with the tx hash, immediately:
   - Show success toast
   - Call `onSuccess()` (triggers optimistic UI update)
   - Close modal / reset state

2. In the background (fire-and-forget with error handling):
   - Await `tipResult.confirmed` (block confirmation)
   - Call `persistTipRecord()` with retries
   - If DB save fails after all retries, show a warning toast: "Tip confirmed but failed to record — contact support"

3. Remove the intermediate "Confirming on chain..." and "Saving tip record..." loading toasts — user shouldn't have to watch these

### Result
- **Before**: 10-20 second wait after signing
- **After**: ~1-2 second wait, background save handles the rest silently

