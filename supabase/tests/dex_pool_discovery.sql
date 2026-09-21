-- Run after the migration. All observations made by this test are rolled back.
BEGIN;
DO $$
DECLARE snapshot jsonb; outside_count integer;
BEGIN
  IF has_table_privilege('anon','public.dex_pool_scan','SELECT') AND
     EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dex_pool_scan')
  THEN RAISE EXCEPTION 'Scan cursor is readable'; END IF;
  IF has_function_privilege('anon','public.record_dex_pool_positions(jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'Public write into the discovery index'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dex_pool_positions'
                 AND cmd='SELECT') THEN RAISE EXCEPTION 'Discovered positions are not readable'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dex_pool_positions'
             AND cmd <> 'SELECT') THEN RAISE EXCEPTION 'Discovery index is publicly writable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='dex-pool-position-scan')
  THEN RAISE EXCEPTION 'Scanner is not scheduled'; END IF;

  -- Re-recording an earlier sighting wins; a later one is ignored.
  PERFORM public.record_dex_pool_positions(jsonb_build_array(jsonb_build_object(
    'chain_id',8453,'token_id','999999999','mint_tx_hash','0x' || repeat('a',64),
    'block_number',200,'created_at',now())));
  PERFORM public.record_dex_pool_positions(jsonb_build_array(jsonb_build_object(
    'chain_id',8453,'token_id','999999999','mint_tx_hash','0x' || repeat('b',64),
    'block_number',300,'created_at',now())));
  IF (SELECT block_number FROM public.dex_pool_positions
      WHERE chain_id=8453 AND token_id='999999999') <> 200
  THEN RAISE EXCEPTION 'Later sighting overwrote the mint'; END IF;
  PERFORM public.record_dex_pool_positions(jsonb_build_array(jsonb_build_object(
    'chain_id',8453,'token_id','999999999','mint_tx_hash','0x' || repeat('c',64),
    'block_number',100,'created_at',now())));
  IF (SELECT block_number FROM public.dex_pool_positions
      WHERE chain_id=8453 AND token_id='999999999') <> 100
  THEN RAISE EXCEPTION 'Earlier sighting was not adopted'; END IF;

  -- The snapshot must consider discovered rows, not only the app's own index.
  SELECT count(*) INTO outside_count FROM public.dex_pool_positions d
    WHERE NOT EXISTS (SELECT 1 FROM public.dex_sell_positions s
                      WHERE s.chain_id=d.chain_id AND s.token_id=d.token_id);
  IF outside_count = 0 THEN RAISE NOTICE 'No outside positions indexed yet'; END IF;
  PERFORM dex_private.sample_market();
  snapshot := public.get_dex_market();
  IF snapshot IS NULL OR snapshot->'positions' IS NULL THEN RAISE EXCEPTION 'Snapshot lost its positions'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(snapshot->'positions') p
             WHERE p->>'side' NOT IN ('buy','sell')) THEN RAISE EXCEPTION 'Position without a side'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(snapshot->'positions') p
             WHERE (p->>'minPrice')::numeric >= (p->>'maxPrice')::numeric)
  THEN RAISE EXCEPTION 'Inverted price range'; END IF;
END $$;
ROLLBACK;
