-- The headline price and the chart read every DHB pool, not just the DeHub order book.
-- One number in USD: the Uniswap DHB/ETH pool on Base, the PancakeSwap DHB/BNB and DHB/USDT
-- pools on BNB Chain, and the DeHub v4 DHB/USDC positions, each weighted by its own dollar
-- liquidity. price_minutes keeps the old ask column so order seeding is unaffected.
ALTER TABLE dex_private.price_minutes ADD COLUMN IF NOT EXISTS usd_price numeric CHECK (usd_price > 0);
ALTER TABLE dex_private.price_minutes ADD COLUMN IF NOT EXISTS liquidity_usd numeric;

-- ETH and BNB in dollars. Everything else in the registry is a dollar stablecoin.
CREATE OR REPLACE FUNCTION dex_private.quote_usd()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE response record; eth numeric; bnb numeric;
BEGIN
  PERFORM trench_internal.http_set_curlopt('CURLOPT_TIMEOUT_MS','6000');
  PERFORM trench_internal.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','2000');
  SELECT * INTO response FROM trench_internal.http_get('https://data-api.binance.vision/api/v3/ticker/price');
  IF response.status <> 200 THEN RAISE EXCEPTION 'Price feed HTTP %', response.status; END IF;
  SELECT max((v->>'price')::numeric) FILTER (WHERE v->>'symbol' = 'ETHUSDT'),
         max((v->>'price')::numeric) FILTER (WHERE v->>'symbol' = 'BNBUSDT')
    INTO eth, bnb FROM jsonb_array_elements(response.content::jsonb) v;
  IF NOT (eth > 0 AND bnb > 0) THEN RAISE EXCEPTION 'Price feed incomplete'; END IF;
  RETURN jsonb_build_object('ETH', eth, 'BNB', bnb, 'USD', 1);
END $$;

-- Liquidity-weighted DHB price and total dollar liquidity across the AMM pools outside the
-- DeHub order book. A pool that cannot be read, or that holds only dust, is skipped rather
-- than allowed to drag the average: an unreachable RPC must not cost the whole snapshot.
CREATE OR REPLACE FUNCTION dex_private.aggregate_market()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  pools jsonb := jsonb_build_array(
    jsonb_build_object('chain',8453,'pool','0xebdeacaf03ba54eb18128fd1fd042bc747af9295','version',3,
      'dhb','0xd20ab1015f6a2de4a6fddebab270113f689c2f7c','quote','0x4200000000000000000000000000000000000006',
      'quoteDecimals',18,'symbol','ETH','dhbIsToken0',false),
    jsonb_build_object('chain',56,'pool','0x0b1598fa339c4848abe98afc80cb413f91c7f27d','version',3,
      'dhb','0x680d3113caf77b61b510f332d5ef4cf5b41a761d','quote','0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
      'quoteDecimals',18,'symbol','BNB','dhbIsToken0',true),
    jsonb_build_object('chain',56,'pool','0xde1c563faed1a984b209da79b904f5a8c9ed78b0','version',3,
      'dhb','0x680d3113caf77b61b510f332d5ef4cf5b41a761d','quote','0x55d398326f99059ff775485246999027b3197955',
      'quoteDecimals',18,'symbol','USD','dhbIsToken0',false),
    jsonb_build_object('chain',56,'pool','0xfbb110e6a58fa8be44587ce0ab5617b18d57040b','version',2,
      'dhb','0x680d3113caf77b61b510f332d5ef4cf5b41a761d','quote','0x55d398326f99059ff775485246999027b3197955',
      'quoteDecimals',18,'symbol','USD','dhbIsToken0',false));
  usd jsonb; pool jsonb; chain integer; holder text; state text;
  ratio numeric; price numeric; quote_price numeric; quote_decimals integer;
  dhb_balance numeric; quote_balance numeric; value numeric;
  weighted numeric := 0; total numeric := 0;
BEGIN
  usd := dex_private.quote_usd();
  FOR pool IN SELECT * FROM jsonb_array_elements(pools) LOOP
    BEGIN
      chain := (pool->>'chain')::integer;
      quote_price := (usd->>(pool->>'symbol'))::numeric;
      quote_decimals := (pool->>'quoteDecimals')::integer;
      holder := '0x70a08231' || lpad(substr(pool->>'pool', 3), 64, '0');
      dhb_balance := dex_private.word(dex_private.call(chain, pool->>'dhb', holder, 'latest'), 0) / 1e18;
      quote_balance := dex_private.word(dex_private.call(chain, pool->>'quote', holder, 'latest'), 0)
        / power(10::numeric, quote_decimals);
      IF (pool->>'version')::integer = 3 THEN
        state := dex_private.call(chain, pool->>'pool', '0x3850c7bd', 'latest');
        ratio := power(dex_private.word(state, 0) / power(2::numeric, 96), 2);
      ELSE
        state := dex_private.call(chain, pool->>'pool', '0x0902f1ac', 'latest');
        IF dex_private.word(state, 0) = 0 THEN CONTINUE; END IF;
        ratio := dex_private.word(state, 1) / dex_private.word(state, 0);
      END IF;
      IF NOT (ratio > 0) THEN CONTINUE; END IF;
      -- The pool quotes token1 per token0 in base units; scale to whole tokens, then to dollars.
      price := quote_price * CASE WHEN (pool->>'dhbIsToken0')::boolean
        THEN ratio * power(10::numeric, 18 - quote_decimals)
        ELSE power(10::numeric, quote_decimals - 18) / ratio END;
      value := dhb_balance * price + quote_balance * quote_price;
      -- A drained pool still reports a price. It is noise, so it neither prices nor counts.
      IF NOT (price > 0) OR value < 1 THEN CONTINUE; END IF;
      weighted := weighted + price * value;
      total := total + value;
    EXCEPTION WHEN OTHERS THEN CONTINUE;
    END;
  END LOOP;
  RETURN jsonb_build_object('price', CASE WHEN total > 0 THEN weighted / total END, 'liquidity', total);
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
  owner text; status text; receipt jsonb; verified jsonb := '[]'; blocks jsonb := '{}';
  candle_sets jsonb := '{}'; candles jsonb; interval_label text; seconds integer; started timestamptz;
  slot_cache jsonb := '{}'; cache_key text; previous_price numeric;
  pool_market jsonb; listed_value numeric; listed_weighted numeric; usd_now numeric; liquidity_now numeric;
BEGIN
  IF NOT pg_try_advisory_xact_lock(618031901) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM dex_private.price_minutes WHERE minute = sample_minute) THEN RETURN; END IF;
  SELECT started_at INTO started FROM dex_private.market_state WHERE id;
  FOR chain IN SELECT DISTINCT chain_id FROM public.dex_sell_positions LOOP
    block_tag := dex_private.rpc(chain, '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'::jsonb)->>'result';
    IF block_tag IS NULL OR block_tag !~ '^0x[0-9a-fA-F]+$' THEN RAISE EXCEPTION 'Missing chain block'; END IF;
    blocks := blocks || jsonb_build_object(chain::text, block_tag);
  END LOOP;
  FOR row_record IN SELECT * FROM public.dex_sell_positions ORDER BY chain_id, token_id LOOP
    chain := row_record.chain_id; block_tag := blocks->>chain::text;
    manager := CASE chain WHEN 8453 THEN '0x7c5f5a4bbd8fd63184577525326123b519429bdc' ELSE '0x7a4a5c919ae2541aed11041a1aeee68f1287f95b' END;
    state_view := CASE chain WHEN 8453 THEN '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71' ELSE '0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4' END;
    liq := dex_private.word(dex_private.call(chain, manager, '0x1efeed33' || dex_private.uint_hex(row_record.token_id::numeric), block_tag),0);
    IF liq = 0 THEN CONTINUE; END IF;
    receipt := dex_private.rpc(chain, jsonb_build_object('jsonrpc','2.0','id',1,'method','eth_getTransactionReceipt','params',jsonb_build_array(row_record.mint_tx_hash)))->'result';
    IF receipt IS NULL OR receipt = 'null'::jsonb THEN RAISE EXCEPTION 'Missing receipt'; END IF;
    IF receipt->>'status' <> '0x1' OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(receipt->'logs') log
      WHERE lower(log->>'address') = manager
        AND log->'topics'->>0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        AND log->'topics'->>1 = '0x' || repeat('0',64)
        AND lower(log->'topics'->>2) = '0x' || lpad(substr(lower(row_record.owner_address),3),64,'0')
        AND lower(log->'topics'->>3) = '0x' || dex_private.uint_hex(row_record.token_id::numeric)
    ) THEN CONTINUE; END IF;
    info := dex_private.call(chain, manager, '0x7ba03aad' || dex_private.uint_hex(row_record.token_id::numeric), block_tag);
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
    owner := '0x' || right(dex_private.call(chain,manager,'0x6352211e' || dex_private.uint_hex(row_record.token_id::numeric),block_tag),40);
    status := CASE WHEN row_record.side='sell' THEN CASE WHEN market_price>=max_price THEN 'Filled' WHEN market_price<=min_price THEN 'Open' ELSE 'In range' END
      ELSE CASE WHEN market_price<=min_price THEN 'Filled' WHEN market_price>=max_price THEN 'Open' ELSE 'In range' END END;
    verified := verified || jsonb_build_array(to_jsonb(row_record) || jsonb_build_object(
      'owner',owner,'liquidity',liq::text,'tickLower',lower_tick,'tickUpper',upper_tick,'poolFee',fee,'tickSpacing',spacing,
      'minPrice',min_price,'maxPrice',max_price,'marketPrice',market_price,'amountDhb',dhb,'amountUsdc',usdc,'status',status));
    ask := greatest(min_price,market_price);
    IF row_record.side='sell' AND dhb > 1e-9 AND ask < max_price THEN best := least(best,ask); END IF;
  END LOOP;
  pool_market := dex_private.aggregate_market();
  SELECT coalesce(sum(value),0), coalesce(sum(value * spot),0) INTO listed_value, listed_weighted FROM (
    SELECT (p->>'amountDhb')::numeric * (p->>'marketPrice')::numeric + (p->>'amountUsdc')::numeric AS value,
           (p->>'marketPrice')::numeric AS spot FROM jsonb_array_elements(verified) p) listed;
  liquidity_now := coalesce((pool_market->>'liquidity')::numeric,0) + listed_value;
  usd_now := CASE WHEN liquidity_now > 0 THEN
    (coalesce((pool_market->>'price')::numeric,0) * coalesce((pool_market->>'liquidity')::numeric,0) + listed_weighted) / liquidity_now END;
  IF NOT (usd_now > 0) THEN usd_now := NULL; END IF;
  observed := clock_timestamp();
  -- A slow/erroring sample must not be labelled as a current minute.
  IF observed >= sample_minute + interval '1 minute' THEN RAISE EXCEPTION 'Snapshot exceeded minute'; END IF;
  INSERT INTO dex_private.price_minutes(minute,observed_at,price,positions,usd_price,liquidity_usd)
    VALUES(sample_minute,observed,best,verified,usd_now,liquidity_now);
  FOR interval_label,seconds IN SELECT * FROM (VALUES ('1m',60),('5m',300),('15m',900),('30m',1800),('1h',3600)) v(label,seconds) LOOP
    WITH grouped AS (
      SELECT floor(extract(epoch FROM minute)/seconds)*seconds AS time,
        (array_agg(usd_price ORDER BY minute))[1] AS open, max(usd_price) AS high, min(usd_price) AS low,
        (array_agg(usd_price ORDER BY minute DESC))[1] AS close, max(extract(epoch FROM observed_at)) AS "observedAt"
      FROM dex_private.price_minutes
      WHERE minute >= sample_minute - make_interval(secs => seconds*120) AND usd_price IS NOT NULL
      GROUP BY 1 ORDER BY 1 DESC LIMIT 120
    ) SELECT coalesce(jsonb_agg(to_jsonb(grouped) ORDER BY time),'[]'::jsonb) INTO candles FROM grouped;
    candle_sets := candle_sets || jsonb_build_object(interval_label,candles);
  END LOOP;
  SELECT usd_price INTO previous_price FROM dex_private.price_minutes
    WHERE minute <= sample_minute - interval '24 hours' AND usd_price IS NOT NULL ORDER BY minute DESC LIMIT 1;
  UPDATE dex_private.market_state SET payload = jsonb_build_object('version',1,'startedAt',extract(epoch FROM started),
    'observedAt',extract(epoch FROM observed),'price',best,'positions',verified,'candles',candle_sets,'blocks',blocks,
    'usdPrice',usd_now,'liquidityUsd',liquidity_now,
    'change24h',CASE WHEN previous_price > 0 AND usd_now IS NOT NULL THEN (usd_now/previous_price-1)*100 ELSE NULL END) WHERE id;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA dex_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA dex_private FROM PUBLIC, anon, authenticated;
