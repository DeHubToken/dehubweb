-- One-time snapshot of pre-migration DeHub accounts (from the old MongoDB
-- backend), used ONLY to power the "we found your old account" hint in the
-- wallet-create step. This is a static import — old accounts don't change
-- going forward, so no live sync/webhook is needed. Never exposed to
-- clients directly; only the legacy-account-check edge function (service
-- role) reads it.
CREATE TABLE IF NOT EXISTS public.legacy_accounts (
  email TEXT PRIMARY KEY,
  signup_method TEXT,
  eth_address TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.legacy_accounts ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated/anon — service-role only (edge function).
GRANT SELECT ON public.legacy_accounts TO service_role;
