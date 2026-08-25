-- ============================================================================
-- Fraction marketplace
--
-- Every upload is 1000 ERC-1155 fractions. The tables to trade them have
-- existed since April but only ever backed a panel on one post's info page,
-- and the trade itself was an honour system: the buyer sent DHB and a toast
-- told them the seller would transfer the fractions. Nothing checked either
-- leg, nothing moved filled_quantity, and nothing stopped a seller listing
-- fractions they had already sold.
--
-- This migration is the storage half of making that a real market:
--
--   1. Listings carry a snapshot of the post they are for, so the browse grid
--      is ONE query instead of an /api/feed round trip per card.
--   2. Trades become a two-leg state machine with a deadline, because an
--      escrowless swap has a leg that lands second and someone has to be on
--      the hook for it.
--   3. Quantity is reserved in one statement, so two buyers racing on the
--      last 50 fractions cannot both get them.
--   4. The client loses write access to everything that decides who owes what.
-- ============================================================================

-- ── Listings ────────────────────────────────────────────────────────────────
-- The post snapshot. Fraction listings are keyed by token_id, and the post
-- behind it lives on api.dehub.io, not in Supabase — so rendering a grid of 50
-- listings meant 50 calls to /api/feed before anything painted. These columns
-- are written once at list time from data the seller's page already has.
ALTER TABLE public.fraction_listings
  ADD COLUMN IF NOT EXISTS post_title TEXT,
  ADD COLUMN IF NOT EXISTS post_image_url TEXT,
  ADD COLUMN IF NOT EXISTS post_type TEXT,
  ADD COLUMN IF NOT EXISTS creator_address TEXT,
  ADD COLUMN IF NOT EXISTS creator_username TEXT;

-- Browse sorts. The old index is (token_id, status) — right for one post's
-- panel, useless for "every active listing, cheapest first".
CREATE INDEX IF NOT EXISTS idx_fraction_listings_browse
  ON public.fraction_listings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraction_listings_price
  ON public.fraction_listings (status, price_per_fraction);

-- ── Trades ──────────────────────────────────────────────────────────────────
-- A fraction trade is a swap: DHB one way, ERC-1155 the other. With no escrow
-- contract one leg necessarily lands first, so the row has to survive the gap
-- between them rather than pretend the trade was atomic.
--
--   awaiting_delivery  buyer paid (verified on-chain), seller owes fractions
--   awaiting_payment   seller delivered (verified on-chain), buyer owes DHB
--   settled            both legs verified
--   overdue            the second leg missed its deadline
--
-- Both first legs are verified before the row exists, so `overdue` always
-- means a real default by a known address, never a client that lied.
ALTER TABLE public.fraction_trades
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'settled',
  ADD COLUMN IF NOT EXISTS delivery_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS settle_by TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;

-- Rows written before this migration were all recorded post-hoc by the client
-- with no verification, but they did represent a completed swap. Leave them
-- settled rather than dragging historic trades into a deadline they cannot meet.
UPDATE public.fraction_trades
   SET settled_at = COALESCE(settled_at, created_at)
 WHERE status = 'settled' AND settled_at IS NULL;

-- One transaction backs one trade. This is the same guarantee the store orders
-- got in #259 — without it a single payment can be replayed against every open
-- listing a seller has.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fraction_trades_tx_hash
  ON public.fraction_trades (lower(tx_hash)) WHERE tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fraction_trades_delivery_tx
  ON public.fraction_trades (lower(delivery_tx_hash)) WHERE delivery_tx_hash IS NOT NULL;

-- "What do I still owe / what is still owed to me" — the query the settlement
-- rail runs on every page load for both sides.
CREATE INDEX IF NOT EXISTS idx_fraction_trades_open_seller
  ON public.fraction_trades (lower(seller_address), status);
CREATE INDEX IF NOT EXISTS idx_fraction_trades_open_buyer
  ON public.fraction_trades (lower(buyer_address), status);

-- ── Reservation ─────────────────────────────────────────────────────────────
-- Two buyers reading `quantity - filled_quantity` and both writing it back is
-- the same race the store had on its last unit, and it matters more here
-- because the seller has to hand-deliver against whatever the row says. One
-- statement, refuses to oversell.
CREATE OR REPLACE FUNCTION public.reserve_fraction_listing(
  p_listing_id UUID,
  p_quantity INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining INTEGER;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  UPDATE public.fraction_listings
     SET filled_quantity = filled_quantity + p_quantity
   WHERE id = p_listing_id
     AND status = 'active'
     AND quantity - filled_quantity >= p_quantity
  RETURNING quantity - filled_quantity INTO remaining;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_quantity';
  END IF;

  -- A fully-reserved listing leaves the grid immediately. It comes back only
  -- if a reservation is released below.
  IF remaining = 0 THEN
    UPDATE public.fraction_listings SET status = 'sold' WHERE id = p_listing_id;
  END IF;

  RETURN remaining;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_fraction_listing(UUID, INTEGER) FROM PUBLIC, anon, authenticated;

-- The undo, for a payment that verified and then failed to produce a trade row.
-- Restores the listing to active so the fractions are sellable again.
CREATE OR REPLACE FUNCTION public.release_fraction_listing(
  p_listing_id UUID,
  p_quantity INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.fraction_listings
     SET filled_quantity = GREATEST(0, filled_quantity - p_quantity),
         status = CASE WHEN status = 'sold' THEN 'active' ELSE status END
   WHERE id = p_listing_id;
END;
$$;

REVOKE ALL ON FUNCTION public.release_fraction_listing(UUID, INTEGER) FROM PUBLIC, anon, authenticated;

-- ── Seller record ───────────────────────────────────────────────────────────
-- With no escrow, a seller's delivery history is the only thing a buyer can
-- price the counterparty risk on, so it goes on the card rather than being
-- something you could dig out of the activity tab. Deliberately a view: it is
-- derived from trades and must never drift from them.
-- Overdue is DERIVED from the deadline rather than read from a status column,
-- so the number is right without a cron job flipping rows on a timer. A job
-- that stops running would otherwise show every defaulting seller as clean.
CREATE OR REPLACE VIEW public.fraction_seller_stats
WITH (security_invoker = true) AS
SELECT
  lower(seller_address)                                            AS seller_address,
  COUNT(*)                                                         AS total_trades,
  COUNT(*) FILTER (WHERE status = 'settled')                       AS settled_trades,
  COUNT(*) FILTER (
    WHERE status IN ('awaiting_delivery', 'awaiting_payment')
      AND settle_by IS NOT NULL AND settle_by < now()
  )                                                                AS overdue_trades,
  COUNT(*) FILTER (
    WHERE status IN ('awaiting_delivery', 'awaiting_payment')
      AND (settle_by IS NULL OR settle_by >= now())
  )                                                                AS open_trades,
  COALESCE(SUM(quantity) FILTER (WHERE status = 'settled'), 0)     AS fractions_sold,
  AVG(EXTRACT(EPOCH FROM (settled_at - created_at)))
    FILTER (WHERE status = 'settled' AND settled_at IS NOT NULL)   AS avg_settle_seconds
FROM public.fraction_trades
GROUP BY lower(seller_address);

GRANT SELECT ON public.fraction_seller_stats TO anon, authenticated;

-- ── Locking down the write paths ────────────────────────────────────────────
-- Everything below was open, and each one is a way to be paid nothing or to be
-- recorded as having been paid.

-- Trades decide who owes whom. `WITH CHECK (true)` let any caller post a trade
-- naming any two addresses, which both fabricates a seller's obligation and
-- lets a buyer mark their own debt settled. Only the service role writes here
-- now, and only after reading the transfer off-chain.
DROP POLICY IF EXISTS "Anyone can record fraction trades" ON public.fraction_trades;

-- Offers: `FOR UPDATE USING (true)` meant anyone could accept, reject or
-- cancel anyone else's offer. A buyer may still withdraw their own; accepting
-- is a settlement action and moved to the edge function, because it can only
-- be granted against a delivery that actually happened.
DROP POLICY IF EXISTS "Participants can update offers" ON public.fraction_offers;
CREATE POLICY "Buyers can withdraw their own offers"
  ON public.fraction_offers FOR UPDATE
  USING (lower(buyer_address) = get_request_wallet_address())
  WITH CHECK (lower(buyer_address) = get_request_wallet_address());

-- Sellers still own their listings, but not the bookkeeping on them: a seller
-- who can write filled_quantity can un-reserve fractions a buyer has already
-- paid for, and one who can lower `quantity` can shrink a listing below what
-- is already sold.
--
-- This has to replace the table-wide grant rather than revoke one column from
-- it. Postgres keeps table-level and column-level ACLs separately, so a bare
-- `REVOKE UPDATE (filled_quantity)` against a table-wide UPDATE grant removes
-- nothing and only emits a warning — it would look applied and change nothing.
REVOKE UPDATE ON public.fraction_listings FROM anon, authenticated;
GRANT UPDATE (status, price_per_fraction) ON public.fraction_listings TO anon, authenticated;

-- Same reasoning: withdrawing an offer sets its status and nothing else.
REVOKE UPDATE ON public.fraction_offers FROM anon, authenticated;
GRANT UPDATE (status) ON public.fraction_offers TO anon, authenticated;

-- ── Notifications ───────────────────────────────────────────────────────────
-- The delivery obligation is worthless if the seller never learns about it.
-- Fires on the row the edge function writes, so it cannot be spoofed into
-- notifying someone about a payment that did not happen.
CREATE OR REPLACE FUNCTION public.notify_fraction_trade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'awaiting_delivery' THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, type, content, reference_id, reference_title
    ) VALUES (
      NEW.seller_address, NEW.buyer_address, 'fraction_sold',
      'Paid ' || NEW.total_dhb || ' DHB for ' || NEW.quantity ||
        ' fraction' || CASE WHEN NEW.quantity = 1 THEN '' ELSE 's' END ||
        ' — transfer them to complete the sale',
      NEW.token_id, 'Post #' || NEW.token_id
    );
  ELSIF NEW.status = 'awaiting_payment' THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, type, content, reference_id, reference_title
    ) VALUES (
      NEW.buyer_address, NEW.seller_address, 'fraction_delivered',
      'Sent you ' || NEW.quantity || ' fraction' ||
        CASE WHEN NEW.quantity = 1 THEN '' ELSE 's' END ||
        ' — pay ' || NEW.total_dhb || ' DHB to complete the trade',
      NEW.token_id, 'Post #' || NEW.token_id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_fraction_trade_created ON public.fraction_trades;
CREATE TRIGGER on_fraction_trade_created
AFTER INSERT ON public.fraction_trades
FOR EACH ROW EXECUTE FUNCTION public.notify_fraction_trade();

-- Tell the waiting side the moment the second leg lands, so neither party has
-- to sit on the page watching for it.
CREATE OR REPLACE FUNCTION public.notify_fraction_trade_settled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'settled' AND NEW.status = 'settled' THEN
    INSERT INTO public.custom_notifications (
      recipient_address, actor_address, type, content, reference_id, reference_title
    ) VALUES (
      CASE WHEN OLD.status = 'awaiting_delivery' THEN NEW.buyer_address ELSE NEW.seller_address END,
      CASE WHEN OLD.status = 'awaiting_delivery' THEN NEW.seller_address ELSE NEW.buyer_address END,
      'fraction_settled',
      'Trade complete — ' || NEW.quantity || ' fraction' ||
        CASE WHEN NEW.quantity = 1 THEN '' ELSE 's' END ||
        ' of Post #' || NEW.token_id || ' for ' || NEW.total_dhb || ' DHB',
      NEW.token_id, 'Post #' || NEW.token_id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_fraction_trade_settled ON public.fraction_trades;
CREATE TRIGGER on_fraction_trade_settled
AFTER UPDATE ON public.fraction_trades
FOR EACH ROW EXECUTE FUNCTION public.notify_fraction_trade_settled();

-- Open trades drive a rail on both sides' screens, so they need to arrive
-- without a refetch the way listings and offers already do.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.fraction_trades;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
