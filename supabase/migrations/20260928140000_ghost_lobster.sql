-- Ghost Lobster keeps the same rung and accepts older campaign targeting.
DO $ghost$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.ads_estimate_audience(jsonb)'::regprocedure) INTO definition;
  definition := replace(definition, 'THEN ''Lobster''', 'THEN ''Ghost Lobster''');
  definition := regexp_replace(definition,
    '(?s)v_tiers := CASE WHEN p_targeting \? ''tiers''.*? ELSE NULL END;',
    'v_tiers := CASE WHEN p_targeting ? ''tiers'' THEN ARRAY(SELECT CASE t WHEN ''Lobster'' THEN ''Ghost Lobster'' WHEN ''Tortoise'' THEN ''Giant Tortoise'' WHEN ''Cobra'' THEN ''King Cobra'' WHEN ''Crocodite'' THEN ''Crocodile'' WHEN ''Meglodon'' THEN ''Megalodon'' ELSE t END FROM jsonb_array_elements_text(p_targeting -> ''tiers'') AS t) ELSE NULL END;');
  EXECUTE definition;
END $ghost$;

UPDATE public.ad_campaigns
SET targeting = jsonb_set(targeting, '{tiers}', (
  SELECT jsonb_agg(CASE t WHEN 'Lobster' THEN 'Ghost Lobster' ELSE t END)
  FROM jsonb_array_elements_text(targeting -> 'tiers') AS t
)), updated_at = now()
WHERE jsonb_typeof(targeting -> 'tiers') = 'array'
  AND (targeting -> 'tiers') ? 'Lobster';
