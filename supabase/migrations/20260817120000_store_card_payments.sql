-- ============================================================================
-- Card payments for the marketplace, and the seller balance behind them
-- ============================================================================
-- Until now DeHub never touched the money. live-checkout verifies a buyer ->
-- seller DHB Transfer on Base and writes an order; the platform is not a party
-- to the payment and holds no balance for anyone.
--
-- A card sale is the first time that stops being true, so the shape matters:
--
--   * Stripe Connect Express, SEPARATE CHARGES AND TRANSFERS. The charge lands
--     on DeHub's marketplace Stripe balance; the seller's cut is transferred to
--     their own connected account 30 days later. Between those two moments the
--     money is inside Stripe, not in a DeHub bank account, and a refund or a
--     chargeback is one negative ledger row rather than a transfer reversal.
--     That is the entire reason for this shape over destination charges.
--   * There is NO balance accumulator. A balance is SUM(delta_cents) over the
--     ledger, partitioned by `available_at <= now()`. ai_credits keeps a
--     counter and can afford to, because credit never has to un-happen after it
--     matured. A card sale does: a dispute at day 45 must be recordable against
--     a balance already paid out. A counter with CHECK (>= 0) aborts that
--     transaction inside a webhook Stripe will retry forever. Rows can go
--     negative; counters cannot.
--   * Maturity is a clock predicate, never a job. There is no cron here:
--     migrations do not auto-apply on this project, so a design that needs a
--     scheduler to be correct has a manual step that can silently not happen.
--   * Money is integer cents everywhere. numeric + a JS double + a Stripe
--     integer is three representations that disagree about one price in twenty.
--
-- Everything here is written by edge functions under the service role. RLS
-- policies keyed on get_request_wallet_address() are advisory only — it reads
-- an unsigned header — so nothing that moves a cent sits behind one.

-- ============================================================================
-- 0. Prerequisite hardening of the existing store tables
-- ============================================================================

-- 0a. currency has said 'DHB' on every row since day one while price has always
--     been USD (live-checkout reads it straight into priceUsd). A fiat charge
--     against a column asserting DHB is a dispute waiting to be read out of the
--     database.
UPDATE public.store_listings SET currency = 'USD' WHERE currency IS DISTINCT FROM 'USD';
ALTER TABLE public.store_listings ALTER COLUMN currency SET DEFAULT 'USD';
ALTER TABLE public.store_listings
  DROP CONSTRAINT IF EXISTS store_listings_currency_usd;
ALTER TABLE public.store_listings
  ADD CONSTRAINT store_listings_currency_usd CHECK (currency = 'USD');

-- 0b. price NUMERIC has no scale, no floor and no ceiling. 19.999 is storable
--     today; round(19.999*100) charges 2000 cents while the order records
--     19.999, and the ledger can never be reconciled to Stripe again.
UPDATE public.store_listings SET price = round(price, 2) WHERE price <> round(price, 2);
UPDATE public.store_listings SET price = 100000 WHERE price > 100000;
UPDATE public.store_listings SET price = 0.01 WHERE price <= 0;
ALTER TABLE public.store_listings ALTER COLUMN price TYPE numeric(12,2);
ALTER TABLE public.store_listings
  DROP CONSTRAINT IF EXISTS store_listings_price_sane;
ALTER TABLE public.store_listings
  ADD CONSTRAINT store_listings_price_sane CHECK (price > 0 AND price <= 100000);

-- 0c. An order row is about to be the evidence for money that has moved.
--     `stores` DELETE was gated on the unsigned header, store_listings.store_id
--     cascades from it and store_orders.listing_id cascades from that. One
--     forged header, one anonymous DELETE, and every order for any seller is
--     gone — including the shipping address that is the only chargeback
--     evidence DeHub would have.
DROP POLICY IF EXISTS "Users can delete their own store" ON public.stores;
DROP POLICY IF EXISTS "Sellers can delete their own listings" ON public.store_listings;

COMMENT ON COLUMN public.store_listings.status IS
  'active | sold_out | archived. Deletion is service-role only: archive instead.';

ALTER TABLE public.store_orders DROP CONSTRAINT IF EXISTS store_orders_listing_id_fkey;
ALTER TABLE public.store_orders
  ADD CONSTRAINT store_orders_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES public.store_listings(id) ON DELETE RESTRICT;

-- 0d. The "Buyers can create orders" INSERT policy is DELIBERATELY LEFT IN
--     PLACE, against the advice this migration otherwise follows.
--
--     dehub-mobile's hooks/useStores.ts still inserts store_orders directly
--     from the client. Web moved onto the live-checkout edge function, but an
--     installed mobile binary cannot be force-updated — dropping the policy
--     here would break checkout on every phone already in the wild, instantly
--     and permanently, for however long it takes an App Store review plus user
--     adoption to catch up.
--
--     The correct close is: port mobile onto the edge function, ship it, wait
--     for adoption, THEN drop the policy in its own migration. Until that day
--     a forged x-wallet-address header can still insert a store_orders row it
--     does not own. Nothing in the card rail depends on that policy, and no
--     card money is reachable through it: every sensitive field lives on
--     store_card_intents, which has no anon policy at all, and the seller
--     ledger is credited only by store_card_order_settle under the service
--     role. A forged row is a fake crypto order, which is the exposure that
--     already exists today — this migration does not widen it.

-- 0e. The UPDATE policy stays (a seller must still mark an order shipped) but
--     the columns it can reach do not. RLS cannot restrict columns; GRANT can.
--     Without this a participant can rewrite seller_address to themselves, or
--     amount to anything, on any order they can see. This does NOT break
--     select('*') the way REVOKE SELECT would.
REVOKE UPDATE ON public.store_orders FROM anon, authenticated;
GRANT  UPDATE (status, shipping_address, notes) ON public.store_orders TO anon, authenticated;

-- 0f. Rail discriminator. `source` already means "which surface" (store | live),
--     not "which rail", so it cannot carry this.
ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'crypto';
ALTER TABLE public.store_orders
  DROP CONSTRAINT IF EXISTS store_orders_payment_method_known;
ALTER TABLE public.store_orders
  ADD CONSTRAINT store_orders_payment_method_known
  CHECK (payment_method IN ('crypto', 'card'));
COMMENT ON COLUMN public.store_orders.payment_method IS
  'crypto = verified DHB Transfer on Base. card = Stripe. No money columns live '
  'on this table: its UPDATE policy is resolved from an unsigned header, so '
  'anything a forger could move sits in store_card_intents instead.';

-- ============================================================================
-- 1. Seller payout accounts (Stripe Connect Express)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seller_payout_accounts (
  wallet_address text PRIMARY KEY
    CHECK (wallet_address ~ '^0x[0-9a-f]{40}$'),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
  stripe_account_id text NOT NULL,
  country text,
  -- Mirrored from account.updated. Never trusted stale: the checkout quote
  -- re-reads these, and a seller who has fallen out of verification loses the
  -- card button rather than accruing a balance that can never be transferred.
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  requirements_due jsonb,
  disabled_reason text,
  -- Anti-bust-out: until one transfer has actually cleared, a seller may earn
  -- at most this much by card, lifetime. Raised by hand from the admin panel.
  lifetime_cap_cents bigint NOT NULL DEFAULT 50000,
  first_payout_at timestamptz,
  onboarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, stripe_account_id)
);

DROP TRIGGER IF EXISTS update_seller_payout_accounts_updated_at ON public.seller_payout_accounts;
CREATE TRIGGER update_seller_payout_accounts_updated_at
BEFORE UPDATE ON public.seller_payout_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.seller_payout_accounts IS
  'One Stripe Express account per wallet. The row is inserted BEFORE the Stripe '
  'account is created, so two concurrent onboard calls cannot leave an orphan '
  'Express account under the platform. Stripe idempotency keys expire after 24h '
  'and are not the guard here — this primary key is.';

-- ============================================================================
-- 2. Card payment intents
-- ============================================================================
-- Created when the buyer opens Stripe Checkout; promoted to 'settled' by the
-- webhook. Every sensitive field (PaymentIntent id, buyer email, fee split)
-- lives here rather than on store_orders, and this table has no anon or
-- authenticated policy at all.

CREATE TABLE IF NOT EXISTS public.store_card_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'settled', 'expired', 'failed')),

  listing_id uuid NOT NULL REFERENCES public.store_listings(id) ON DELETE RESTRICT,
  buyer_address text NOT NULL CHECK (buyer_address ~ '^0x[0-9a-f]{40}$'),
  seller_address text NOT NULL CHECK (seller_address ~ '^0x[0-9a-f]{40}$'),
  stream_token_id text,

  -- Quoted server-side from store_listings.price / stream_products.live_price.
  -- Integer cents is the canonical unit; store_orders.amount stays numeric and
  -- is derived for display and for the existing crypto-path consumers.
  gross_cents bigint NOT NULL CHECK (gross_cents >= 200),
  platform_fee_cents bigint NOT NULL CHECK (platform_fee_cents >= 0),
  net_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  CONSTRAINT store_card_intents_split CHECK (gross_cents = platform_fee_cents + net_cents),

  stripe_session_id text,
  payment_intent_id text,
  -- What Stripe actually took, read off latest_charge.balance_transaction at
  -- settle. The fee model is a forecast; this is the observation, and without
  -- it the ledger can only be reconciled against itself.
  stripe_fee_cents bigint,
  stripe_net_cents bigint,
  refunded_cents bigint NOT NULL DEFAULT 0,

  buyer_email text,
  shipping_address text,
  notes text,
  order_id uuid REFERENCES public.store_orders(id) ON DELETE SET NULL,
  settle_warning text,

  expires_at timestamptz NOT NULL,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One order per PaymentIntent, forever. The lower(tx_hash) unique index from
-- the crypto rail is inert for card orders because tx_hash is NULL, so this is
-- the entire replay defence for the card rail.
CREATE UNIQUE INDEX IF NOT EXISTS store_card_intents_pi_key
  ON public.store_card_intents (environment, payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS store_card_intents_session_key
  ON public.store_card_intents (environment, stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_store_card_intents_seller
  ON public.store_card_intents (seller_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_card_intents_open
  ON public.store_card_intents (expires_at) WHERE status = 'created';

DROP TRIGGER IF EXISTS update_store_card_intents_updated_at ON public.store_card_intents;
CREATE TRIGGER update_store_card_intents_updated_at
BEFORE UPDATE ON public.store_card_intents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3. Stock holds
-- ============================================================================
-- On the DHB rail an oversell was survivable: the money moved buyer -> seller
-- and a human reconciled. On the card rail DeHub charged the card, so 200
-- buyers racing one unit means 199 real charges to refund at a non-refundable
-- processing fee each, and 199 "merchandise not received" disputes if nobody
-- notices. Stock comes off when the session opens, not when it settles.

CREATE TABLE IF NOT EXISTS public.store_stock_holds (
  hold_ref text PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES public.store_listings(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'consumed', 'released')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_stock_holds_sweep
  ON public.store_stock_holds (listing_id, expires_at) WHERE status = 'held';

-- ============================================================================
-- 4. The seller ledger
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seller_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
  wallet_address text NOT NULL CHECK (wallet_address ~ '^0x[0-9a-f]{40}$'),
  -- Signed. Credits positive, reversals and withdrawals negative.
  delta_cents bigint NOT NULL CHECK (delta_cents <> 0),
  currency text NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  -- sale | refund | dispute | dispute_fee | dispute_reversal | fee_adjustment
  -- | adjustment | withdrawal | withdrawal_reversal
  reason text NOT NULL,
  -- Whatever makes the movement unique upstream: the PaymentIntent id for a
  -- sale, the Refund id for a refund, the Dispute id for a dispute, our own
  -- withdrawal ref for a payout.
  ref text,
  -- When this row starts counting as withdrawable. NULL means immediately:
  -- withdrawals, dispute fees and manual adjustments have no hold. A sale is
  -- now() + 30 days, and a reversal COPIES the sale's available_at so the two
  -- always sit on the same side of the partition.
  available_at timestamptz,
  order_id uuid REFERENCES public.store_orders(id) ON DELETE SET NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seller_ledger_wallet
  ON public.seller_ledger (environment, wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seller_ledger_maturity
  ON public.seller_ledger (environment, wallet_address, available_at);

-- One movement per external reference. This deliberately does NOT exclude
-- negatives: a re-delivered refund or dispute webhook must collide here too.
-- The environment is in the key because a sandbox event must never be able to
-- claim a live reference.
CREATE UNIQUE INDEX IF NOT EXISTS seller_ledger_ref_key
  ON public.seller_ledger (environment, reason, ref)
  WHERE ref IS NOT NULL;

COMMENT ON TABLE public.seller_ledger IS
  'Append-only, integer USD cents. There is no balance table: pending is '
  'SUM(delta_cents) WHERE available_at > now(), available is the complement. '
  'Nothing here has a non-negative CHECK — a chargeback after a payout must be '
  'recordable, and a constraint that aborts inside a Stripe webhook retries '
  'forever.';

-- ============================================================================
-- 5. Payout records
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seller_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
  wallet_address text NOT NULL CHECK (wallet_address ~ '^0x[0-9a-f]{40}$'),
  ledger_ref text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  stripe_account_id text NOT NULL,
  stripe_transfer_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'reversed')),
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, ledger_ref)
);

DROP TRIGGER IF EXISTS update_seller_payouts_updated_at ON public.seller_payouts;
CREATE TRIGGER update_seller_payouts_updated_at
BEFORE UPDATE ON public.seller_payouts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 6. Stripe event audit
-- ============================================================================
-- Observability, NOT the idempotency gate. A claim-row-before-handler design
-- drops the event permanently when the handler throws on a transient error and
-- the retry then sees its own claim. The real guards are
-- store_card_intents_pi_key and seller_ledger_ref_key, which are inside the
-- same transaction as the work they protect.

CREATE TABLE IF NOT EXISTS public.stripe_marketplace_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
  event_id text NOT NULL,
  event_type text NOT NULL,
  outcome text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, event_id)
);

-- ============================================================================
-- 7. Atomic, fail-closed rate limiting
-- ============================================================================
-- checkRateLimit in _shared/auth.ts is a read-then-write with no atomicity and
-- a catch that returns allowed:true. On a card-session endpoint both properties
-- are wrong: concurrency under-counts, and a Postgres blip removes the limit
-- from the one endpoint that opens PaymentIntents.

CREATE OR REPLACE FUNCTION public.edge_rate_limit_bump(
  p_bucket text,
  p_action text,
  p_window_ms integer,
  p_limit integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO public.edge_rate_limits (bucket_key, action_type, count, window_start)
  VALUES (p_bucket, p_action, 1, now())
  ON CONFLICT (bucket_key, action_type) DO UPDATE
    SET count = CASE
          WHEN public.edge_rate_limits.window_start < now() - (p_window_ms || ' milliseconds')::interval
          THEN 1 ELSE public.edge_rate_limits.count + 1 END,
        window_start = CASE
          WHEN public.edge_rate_limits.window_start < now() - (p_window_ms || ' milliseconds')::interval
          THEN now() ELSE public.edge_rate_limits.window_start END
  RETURNING count INTO v_count;

  RETURN v_count <= p_limit;
END; $$;

COMMENT ON FUNCTION public.edge_rate_limit_bump(text, text, integer, integer) IS
  'One statement, so N concurrent callers cannot all read the same count. The '
  'caller must treat an error as DENIED, not as allowed.';

-- ============================================================================
-- 8. Stock hold movements
-- ============================================================================

CREATE OR REPLACE FUNCTION public.store_stock_hold_release(p_hold_ref text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_listing uuid;
BEGIN
  UPDATE store_stock_holds SET status = 'released'
   WHERE hold_ref = p_hold_ref AND status = 'held'
  RETURNING listing_id INTO v_listing;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE store_listings
     SET stock_quantity = stock_quantity + 1,
         status = CASE WHEN status = 'sold_out' THEN 'active' ELSE status END
   WHERE id = v_listing AND stock_quantity IS NOT NULL;

  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.store_stock_hold_create(
  p_listing_id uuid,
  p_hold_ref text,
  p_ttl_minutes integer DEFAULT 40
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stock integer;
  v_inserted boolean;
  r record;
BEGIN
  -- Reclaim anything abandoned on this listing first. This is why there is no
  -- cron: expiry is collected by the next buyer through the door.
  FOR r IN
    SELECT hold_ref FROM store_stock_holds
     WHERE listing_id = p_listing_id AND status = 'held' AND expires_at < now()
     FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM store_stock_hold_release(r.hold_ref);
  END LOOP;

  SELECT stock_quantity INTO v_stock FROM store_listings WHERE id = p_listing_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LISTING_NOT_FOUND'; END IF;

  INSERT INTO store_stock_holds (hold_ref, listing_id, expires_at)
  VALUES (p_hold_ref, p_listing_id, now() + (p_ttl_minutes || ' minutes')::interval)
  ON CONFLICT (hold_ref) DO NOTHING;

  -- FOUND after INSERT ... ON CONFLICT DO NOTHING is false when the conflict
  -- fired, which is the "this hold already exists" case.
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF NOT v_inserted THEN RETURN 'already_held'; END IF;

  IF v_stock IS NULL THEN RETURN 'unlimited'; END IF;

  -- Same single-statement guard as decrement_listing_stock: the check and the
  -- decrement cannot be raced apart.
  UPDATE store_listings
     SET stock_quantity = stock_quantity - 1
   WHERE id = p_listing_id AND stock_quantity > 0;

  IF NOT FOUND THEN
    DELETE FROM store_stock_holds WHERE hold_ref = p_hold_ref;
    RAISE EXCEPTION 'out_of_stock';
  END IF;

  UPDATE store_listings SET status = 'sold_out'
   WHERE id = p_listing_id AND stock_quantity = 0 AND status = 'active';

  RETURN 'held';
END; $$;

-- ============================================================================
-- 9. Ledger movements
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seller_ledger_post(
  p_environment text,
  p_wallet text,
  p_cents bigint,
  p_reason text,
  p_ref text,
  p_available_at timestamptz DEFAULT NULL,
  p_order_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inserted boolean;
BEGIN
  IF p_cents = 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF p_reason NOT IN (
    'sale','refund','dispute','dispute_fee','dispute_reversal',
    'fee_adjustment','adjustment','withdrawal','withdrawal_reversal'
  ) THEN RAISE EXCEPTION 'INVALID_REASON'; END IF;

  INSERT INTO seller_ledger (environment, wallet_address, delta_cents, reason,
                             ref, available_at, order_id, metadata)
  VALUES (p_environment, lower(p_wallet), p_cents, p_reason, p_ref,
          p_available_at, p_order_id, p_metadata)
  ON CONFLICT (environment, reason, ref) WHERE ref IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF NOT v_inserted THEN RAISE EXCEPTION 'MOVEMENT_ALREADY_APPLIED'; END IF;
  RETURN p_cents;
END; $$;

-- Reverse part or all of a sale. Copies the sale's available_at so a reversal
-- and the sale it reverses always sit on the same side of the pending /
-- available partition — the failure that breaks a two-counter design at exactly
-- day 30, inside a webhook, forever.
CREATE OR REPLACE FUNCTION public.seller_ledger_reverse(
  p_environment text,
  p_payment_intent_id text,
  p_cents bigint,
  p_reason text,
  p_ref text,
  p_metadata jsonb DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sale       seller_ledger%ROWTYPE;
  v_reversed bigint;
  v_cap      bigint;
BEGIN
  SELECT * INTO sale FROM seller_ledger
   WHERE environment = p_environment AND reason = 'sale' AND ref = p_payment_intent_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SALE_NOT_FOUND'; END IF;

  SELECT coalesce(sum(-delta_cents), 0) INTO v_reversed
    FROM seller_ledger
   WHERE environment = p_environment
     AND order_id IS NOT DISTINCT FROM sale.order_id
     AND reason IN ('refund', 'dispute');

  -- A refund followed by a dispute on the same charge must not debit twice.
  v_cap := greatest(sale.delta_cents - v_reversed, 0);
  IF v_cap = 0 THEN RETURN 0; END IF;

  RETURN seller_ledger_post(
    p_environment, sale.wallet_address, -least(p_cents, v_cap),
    p_reason, p_ref, sale.available_at, sale.order_id, p_metadata
  );
END; $$;

CREATE OR REPLACE FUNCTION public.seller_ledger_balance(
  p_environment text,
  p_wallet text
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'pending_cents',
      coalesce(sum(delta_cents) FILTER (WHERE available_at > now()), 0)::bigint,
    'available_cents',
      coalesce(sum(delta_cents) FILTER (WHERE available_at IS NULL OR available_at <= now()), 0)::bigint,
    'lifetime_earned_cents',
      coalesce(sum(delta_cents) FILTER (WHERE reason = 'sale'), 0)::bigint,
    'lifetime_withdrawn_cents',
      coalesce(-sum(delta_cents) FILTER (WHERE reason = 'withdrawal'), 0)::bigint,
    'next_release_at',
      min(available_at) FILTER (WHERE available_at > now())
  )
  FROM seller_ledger
  WHERE environment = p_environment AND wallet_address = lower(p_wallet);
$$;

CREATE OR REPLACE FUNCTION public.seller_ledger_withdraw(
  p_environment text,
  p_wallet text,
  p_cents bigint,
  p_ref text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_available bigint;
BEGIN
  IF p_cents < 1000 THEN RAISE EXCEPTION 'BELOW_MINIMUM'; END IF;

  -- Sum-then-insert cannot be collapsed into one guarded statement the way a
  -- stored counter can, because the balance is derived. The lock is held for
  -- this transaction only, and this function IS the whole transaction.
  PERFORM pg_advisory_xact_lock(hashtext('seller_ledger:' || p_environment || ':' || lower(p_wallet)));

  SELECT coalesce(sum(delta_cents), 0) INTO v_available
    FROM seller_ledger
   WHERE environment = p_environment AND wallet_address = lower(p_wallet)
     AND (available_at IS NULL OR available_at <= now());

  IF v_available < p_cents THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  PERFORM seller_ledger_post(p_environment, p_wallet, -p_cents, 'withdrawal',
                             p_ref, NULL, NULL, NULL);
  RETURN v_available - p_cents;
END; $$;

-- ============================================================================
-- 10. Settlement — the whole card sale, in one transaction
-- ============================================================================
-- Supabase edge functions reach Postgres over PostgREST. supabase.rpc(),
-- .insert() and the next .rpc() are three HTTP requests in three separate
-- transactions, and an advisory lock taken in the first is released before the
-- second is sent. So the webhook makes exactly ONE call, and everything that
-- must be atomic lives inside this function body.

CREATE OR REPLACE FUNCTION public.store_card_order_settle(
  p_environment text,
  p_payment_intent_id text,
  p_charged_cents bigint,
  p_stripe_fee_cents bigint,
  p_buyer_email text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it        store_card_intents%ROWTYPE;
  v_order   uuid;
  v_warn    text;
  v_stock   integer;
  v_hold    text;
  v_consumed boolean;
BEGIN
  SELECT * INTO it FROM store_card_intents
   WHERE environment = p_environment AND payment_intent_id = p_payment_intent_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'INTENT_NOT_FOUND'; END IF;

  -- Stripe delivers checkout.session.completed and payment_intent.succeeded for
  -- one payment, concurrently and in no particular order. Both route here; the
  -- second one leaves without touching stock, the order or the ledger.
  IF it.status = 'settled' THEN
    RETURN jsonb_build_object('status', 'already_settled', 'order_id', it.order_id);
  END IF;

  -- The charged amount is the truth. A mismatch is recorded, never raised: a
  -- RAISE here 500s into an infinite Stripe retry with an already-charged buyer.
  IF p_charged_cents <> it.gross_cents THEN
    v_warn := format('amount_mismatch: charged %s, quoted %s', p_charged_cents, it.gross_cents);
  END IF;

  -- Stock was taken when the session opened. Consume the hold; only fall back
  -- to a live decrement if the hold expired while the buyer was on Stripe.
  v_hold := 'sci:' || it.id::text;
  UPDATE store_stock_holds SET status = 'consumed'
   WHERE hold_ref = v_hold AND status = 'held';
  GET DIAGNOSTICS v_consumed = ROW_COUNT;

  IF NOT v_consumed THEN
    SELECT stock_quantity INTO v_stock FROM store_listings WHERE id = it.listing_id;
    IF v_stock IS NOT NULL THEN
      BEGIN
        PERFORM decrement_listing_stock(it.listing_id);
      EXCEPTION WHEN OTHERS THEN
        -- The caller reads this and issues an automatic refund. It must not
        -- abort: the card is already charged and the buyer needs a record.
        v_warn := coalesce(v_warn || '; ', '') || 'oversold';
      END;
    END IF;
  END IF;

  -- The order insert fires notify_store_order, which is why no row is written
  -- before the money is real: a pre-payment row would notify the seller of
  -- every abandoned checkout.
  INSERT INTO store_orders (
    listing_id, buyer_address, seller_address, amount, tx_hash, status,
    shipping_address, notes, stream_token_id, source, payment_method,
    verified_at, verify_error, paid_token_amount, paid_token_symbol
  ) VALUES (
    it.listing_id, it.buyer_address, it.seller_address,
    round(p_charged_cents::numeric / 100, 2), NULL,
    CASE WHEN v_warn LIKE '%oversold%' THEN 'pending_verification' ELSE 'paid' END,
    it.shipping_address, it.notes, it.stream_token_id,
    CASE WHEN coalesce(it.stream_token_id, '') <> '' THEN 'live' ELSE 'store' END,
    'card', now(), v_warn,
    round(p_charged_cents::numeric / 100, 2), 'USD'
  ) RETURNING id INTO v_order;

  -- Credit the seller, held for 30 days. ref is the PaymentIntent id and never
  -- the Checkout Session id: a Session carries payment_intent as a string,
  -- PaymentIntent events carry a different object id, and both events must land
  -- on the same reference or the sale is credited twice.
  INSERT INTO seller_ledger (
    environment, wallet_address, delta_cents, reason, ref, available_at,
    order_id, metadata
  ) VALUES (
    p_environment, it.seller_address, it.net_cents, 'sale', p_payment_intent_id,
    now() + interval '30 days', v_order,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'gross_cents', p_charged_cents,
      'platform_fee_cents', it.platform_fee_cents,
      'listing_id', it.listing_id
    )
  )
  ON CONFLICT (environment, reason, ref) WHERE ref IS NOT NULL DO NOTHING;

  UPDATE store_card_intents SET
    status = 'settled',
    order_id = v_order,
    settled_at = now(),
    stripe_fee_cents = p_stripe_fee_cents,
    stripe_net_cents = p_charged_cents - coalesce(p_stripe_fee_cents, 0),
    buyer_email = coalesce(p_buyer_email, buyer_email),
    settle_warning = v_warn
  WHERE id = it.id;

  RETURN jsonb_build_object(
    'status', 'settled',
    'order_id', v_order,
    'warning', v_warn,
    'net_cents', it.net_cents,
    'seller_address', it.seller_address
  );
END; $$;

COMMENT ON FUNCTION public.store_card_order_settle(text, text, bigint, bigint, text, jsonb) IS
  'Consume the stock hold, write the order and credit the seller in ONE '
  'transaction, idempotent on the PaymentIntent. Never raises for a business '
  'problem (oversell, amount mismatch) — it records and lets the caller refund.';

-- Reconciliation. Settlement is one transaction so an order cannot exist
-- without its ledger row, but transfers and refunds cross a network.
CREATE OR REPLACE FUNCTION public.seller_ledger_anomalies(p_environment text)
RETURNS TABLE (kind text, id text, detail text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'settled_intent_without_ledger', i.payment_intent_id, i.seller_address
    FROM store_card_intents i
    LEFT JOIN seller_ledger l
      ON l.environment = i.environment AND l.reason = 'sale' AND l.ref = i.payment_intent_id
   WHERE i.environment = p_environment AND i.status = 'settled' AND l.id IS NULL
  UNION ALL
  SELECT 'payout_stuck_pending', p.ledger_ref, p.wallet_address
    FROM seller_payouts p
   WHERE p.environment = p_environment AND p.status = 'pending'
     AND p.created_at < now() - interval '1 hour'
  UNION ALL
  SELECT 'negative_available', wallet_address, sum(delta_cents)::text
    FROM seller_ledger
   WHERE environment = p_environment
     AND (available_at IS NULL OR available_at <= now())
   GROUP BY wallet_address HAVING sum(delta_cents) < 0;
$$;

-- ============================================================================
-- 11. Access
-- ============================================================================
-- A wallet may read its own ledger. It may not write it, and it may not read
-- any of the payment tables at all: those carry PaymentIntent ids, buyer email
-- addresses and the fee split, and get_request_wallet_address() reads an
-- unsigned header. The balance the wallet page renders comes from the
-- store-payouts edge function under a verified DeHub token, not from these
-- policies — same doctrine as ai_credits.

ALTER TABLE public.seller_ledger             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_payout_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_payouts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_card_intents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_stock_holds         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_marketplace_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wallets read own seller ledger" ON public.seller_ledger;
CREATE POLICY "Wallets read own seller ledger" ON public.seller_ledger
  FOR SELECT TO anon, authenticated
  USING (wallet_address = public.get_request_wallet_address());

DROP POLICY IF EXISTS "Service role manages seller ledger" ON public.seller_ledger;
CREATE POLICY "Service role manages seller ledger" ON public.seller_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages payout accounts" ON public.seller_payout_accounts;
CREATE POLICY "Service role manages payout accounts" ON public.seller_payout_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role manages payouts" ON public.seller_payouts;
CREATE POLICY "Service role manages payouts" ON public.seller_payouts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role manages card intents" ON public.store_card_intents;
CREATE POLICY "Service role manages card intents" ON public.store_card_intents
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role manages stock holds" ON public.store_stock_holds;
CREATE POLICY "Service role manages stock holds" ON public.store_stock_holds
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role manages stripe events" ON public.stripe_marketplace_events;
CREATE POLICY "Service role manages stripe events" ON public.stripe_marketplace_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON FUNCTION public.store_card_order_settle(text, text, bigint, bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seller_ledger_post(text, text, bigint, text, text, timestamptz, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seller_ledger_reverse(text, text, bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seller_ledger_balance(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seller_ledger_withdraw(text, text, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seller_ledger_anomalies(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_stock_hold_create(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_stock_hold_release(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.edge_rate_limit_bump(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
