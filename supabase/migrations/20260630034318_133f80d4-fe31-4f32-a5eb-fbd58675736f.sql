
CREATE TABLE public.premium_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  price_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_premium_subscriptions_wallet ON public.premium_subscriptions (lower(wallet_address));
CREATE INDEX idx_premium_subscriptions_stripe_id ON public.premium_subscriptions (stripe_subscription_id);

GRANT SELECT ON public.premium_subscriptions TO authenticated, anon;
GRANT ALL ON public.premium_subscriptions TO service_role;

ALTER TABLE public.premium_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wallet owners can read their subscription"
  ON public.premium_subscriptions FOR SELECT
  USING (lower(wallet_address) = public.get_request_wallet_address());

CREATE POLICY "Service role manages subscriptions"
  ON public.premium_subscriptions FOR ALL
  TO service_role
  USING (TRUE) WITH CHECK (TRUE);

CREATE TRIGGER premium_subscriptions_updated_at
  BEFORE UPDATE ON public.premium_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
