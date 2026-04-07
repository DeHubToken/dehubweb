

## Why Tips Take So Long — Analysis & Fix Plan

### Root Cause

The tip flow has several sequential steps, each making RPC calls:

1. **`switchChain()`** — checks current chain, switches if needed
2. **`getWalletAddress()`** — RPC call
3. **Balance + Allowance check** — 2 parallel RPC calls (good), but on first tip per session this always runs
4. **Approval tx** (first time only) — sends approval tx, then `wait(1)` polls every 2s until confirmed
5. **Send tip tx** — sends the actual tip
6. **`result.wait(1)`** — polls every 2s until receipt is found

Even though the on-chain confirmation is fast (~2s on Base), each RPC call adds 200-500ms, and the 2s polling interval means you might wait up to 2s after the tx is already confirmed.

### Proposed Optimizations

**1. Return tx hash immediately after submission, don't wait for confirmation**
- The user sees "Tip sent!" as soon as the tx is submitted (the hash is known)
- Show a subtle "confirming..." state but don't block the UI
- Record the tip in the DB immediately with a `pending` status
- This alone cuts perceived time by ~2-4 seconds

**2. Reduce poll interval from 2s to 500ms**
- Base blocks are ~2s, so 500ms polling catches confirmation much faster
- Only applies to Web3Auth path (wagmi already uses its own receipt watcher)

**3. Skip redundant `getWalletAddress()` call**
- `use-tip-payment.ts` already has `walletAddress` from context but then calls `getWalletAddress()` again inside `sendTip()`
- Pass it through to avoid the extra RPC round-trip

**4. Cache-aware approval skip**
- Already partially implemented (`approvedChains` Set), but the allowance RPC still fires on first tip
- After a successful max-approval, persist to sessionStorage so it survives page navigation

### Files to Change

| File | Change |
|------|--------|
| `src/lib/contracts/aa-utils.ts` | Reduce poll interval from 2000ms to 500ms |
| `src/lib/contracts/stream-controller.ts` | Return tx hash immediately after submission; make `wait()` optional/background |
| `src/hooks/use-tip-payment.ts` | Don't await confirmation before showing success toast; fire DB insert + wait in background |
| `src/components/app/chat/DmTipDialog.tsx` | Same pattern — optimistic success on tx submission |

### User Experience After Fix

- **Before**: User clicks Send → waits 4-8 seconds → sees "Tip sent!"
- **After**: User clicks Send → waits 1-2 seconds (tx submission) → sees "Tip sent!" → confirmation happens silently in background

