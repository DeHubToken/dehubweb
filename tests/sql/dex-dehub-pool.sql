DO $test$
DECLARE
  positions jsonb := '[
    {"chain_id":8453,"poolFee":0,"tickSpacing":1,"marketPrice":0.001,"side":"sell","minPrice":0.001,"maxPrice":0.002,"amountDhb":1000,"amountUsdc":5},
    {"chain_id":8453,"poolFee":3000,"tickSpacing":60,"marketPrice":0.00002,"side":"sell","minPrice":0.00002,"maxPrice":0.003,"amountDhb":900000,"amountUsdc":700},
    {"chain_id":56,"poolFee":0,"tickSpacing":1,"marketPrice":0.00001,"side":"sell","minPrice":0.00001,"maxPrice":0.003,"amountDhb":900000,"amountUsdc":800}
  ]';
  observed timestamptz := now(); result jsonb; point jsonb; row_data record;
BEGIN
  INSERT INTO dex_private.price_minutes VALUES (date_trunc('minute', observed), observed, 0.00001, positions, 0.00001, 1505, NULL);
  SELECT * INTO row_data FROM dex_private.price_minutes WHERE minute = date_trunc('minute', observed);
  IF row_data.usd_price <> 0.001 OR row_data.price <> 0.001 OR row_data.liquidity_usd <> 5
    OR row_data.positions <> '[]'::jsonb OR row_data.market_scope <> 'base-dhb-usdc-0-1' THEN
    RAISE EXCEPTION 'Scope must be calculated before positions are stripped: %', row_data;
  END IF;
  INSERT INTO dex_private.market_state VALUES (true, jsonb_build_object('version',1,'observedAt',extract(epoch FROM observed),
    'positions',positions,'usdPrice',0.00001,'externalAsks','[{"price":0.00001,"dhb":900000}]'::jsonb));
  SELECT payload INTO result FROM dex_private.market_state WHERE id;
  IF (result->>'usdPrice')::numeric <> 0.001 OR (result->>'lpDhb')::numeric <> 1000
    OR result->'externalAsks' <> '[]'::jsonb OR result->>'change24h' IS NOT NULL
    OR jsonb_array_length(result->'positions') <> 3 THEN
    RAISE EXCEPTION 'Outside pools leaked into the market or legacy positions were lost: %', result;
  END IF;
  FOR point IN SELECT value FROM jsonb_each(result->'candles') LOOP
    IF jsonb_array_length(point) <> 1 OR (point->0->>'close')::numeric <> 0.001 THEN
      RAISE EXCEPTION 'Unscoped history leaked into the chart: %', point;
    END IF;
  END LOOP;
  UPDATE dex_private.market_state SET payload = jsonb_set(payload,'{positions}', positions - 0) WHERE id;
  SELECT payload INTO result FROM dex_private.market_state WHERE id;
  IF result->>'usdPrice' IS NOT NULL OR (result->>'lpDhb')::numeric <> 0 THEN
    RAISE EXCEPTION 'An unavailable house pool must not fall back to another pool';
  END IF;
END $test$;
