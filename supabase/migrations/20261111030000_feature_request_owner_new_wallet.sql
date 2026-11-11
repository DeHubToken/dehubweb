-- maldoteth moved to a new wallet on 2026-11-09 and the old one was erased.
-- The Requests board still listed the old wallet as its only owner and its
-- only watcher, so the owner menu (Queued / Shipped) disappeared and new
-- requests and comments stopped reaching the bell. Both lists now name the
-- new wallet.

CREATE OR REPLACE FUNCTION public.feature_request_status_editor_wallets()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT ARRAY[
    '0xec4e2c7417f781b35d830671f013b3b91f29ba64' -- maldoteth
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.feature_request_watcher_wallets()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT ARRAY[
    '0xec4e2c7417f781b35d830671f013b3b91f29ba64' -- maldoteth
  ]::text[];
$$;
