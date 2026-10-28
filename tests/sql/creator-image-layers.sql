INSERT INTO public.ai_generation_jobs(id,wallet_address,status,result) VALUES
('00000000-0000-4000-8000-000000000040','owner','succeeded',
 '{"status":"succeeded","savePending":true,"layerSet":{"id":"00000000-0000-4000-8000-000000000040","layers":[{"id":"child-0","rawUrl":"https://fal.media/0.png"},{"id":"child-1","rawUrl":"https://fal.media/1.png"}]},"layerImages":[{"url":"https://fal.media/0.png"}]}');
DO $$ DECLARE original jsonb; BEGIN
 SELECT result-'libraryId'-'savePending' INTO original FROM public.ai_generation_jobs WHERE id='00000000-0000-4000-8000-000000000040';
 UPDATE public.ai_generation_jobs SET result=(result-'savePending')||'{"libraryId":"00000000-0000-4000-8000-000000000040"}' WHERE id='00000000-0000-4000-8000-000000000040';
 IF (SELECT result-'libraryId'-'savePending' FROM public.ai_generation_jobs WHERE id='00000000-0000-4000-8000-000000000040')<>original THEN RAISE EXCEPTION 'archive changed provider output'; END IF;
 BEGIN
   UPDATE public.ai_generation_jobs SET result=jsonb_set(result,'{layerSet,layers,0,rawUrl}','"https://fal.media/replaced.png"') WHERE id='00000000-0000-4000-8000-000000000040';
   RAISE EXCEPTION 'terminal manifest mutation accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'GENERATION_TERMINAL_CONFLICT' THEN RAISE; END IF; END;
 BEGIN
   UPDATE public.ai_generation_jobs SET result=jsonb_set(result,'{layerSet,layers,0,id}','"new-child"') WHERE id='00000000-0000-4000-8000-000000000040';
   RAISE EXCEPTION 'terminal child id mutation accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'GENERATION_TERMINAL_CONFLICT' THEN RAISE; END IF; END;
 UPDATE public.ai_generation_jobs SET result=result||'{"savePending":true}' WHERE id='00000000-0000-4000-8000-000000000040';
END $$;
