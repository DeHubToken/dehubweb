-- A price feed or an RPC that is having a bad minute must not cost the whole snapshot.
--
-- aggregate_market() reaches out to Binance and to four pools. It already tolerates a single
-- unreachable pool, but a failed price feed still raised straight through sample_market, which
-- would have thrown away that minute of verified positions along with the aggregate. The
-- aggregate is now optional: when it cannot be read the snapshot is written without it, the
-- order book and positions are unaffected, and the chart simply has no candle for that minute.

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
  BEGIN
    pool_market := dex_private.aggregate_market();
  EXCEPTION WHEN OTHERS THEN pool_market := '{}'::jsonb;
  END;
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
