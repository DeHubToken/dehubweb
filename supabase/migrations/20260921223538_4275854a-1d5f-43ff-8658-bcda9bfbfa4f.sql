-- lovable-cron-fallback-reviewed: /dex must reflect new pool positions within a minute; ModifyLiquidity logs can only be discovered by polling the chain.
-- /dex lists every position in the DHB/USDC v4 pools, not just app-minted ones.
--
-- dex_sell_positions is an index of orders placed through DeHub. A range order
-- opened on Uniswap's own interface sits in the same pool, quotes against the
-- same book and moves the same price, but never reached this page. The
-- dex-position-scan function now walks the PoolManager's ModifyLiquidity logs
-- for our four pool ids and records every PositionManager NFT it finds; the
-- minute snapshot reads that index alongside the app's own rows.
--
-- Discovered rows carry no claim about their contents: the snapshot still
-- re-reads liquidity, ticks, pool state and ownership onchain for each one. The
-- mint-receipt proof is only meaningful for app rows, where it binds a
-- self-reported owner to a mint; a log emitted by the PoolManager for our pool
-- id is already stronger evidence than that.

CREATE TABLE IF NOT EXISTS public.dex_pool_positions (
  chain_id integer NOT NULL CHECK (chain_id IN (56, 8453)),
  token_id text NOT NULL CHECK (token_id ~ '^[1-9][0-9]*$'),
  mint_tx_hash text NOT NULL CHECK (mint_tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  block_number bigint NOT NULL CHECK (block_number > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, token_id)
);
CREATE INDEX IF NOT EXISTS dex_pool_positions_recent_idx
  ON public.dex_pool_positions (created_at DESC);
ALTER TABLE public.dex_pool_positions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'dex_pool_positions' AND policyname = 'Anyone can view discovered DHB positions') THEN
    CREATE POLICY "Anyone can view discovered DHB positions"
      ON public.dex_pool_positions FOR SELECT USING (true);
  END IF;
END $$;

-- Scan cursor. No policies: only the service role behind the scanner touches it.
CREATE TABLE IF NOT EXISTS public.dex_pool_scan (
  chain_id integer PRIMARY KEY CHECK (chain_id IN (56, 8453)),
  floor_block bigint NOT NULL,
  from_block bigint NOT NULL,
  to_block bigint NOT NULL,
  window_blocks integer NOT NULL DEFAULT 500000,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dex_pool_scan ENABLE ROW LEVEL SECURITY;

-- Backward sweeps can re-find a position at an earlier block than the forward
-- sweep first saw it. Keep the earliest sighting, which is the mint.
CREATE OR REPLACE FUNCTION public.record_dex_pool_positions(p_rows jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  INSERT INTO public.dex_pool_positions (chain_id, token_id, mint_tx_hash, block_number, created_at)
  SELECT (row->>'chain_id')::integer, row->>'token_id', row->>'mint_tx_hash',
         (row->>'block_number')::bigint, (row->>'created_at')::timestamptz
  FROM jsonb_array_elements(p_rows) row
  ON CONFLICT (chain_id, token_id) DO UPDATE
    SET mint_tx_hash = excluded.mint_tx_hash,
        block_number = excluded.block_number,
        created_at = excluded.created_at
    WHERE excluded.block_number < public.dex_pool_positions.block_number;
$$;
REVOKE ALL ON FUNCTION public.record_dex_pool_positions(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_dex_pool_positions(jsonb) TO service_role;

-- One round trip for a position's three reads instead of three. With the pool
-- open to everyone's positions the snapshot has far more rows to verify, and
-- request latency, not RPC work, is what the one-minute budget goes on.
CREATE OR REPLACE FUNCTION dex_private.calls(chain integer, targets jsonb, block_tag text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE payload jsonb; answer jsonb; results jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('jsonrpc','2.0','id',idx - 1,'method','eth_call',
           'params',jsonb_build_array(target, block_tag)) ORDER BY idx)
    INTO payload FROM jsonb_array_elements(targets) WITH ORDINALITY AS entry(target, idx);
  answer := dex_private.rpc(chain, payload);
  IF jsonb_typeof(answer) <> 'array' THEN RAISE EXCEPTION 'Malformed batch reply'; END IF;
  SELECT jsonb_object_agg(entry->>'id', entry->'result') INTO results
    FROM jsonb_array_elements(answer) entry WHERE entry->>'id' IS NOT NULL;
  RETURN coalesce(results, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION dex_private.sample_market()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  sample_minute timestamptz := date_trunc('minute', now());
  observed timestamptz;
  row_record record; chain integer; block_tag text; manager text; state_view text;
  currency0 text; currency1 text; info text; liq numeric; packed numeric;
  lower_tick integer; upper_tick integer; tick integer; fee integer; spacing integer;
  pool_id text; slot text; root numeric; root_lo numeric; root_hi numeric;
  amount0 numeric; amount1 numeric; dhb numeric; usdc numeric;
  min_price numeric; max_price numeric; market_price numeric; ask numeric; best numeric := NULL;
  owner text; status text; side text; receipt jsonb; verified jsonb := '[]'; blocks jsonb := '{}';
  candle_sets jsonb := '{}'; candles jsonb; interval_label text; seconds integer; started timestamptz;
  slot_cache jsonb := '{}'; cache_key text; previous_price numeric;
  token_hex text; batch jsonb; owner_word text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(618031901) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM dex_private.price_minutes WHERE minute = sample_minute) THEN RETURN; END IF;
  SELECT started_at INTO started FROM dex_private.market_state WHERE id;
  FOR chain IN
    SELECT chain_id FROM public.dex_sell_positions
    UNION SELECT chain_id FROM public.dex_pool_positions
  LOOP
    block_tag := dex_private.rpc(chain, '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'::jsonb)->>'result';
    IF block_tag IS NULL OR block_tag !~ '^0x[0-9a-fA-F]+$' THEN RAISE EXCEPTION 'Missing chain block'; END IF;
    blocks := blocks || jsonb_build_object(chain::text, block_tag);
  END LOOP;
  -- Discovered rows are capped: each one costs a round trip, and a snapshot that
  -- overruns its minute is thrown away, which would take the page down with it.
  FOR row_record IN
    SELECT * FROM (
      SELECT chain_id, token_id, owner_address, mint_tx_hash, dhb_amount, usdc_amount,
             min_usdc_per_dhb, max_usdc_per_dhb, created_at, side, true AS app_indexed
        FROM public.dex_sell_positions
      UNION ALL
      SELECT * FROM (
        SELECT d.chain_id, d.token_id, NULL::text AS owner_address, d.mint_tx_hash,
               NULL::numeric AS dhb_amount, NULL::numeric AS usdc_amount,
               NULL::numeric AS min_usdc_per_dhb, NULL::numeric AS max_usdc_per_dhb,
               d.created_at, NULL::text AS side, false AS app_indexed
          FROM public.dex_pool_positions d
         WHERE NOT EXISTS (SELECT 1 FROM public.dex_sell_positions s
                           WHERE s.chain_id = d.chain_id AND s.token_id = d.token_id)
         ORDER BY d.created_at DESC LIMIT 250
      ) outside
    ) source ORDER BY chain_id, token_id
  LOOP
    chain := row_record.chain_id; block_tag := blocks->>chain::text;
    manager := CASE chain WHEN 8453 THEN '0x7c5f5a4bbd8fd63184577525326123b519429bdc' ELSE '0x7a4a5c919ae2541aed11041a1aeee68f1287f95b' END;
    state_view := CASE chain WHEN 8453 THEN '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71' ELSE '0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4' END;
    token_hex := dex_private.uint_hex(row_record.token_id::numeric);
    batch := dex_private.calls(chain, jsonb_build_array(
      jsonb_build_object('to', manager, 'data', '0x1efeed33' || token_hex),
      jsonb_build_object('to', manager, 'data', '0x7ba03aad' || token_hex),
      jsonb_build_object('to', manager, 'data', '0x6352211e' || token_hex)), block_tag);
    IF (batch->>'0') IS NULL OR (batch->>'0') !~ '^0x[0-9a-fA-F]+$' THEN CONTINUE; END IF;
    liq := dex_private.word(batch->>'0', 0);
    IF liq = 0 THEN CONTINUE; END IF;
    info := batch->>'1'; owner_word := batch->>'2';
    IF info IS NULL OR info !~ '^0x[0-9a-fA-F]+$' OR owner_word IS NULL OR length(owner_word) < 42 THEN CONTINUE; END IF;
    -- A self-reported owner needs its mint proved. A log the PoolManager wrote
    -- for our own pool id does not, so discovered rows skip the receipt read.
    IF row_record.app_indexed THEN
      receipt := dex_private.rpc(chain, jsonb_build_object('jsonrpc','2.0','id',1,'method','eth_getTransactionReceipt','params',jsonb_build_array(row_record.mint_tx_hash)))->'result';
      IF receipt IS NULL OR receipt = 'null'::jsonb THEN RAISE EXCEPTION 'Missing receipt'; END IF;
      IF receipt->>'status' <> '0x1' OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(receipt->'logs') log
        WHERE lower(log->>'address') = manager
          AND log->'topics'->>0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND log->'topics'->>1 = '0x' || repeat('0',64)
          AND lower(log->'topics'->>2) = '0x' || lpad(substr(lower(row_record.owner_address),3),64,'0')
          AND lower(log->'topics'->>3) = '0x' || token_hex
      ) THEN CONTINUE; END IF;
    END IF;
    IF length(info) <> 386 THEN RAISE EXCEPTION 'Malformed position info'; END IF;
    currency0 := '0x' || substr(info,27,40); currency1 := '0x' || substr(info,91,40);
    IF chain = 8453 AND (currency0 <> '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' OR currency1 <> '0xd20ab1015f6a2de4a6fddebab270113f689c2f7c') THEN CONTINUE; END IF;
    IF chain = 56 AND (currency0 <> '0x680d3113caf77b61b510f332d5ef4cf5b41a761d' OR currency1 <> '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d') THEN CONTINUE; END IF;
    fee := dex_private.word(info,2); spacing := dex_private.word(info,3);
    IF NOT ((fee=0 AND spacing=1) OR (fee=3000 AND spacing=60)) OR dex_private.word(info,4) <> 0 THEN CONTINUE; END IF;
    packed := dex_private.word(info,5);
    lower_tick := mod(div(packed, 256),16777216)::integer;
    upper_tick := mod(div(packed, 4294967296),16777216)::integer;
    IF lower_tick >= 8388608 THEN lower_tick := lower_tick - 16777216; END IF;
    IF upper_tick >= 8388608 THEN upper_tick := upper_tick - 16777216; END IF;
    IF lower_tick >= upper_tick OR lower_tick < -887272 OR upper_tick > 887272 THEN CONTINUE; END IF;
    pool_id := CASE WHEN chain=8453 AND fee=0 THEN '9c07d4b06fd20498a3cacb80610b55dbbb7b3d79df07db20caccecc4e65155ec'
      WHEN chain=8453 THEN 'ab3b4bd9a7625c641d0c73dbe3e016ae986c6a9e0fb026697c27ef231d360dd0'
      WHEN fee=0 THEN '64d6da98b6238b7626aa8fd50be27c362079c0103e07d6e2b3ec9eb438c92c98'
      ELSE 'f237a2bbd437c15b6507d720abc4155aacb87591f8a701ef61a1354963d23ea7' END;
    cache_key := chain::text || ':' || pool_id;
    slot := slot_cache->>cache_key;
    IF slot IS NULL THEN
      slot := dex_private.call(chain,state_view,'0xc815641c' || pool_id,block_tag);
      slot_cache := slot_cache || jsonb_build_object(cache_key,slot);
    END IF;
    root := dex_private.word(slot,0) / power(2::numeric,96);
    IF root <= 0 THEN RAISE EXCEPTION 'Uninitialized pool'; END IF;
    tick := mod(dex_private.word(slot,1),16777216)::integer;
    IF tick >= 8388608 THEN tick := tick-16777216; END IF;
    root_lo := power(1.0001::numeric,lower_tick::numeric/2);
    root_hi := power(1.0001::numeric,upper_tick::numeric/2);
    amount0 := floor(liq * (root_hi - least(root_hi,greatest(root_lo,root))) / (least(root_hi,greatest(root_lo,root)) * root_hi));
    amount1 := floor(liq * (least(root_hi,greatest(root_lo,root)) - root_lo));
    IF chain=8453 THEN
      dhb := amount1 / 1e18; usdc := amount0 / 1e6;
      min_price := 1e12 / power(1.0001::numeric,upper_tick);
      max_price := 1e12 / power(1.0001::numeric,lower_tick);
      market_price := 1e12 / (root*root);
    ELSE
      dhb := amount0 / 1e18; usdc := amount1 / 1e18;
      min_price := power(1.0001::numeric,lower_tick);
      max_price := power(1.0001::numeric,upper_tick);
      market_price := root*root;
    END IF;
    owner := '0x' || right(owner_word,40);
    -- Outside positions declare no side. A range holding only DHB is an offer to
    -- sell it, one holding only USDC an offer to buy; a two-sided range is read
    -- by whichever leg is larger at the current price.
    side := CASE
      WHEN row_record.side IN ('buy','sell') THEN row_record.side
      WHEN usdc <= 0 THEN 'sell'
      WHEN dhb <= 0 THEN 'buy'
      WHEN dhb * market_price >= usdc THEN 'sell'
      ELSE 'buy' END;
    status := CASE WHEN side='sell' THEN CASE WHEN market_price>=max_price THEN 'Filled' WHEN market_price<=min_price THEN 'Open' ELSE 'In range' END
      ELSE CASE WHEN market_price<=min_price THEN 'Filled' WHEN market_price>=max_price THEN 'Open' ELSE 'In range' END END;
    verified := verified || jsonb_build_array(jsonb_build_object(
      'chain_id',chain,'token_id',row_record.token_id,'mint_tx_hash',row_record.mint_tx_hash,
      'owner_address',coalesce(row_record.owner_address, owner),'created_at',row_record.created_at,
      'dhb_amount',row_record.dhb_amount,'usdc_amount',row_record.usdc_amount,
      'min_usdc_per_dhb',coalesce(row_record.min_usdc_per_dhb, min_price),
      'max_usdc_per_dhb',coalesce(row_record.max_usdc_per_dhb, max_price),
      'side',side,'indexed',row_record.app_indexed,
      'owner',owner,'liquidity',liq::text,'tickLower',lower_tick,'tickUpper',upper_tick,'poolFee',fee,'tickSpacing',spacing,
      'minPrice',min_price,'maxPrice',max_price,'marketPrice',market_price,'amountDhb',dhb,'amountUsdc',usdc,'status',status));
    ask := greatest(min_price,market_price);
    IF side='sell' AND dhb > 1e-9 AND ask < max_price THEN best := least(best,ask); END IF;
  END LOOP;
  observed := clock_timestamp();
  -- A slow/erroring sample must not be labelled as a current minute.
  IF observed >= sample_minute + interval '1 minute' THEN RAISE EXCEPTION 'Snapshot exceeded minute'; END IF;
  INSERT INTO dex_private.price_minutes VALUES(sample_minute,observed,best,verified);
  FOR interval_label,seconds IN SELECT * FROM (VALUES ('1m',60),('5m',300),('15m',900),('30m',1800),('1h',3600)) v(label,seconds) LOOP
    WITH grouped AS (
      SELECT floor(extract(epoch FROM minute)/seconds)*seconds AS time,
        (array_agg(price ORDER BY minute))[1] AS open, max(price) AS high, min(price) AS low,
        (array_agg(price ORDER BY minute DESC))[1] AS close, max(extract(epoch FROM observed_at)) AS "observedAt"
      FROM dex_private.price_minutes
      WHERE minute >= sample_minute - make_interval(secs => seconds*120) AND price IS NOT NULL
      GROUP BY 1 ORDER BY 1 DESC LIMIT 120
    ) SELECT coalesce(jsonb_agg(to_jsonb(grouped) ORDER BY time),'[]'::jsonb) INTO candles FROM grouped;
    candle_sets := candle_sets || jsonb_build_object(interval_label,candles);
  END LOOP;
  SELECT price INTO previous_price FROM dex_private.price_minutes
    WHERE minute <= sample_minute - interval '24 hours' AND price IS NOT NULL ORDER BY minute DESC LIMIT 1;
  UPDATE dex_private.market_state SET payload = jsonb_build_object('version',1,'startedAt',extract(epoch FROM started),
    'observedAt',extract(epoch FROM observed),'price',best,'positions',verified,'candles',candle_sets,'blocks',blocks,
    'change24h',CASE WHEN previous_price > 0 AND best IS NOT NULL THEN (best/previous_price-1)*100 ELSE NULL END) WHERE id;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA dex_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA dex_private FROM PUBLIC, anon, authenticated;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dex-pool-position-scan') THEN
    PERFORM cron.unschedule('dex-pool-position-scan');
  END IF;
  PERFORM cron.schedule(
    'dex-pool-position-scan',
    '* * * * *',
    $job$
      SELECT net.http_post(
        url := 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/dex-position-scan',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      );
    $job$
  );
END $do$;