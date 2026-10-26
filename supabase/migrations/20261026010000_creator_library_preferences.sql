-- Private generation preferences stay separate from provider metadata.
ALTER TABLE public.creator_assets
  ADD COLUMN IF NOT EXISTS favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS creator_assets_library_preferences_idx
  ON public.creator_assets(wallet_address, hidden, favorite, created_at DESC)
  WHERE ready = true;

COMMENT ON COLUMN public.creator_assets.hidden IS
  'Reversible library visibility preference. Hiding never removes stored media.';
