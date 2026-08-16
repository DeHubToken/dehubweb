-- ============================================================================
-- Orders are written by the server, not the browser.
--
-- "Buyers can create orders" allowed any client to INSERT a store_orders row
-- as long as buyer_address matched get_request_wallet_address(), which reads
-- the unsigned x-wallet-address header the client sets itself. Everything that
-- makes an order an order — tx_hash, amount, seller_address — came from the
-- same client, and nothing checked that the transaction existed, went to the
-- seller, moved DHB, or moved enough of it. store_orders.status defaults to
-- 'paid' and notify_store_order tells the seller they sold something, so a
-- fabricated row was indistinguishable from a real sale.
--
-- Both surfaces now go through the live-checkout edge function, which quotes
-- server-side and reads the Transfer log off Base before inserting. That runs
-- under the service role, which bypasses RLS — so removing this policy closes
-- the hole without taking anything working away with it.
--
-- SELECT and UPDATE are left alone: buyers and sellers still read their own
-- orders and still move status through shipped/delivered/cancelled.
-- ============================================================================

DROP POLICY IF EXISTS "Buyers can create orders" ON public.store_orders;

-- Marketplace orders are verified from this point on. Rows written before it
-- were not, and the column is NULL on all of them — worth knowing when
-- reconciling a disputed sale, so say so rather than backfilling a timestamp
-- that would claim a check that never ran.
COMMENT ON COLUMN public.store_orders.verified_at IS
  'When the payment was read back off-chain. NULL on orders predating server-side verification.';
