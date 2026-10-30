-- The provider result and validated files are staged before the terminal race.
INSERT INTO public.ai_generation_jobs(id,wallet_address,tx_hash,price_dhb,kind,model,endpoint,status,result)
SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'owner','receipt',60,'tool','qwen-image-layered','fal-ai-tools','processing',
  jsonb_build_object('status','processing','providerCompleted',true,'savePending',true,'layerSet',jsonb_build_object('id',n,'layers',jsonb_build_array('one','two','three','four')))
FROM generate_series(40,41) n;
INSERT INTO public.creator_assets(id,wallet_address,storage_path,ready)
SELECT j.id::text||'-layer-'||n,'owner','owner/'||j.id::text||'-layer-'||n||'/original',false
FROM public.ai_generation_jobs j CROSS JOIN generate_series(0,3) n WHERE j.model='qwen-image-layered';
DO $$ DECLARE canceled jsonb; completed jsonb; expected jsonb; delivered jsonb; BEGIN
  -- Cancellation arrives while the four files are staged but unpublished.
  SELECT ai_generation_transition('00000000-0000-4000-8000-000000000040','cancelled',result)
    INTO canceled FROM public.ai_generation_jobs WHERE id='00000000-0000-4000-8000-000000000040';
  SELECT ai_generation_transition('00000000-0000-4000-8000-000000000040','succeeded',result,p_expected_statuses=>ARRAY['processing'])
    INTO completed FROM public.ai_generation_jobs WHERE id='00000000-0000-4000-8000-000000000040';
  IF completed->>'claimed'<>'false' OR completed->'job'->>'status'<>'refund_pending' THEN RAISE EXCEPTION 'cancellation lost its terminal decision'; END IF;
  -- Application publication is reachable only from the succeeded decision.
  IF completed->'job'->>'status'='succeeded' THEN UPDATE public.creator_assets SET ready=true WHERE id LIKE '%000000000040-layer-%'; END IF;
  IF EXISTS(SELECT 1 FROM public.creator_assets WHERE id LIKE '%000000000040-layer-%' AND ready) THEN RAISE EXCEPTION 'refunded layer outputs were published'; END IF;

  SELECT ai_generation_transition('00000000-0000-4000-8000-000000000041','succeeded',result,p_expected_statuses=>ARRAY['processing'])
    INTO completed FROM public.ai_generation_jobs WHERE id='00000000-0000-4000-8000-000000000041';
  IF completed->'job'->>'status'<>'succeeded' OR completed->'job'->'result'->>'savePending'<>'true' THEN RAISE EXCEPTION 'success must remain pending until publication'; END IF;
  -- A storage/publication outage leaves success durable and all files hidden.
  IF EXISTS(SELECT 1 FROM public.creator_assets WHERE id LIKE '%000000000041-layer-%' AND ready) THEN RAISE EXCEPTION 'publication outage delivered files'; END IF;
  SELECT ai_generation_transition('00000000-0000-4000-8000-000000000041','cancelled','{}') INTO canceled;
  IF canceled->>'claimed'<>'false' OR canceled->'job'->>'status'<>'succeeded' THEN RAISE EXCEPTION 'delivered owner changed after success'; END IF;
  -- Retry publishes the already-staged children and changes only delivery fields.
  UPDATE public.creator_assets SET ready=true WHERE id LIKE '%000000000041-layer-%';
  SELECT result INTO expected FROM public.ai_generation_jobs WHERE id='00000000-0000-4000-8000-000000000041';
  delivered:=(expected-'savePending')||'{"libraryId":"00000000-0000-4000-8000-000000000041"}';
  PERFORM ai_generation_save_result('00000000-0000-4000-8000-000000000041',expected,delivered);
  IF (SELECT result ? 'savePending' FROM public.ai_generation_jobs WHERE id='00000000-0000-4000-8000-000000000041') THEN RAISE EXCEPTION 'publication recovery did not clear pending delivery'; END IF;
  IF (SELECT count(*) FROM public.creator_assets WHERE id LIKE '%000000000041-layer-%' AND ready)<>4 THEN RAISE EXCEPTION 'publication recovery lost children'; END IF;
END $$;
