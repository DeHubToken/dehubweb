-- Completed output remains immutable. Only replace inline media with its
-- already-uploaded, owner-scoped library object, preserving every other field.
CREATE OR REPLACE FUNCTION public.ai_generation_terminal_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE old_output jsonb; new_output jsonb; field text; saved_path text;
BEGIN
  IF OLD.status IN ('succeeded','failed','canceled','cancelled') AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'GENERATION_TERMINAL_CONFLICT'; END IF;
  IF OLD.status='refund_pending' AND NEW.status NOT IN ('refund_pending','failed','canceled','cancelled') THEN RAISE EXCEPTION 'GENERATION_TERMINAL_CONFLICT'; END IF;
  IF OLD.status IN ('failed','canceled','cancelled') THEN NEW.result:=OLD.result; END IF;
  IF OLD.status='succeeded' THEN
    old_output := OLD.result-'libraryId'-'savePending';
    new_output := NEW.result-'libraryId'-'savePending';
    IF old_output IS DISTINCT FROM new_output THEN
      FOREACH field IN ARRAY ARRAY['imageUrl','image','videoUrl','audioUrl','modelUrl'] LOOP
        saved_path := NEW.result->'storedMedia'->>field;
        IF OLD.result->>field LIKE 'data:%' AND NOT (NEW.result ? field)
          AND jsonb_typeof(NEW.result->'storedMedia'->field)='string'
          AND NEW.id=OLD.id AND NEW.wallet_address=OLD.wallet_address
          AND NEW.result->>'libraryId'=OLD.id::text
          AND starts_with(saved_path,OLD.wallet_address||'/'||OLD.id::text||'/')
          AND EXISTS (
            SELECT 1 FROM public.creator_assets a
            JOIN storage.objects o ON o.bucket_id='creator-assets' AND o.name=a.storage_path
            WHERE a.id=OLD.id::text AND a.wallet_address=OLD.wallet_address AND a.ready AND a.storage_path=saved_path
          ) THEN
          new_output := jsonb_set(new_output,ARRAY[field],OLD.result->field);
          new_output := jsonb_set(new_output,'{storedMedia}',(new_output->'storedMedia')-field);
        END IF;
      END LOOP;
      IF new_output->'storedMedia'='{}'::jsonb AND NOT (old_output ? 'storedMedia') THEN
        new_output := new_output-'storedMedia';
      END IF;
      IF old_output IS DISTINCT FROM new_output THEN RAISE EXCEPTION 'GENERATION_TERMINAL_CONFLICT'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
