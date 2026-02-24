

## Problem: Tips sent through the app bypass the tip contract

The `use-tip-payment.ts` hook sends DHB via a **direct ERC20 `transfer(creatorAddress, amount)`** — a simple wallet-to-wallet token transfer. It never routes through the tip contract (`0x4fa30dAef50c6dc8593470750F3c721CA3275581`).

However, the `backfill-tip-snapshots` edge function only tracks Transfer events **to/from the tip contract**. So tips sent through DeHub's own UI are completely invisible to the leaderboard's `sent_tips` and `received_tips` columns.

That 20 DHB you received? It was a direct ERC20 transfer from `0x26eeb...` to your wallet. The backfill function would never detect it because the tip contract wasn't involved.

---

## Root cause in code

**`src/hooks/use-tip-payment.ts` (line 83-89)**:
```typescript
// Sends directly to creatorAddress — no tip contract involved
const result = await writeContractAA(
  chainConfig.dhbToken,        // DHB token contract
  erc20TransferInterface,       // simple transfer ABI
  'transfer',
  [creatorAddress, amountWei],  // direct to creator
);
```

**`supabase/functions/backfill-tip-snapshots/index.ts` (lines 186-197)**:
```typescript
// Only finds transfers TO the tip contract (spent)
[TRANSFER_TOPIC, null, paddedContract]
// Only finds transfers FROM the tip contract (earned)
[TRANSFER_TOPIC, paddedContract, null]
```

A direct wallet-to-wallet transfer has neither `from` nor `to` as the tip contract, so it's missed entirely.

---

## Fix: Route tips through the StreamController contract

The proper fix is to make `use-tip-payment.ts` call the tip/StreamController contract instead of doing a raw ERC20 transfer. However, I need to verify whether the StreamController has a `tip(address, amount)` function or equivalent.

**Alternative approach** (if the contract doesn't have a tip function): Record tips in the database after a successful on-chain transfer, and have the backfill function also read from the database.

### Recommended: Hybrid approach

1. **Keep the direct ERC20 transfer** (it works, it's gas-efficient)
2. **After successful tx**, record the tip in the `tip_leaderboard_cache` table or a new `tip_transactions` table with sender, receiver, amount, tx_hash, chain_id
3. **Update `backfill-tip-snapshots`** to also read from this database table when computing sent/received tips, merging on-chain contract tips with recorded direct tips

### Implementation details

**Step 1 — Add tip recording after successful transfer in `use-tip-payment.ts`**:
After `result.wait(1)` succeeds, insert a record into a new `tip_records` table via Supabase with: sender, receiver, amount, chain_id, tx_hash, timestamp.

**Step 2 — Create `tip_records` table** (migration):
```sql
CREATE TABLE public.tip_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_address text NOT NULL,
  receiver_address text NOT NULL,
  amount numeric NOT NULL,
  chain_id integer NOT NULL DEFAULT 8453,
  tx_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tip_records ENABLE ROW LEVEL SECURITY;
-- Anyone can read tips
CREATE POLICY "Anyone can view tips" ON public.tip_records FOR SELECT USING (true);
-- Users can record their own sent tips
CREATE POLICY "Users can record sent tips" ON public.tip_records FOR INSERT
  WITH CHECK (lower(sender_address) = get_request_wallet_address());
```

**Step 3 — Update `backfill-tip-snapshots`** to also query `tip_records` for the relevant date range and merge those amounts into the spent/earned maps before writing to snapshots.

This way both contract-routed tips AND direct-transfer tips are tracked.

