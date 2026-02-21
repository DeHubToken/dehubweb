
## Fix: Include PPV purchases in Balance Chart

**Problem**: The BalanceCard's balance history chart only uses DPay API transactions to reconstruct your balance over time. Since your recent activity was PPV purchases, the chart has no data and shows "No transaction history yet."

**Solution**: Merge PPV purchases from the database into the chart data, just like we already did for Recent Transactions and the Transactions tab.

### Changes

**File: `src/components/app/command-centre/BalanceCard.tsx`**

1. Import `supabase` client and add a query for `ppv_purchases` (same pattern used in `RecentTransactions.tsx`)
2. Merge PPV records into the transaction list before building the chart — map each PPV purchase to the same shape the `buildBalanceChart` function expects (with `type`, `amount`, `createdAt`)
3. For PPV transactions, set `type` based on whether the user is the buyer (debit) or creator (credit), so the balance reconstruction is accurate
4. Update the `buildBalanceChart` function to recognize PPV types (e.g., `ppv_buy`, `ppv_sale`) when determining credit vs debit

This ensures any PPV activity generates chart data points, so the balance history graph renders instead of showing the empty state.

### Technical Details

- Query: `supabase.from('ppv_purchases').select('*').or('buyer_address.ilike.{addr},creator_address.ilike.{addr}').order('created_at', { ascending: false }).limit(50)`
- Map PPV records to `DPayTransaction`-compatible shape with `type: 'ppv'`
- In `buildBalanceChart`, treat `type === 'ppv'` with buyer as debit, creator as credit
- Merge both arrays, sort by date, then build chart as before
