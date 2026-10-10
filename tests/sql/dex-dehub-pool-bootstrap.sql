CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA dex_private;
CREATE TABLE dex_private.price_minutes (
  minute timestamptz PRIMARY KEY, observed_at timestamptz NOT NULL,
  price numeric, positions jsonb NOT NULL, usd_price numeric, liquidity_usd numeric
);
CREATE TABLE dex_private.market_state (id boolean PRIMARY KEY, payload jsonb);
CREATE FUNCTION dex_private.price_minutes_strip_positions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.positions := '[]'::jsonb; RETURN NEW; END $$;
CREATE TRIGGER price_minutes_strip_positions BEFORE INSERT ON dex_private.price_minutes
  FOR EACH ROW EXECUTE FUNCTION dex_private.price_minutes_strip_positions();
INSERT INTO dex_private.price_minutes VALUES (date_trunc('minute',now()) - interval '1 day', now() - interval '1 day', 0.00002, '[]', 0.00002, 99999);
