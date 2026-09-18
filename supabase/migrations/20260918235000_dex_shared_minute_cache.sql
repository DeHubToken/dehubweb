-- One authoritative DHB/USDC snapshot per minute. Public reads never contact RPCs.
CREATE SCHEMA IF NOT EXISTS dex_private;
REVOKE ALL ON SCHEMA dex_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS dex_private.market_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  started_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb
);
INSERT INTO dex_private.market_state(id) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS dex_private.price_minutes (
  minute timestamptz PRIMARY KEY,
  observed_at timestamptz NOT NULL,
  price numeric CHECK (price > 0),
  positions jsonb NOT NULL
);
ALTER TABLE dex_private.market_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE dex_private.price_minutes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION dex_private.hex_number(value text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog AS $$
DECLARE result numeric := 0; digit integer; ch text;
BEGIN
  value := regexp_replace(lower(value), '^0x', '');
  IF value = '' OR value !~ '^[0-9a-f]+$' THEN RAISE EXCEPTION 'Invalid hex'; END IF;
  FOR i IN 1..length(value) LOOP
    ch := substr(value, i, 1); digit := strpos('0123456789abcdef', ch) - 1;
    result := result * 16 + digit;
  END LOOP;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION dex_private.uint_hex(value numeric)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog AS $$
DECLARE result text := ''; digit integer;
BEGIN
  IF value < 0 OR value <> trunc(value) OR value >= power(2::numeric, 256) THEN RAISE EXCEPTION 'Invalid uint256'; END IF;
  WHILE value > 0 LOOP
    digit := mod(value, 16)::integer;
    result := substr('0123456789abcdef', digit + 1, 1) || result;
    value := div(value, 16);
  END LOOP;
  RETURN lpad(result, 64, '0');
END $$;

CREATE OR REPLACE FUNCTION dex_private.word(value text, idx integer)
RETURNS numeric LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $$
  SELECT dex_private.hex_number(substr(value, 3 + idx * 64, 64))
$$;

CREATE OR REPLACE FUNCTION dex_private.rpc(chain integer, calls jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE endpoint text; endpoints text[]; reply record; answer jsonb; last_error text;
BEGIN
  endpoints := CASE chain
    WHEN 8453 THEN ARRAY['https://base-rpc.publicnode.com','https://mainnet.base.org']
    WHEN 56 THEN ARRAY['https://bsc-rpc.publicnode.com','https://bsc-dataseed.binance.org']
    ELSE NULL END;
  IF endpoints IS NULL THEN RAISE EXCEPTION 'Unsupported chain'; END IF;
  PERFORM trench_internal.http_set_curlopt('CURLOPT_TIMEOUT_MS', '6000');
  PERFORM trench_internal.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '2000');
  FOREACH endpoint IN ARRAY endpoints LOOP
    BEGIN
      SELECT * INTO reply FROM trench_internal.http_post(endpoint, calls::text, 'application/json');
      IF reply.status <> 200 THEN RAISE EXCEPTION 'RPC HTTP %', reply.status; END IF;
      answer := reply.content::jsonb;
      IF answer->'error' IS NOT NULL THEN RAISE EXCEPTION 'RPC error'; END IF;
      RETURN answer;
    EXCEPTION WHEN OTHERS THEN last_error := SQLERRM;
    END;
  END LOOP;
  RAISE EXCEPTION 'Chain % unavailable: %', chain, last_error;
END $$;

CREATE OR REPLACE FUNCTION dex_private.call(chain integer, target text, calldata text, block_tag text)
RETURNS text LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE answer jsonb; result text;
BEGIN
  answer := dex_private.rpc(chain, jsonb_build_object('jsonrpc','2.0','id',1,'method','eth_call',
    'params',jsonb_build_array(jsonb_build_object('to',target,'data',calldata),block_tag)));
  result := answer->>'result';
  IF result IS NULL OR result !~ '^0x[0-9a-fA-F]+$' THEN RAISE EXCEPTION 'Invalid call result'; END IF;
  RETURN result;
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
CREATE OR REPLACE FUNCTION public.get_dex_market()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT payload FROM dex_private.market_state WHERE id
$$;
REVOKE ALL ON FUNCTION public.get_dex_market() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dex_market() TO anon, authenticated, service_role;
DO $schedule$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='dex-shared-minute-price') THEN
    PERFORM cron.unschedule('dex-shared-minute-price');
  END IF;
  PERFORM cron.schedule('dex-shared-minute-price','* * * * *','SELECT dex_private.sample_market();');
END $schedule$;
