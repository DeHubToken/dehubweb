-- Extend the discovery index to USDC-funded buy positions. Old sell rows stay valid.
ALTER TABLE public.dex_sell_positions
  ADD COLUMN IF NOT EXISTS side text NOT NULL DEFAULT 'sell',
  ADD COLUMN IF NOT EXISTS usdc_amount numeric;

ALTER TABLE public.dex_sell_positions
  ALTER COLUMN dhb_amount DROP NOT NULL;
ALTER TABLE public.dex_sell_positions
  DROP CONSTRAINT IF EXISTS dex_sell_positions_dhb_amount_check;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dex_positions_side_amount_check') THEN
    ALTER TABLE public.dex_sell_positions
      ADD CONSTRAINT dex_positions_side_amount_check CHECK (
        (side = 'sell' AND dhb_amount > 0 AND usdc_amount IS NULL) OR
        (side = 'buy' AND usdc_amount > 0 AND dhb_amount IS NULL)
      );
  END IF;
END $$;
