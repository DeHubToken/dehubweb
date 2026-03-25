

## Why Tip Payment Takes So Long + Speed Optimization

### Root Cause

The delay is **not an API limitation** — the on-chain transaction itself confirms in ~2 seconds (as you've seen). The slowness comes from **7+ sequential RPC calls** before and after the transaction, each adding 500ms-1.5s of latency:

1. Switch chain (~500ms)
2. Get wallet address (~500ms)
3. Check DHB balance (~800ms)
4. Check DHB allowance (~800ms)
5. First-time only: approval transaction + wait (~3-4s)
6. Gas estimation (~800ms)
7. Send transaction (~1s)
8. Wait for receipt/confirmation polling (~2-3s)

Total: ~7-10s even though the actual tx confirms fast.

### Plan to Cut It Down to ~3-4s

**File: `src/lib/contracts/stream-controller.ts`**

1. **Parallelize balance + allowance checks** — run `getDHBBalance` and `getDHBAllowance` simultaneously instead of sequentially (saves ~800ms)

2. **Skip balance check when we already checked in the UI** — the DM fee gate already checks balance before showing the pay button. Add an optional `skipBalanceCheck` flag to `sendTip` so it skips the redundant on-chain balance read (saves ~800ms)

3. **Cache allowance state** — after the first max-approval, cache that we've approved so subsequent tips skip the allowance check entirely (saves ~800ms per subsequent tip)

**File: `src/components/app/chat/DirectMessageChat.tsx`**

4. **Remove redundant balance check in handleSend** — the fee gate UI already validates balance. Remove the second `getERC20Balance` call inside `handleSend` before calling `sendTip` (saves ~800ms)

### Technical Details

```text
Current flow (sequential):
  switchChain → getAddress → getBalance → getAllowance → [approve] → estimateGas → sendTx → waitReceipt
  ~~~500ms~~ + ~~500ms~~ + ~~800ms~~ + ~~800ms~~ + [3s] + ~~800ms~~ + ~~1s~~ + ~~2s~~

Optimized flow:
  switchChain → getAddress → [balance+allowance parallel] → estimateGas → sendTx → waitReceipt
  ~~~500ms~~ + ~~500ms~~ + ~~~~~~800ms~~~~~~ + ~~800ms~~ + ~~1s~~ + ~~2s~~
```

Net savings: ~1.5-2.5s on every tip, more on repeat tips with cached allowance.

