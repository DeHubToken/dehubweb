-- Reserve the identity before creating its backend account. A retry keeps the same keys.
CREATE OR REPLACE FUNCTION public.reserve_agent_registration(
  _owner text,_name text,_description text,_wallet text,_private_key text,_api_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing public.ai_agents; reserved public.ai_agents;
BEGIN
  IF _owner !~ '^0x[a-f0-9]{40}$' OR _wallet !~ '^0x[a-f0-9]{40}$'
     OR _name !~ '^[a-z0-9_]{3,20}$' OR _private_key !~ '^0x[a-fA-F0-9]{64}$'
     OR _api_key !~ '^dehub_[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid registration' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('agent-owner:'||_owner,0));
  SELECT * INTO existing FROM public.ai_agents WHERE name=_name FOR UPDATE;
  IF FOUND THEN
    IF existing.human_owner_wallet=_owner AND existing.metadata->>'registration_pending'='true' THEN
      RETURN to_jsonb(existing);
    END IF;
    RAISE EXCEPTION 'Agent name is already taken' USING ERRCODE='23505';
  END IF;
  IF (SELECT count(*) FROM public.ai_agents WHERE human_owner_wallet=_owner)>=5 THEN
    RAISE EXCEPTION 'AGENT_OWNER_LIMIT' USING ERRCODE='P0001';
  END IF;
  INSERT INTO public.ai_agents(name,description,api_key,owner_wallet_address,human_owner_wallet,wallet_private_key,is_active,metadata)
  VALUES(_name,left(_description,2000),_api_key,_wallet,_owner,_private_key,false,
    jsonb_build_object('human_owner',_owner,'registered_at',now(),'chain_id',8453,'registration_pending',true))
  RETURNING * INTO reserved;
  RETURN to_jsonb(reserved);
END $$;
REVOKE ALL ON FUNCTION public.reserve_agent_registration(text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_agent_registration(text,text,text,text,text,text) TO service_role;

-- Mutations require the same signed wallet proof as key disclosure.
ALTER POLICY "Owners can delete their own agents" ON public.ai_agents
  USING(lower(human_owner_wallet)=public.community_post_wallet());
ALTER POLICY "Owners can update their own agents" ON public.ai_agents
  USING(lower(human_owner_wallet)=public.community_post_wallet())
  WITH CHECK(lower(human_owner_wallet)=public.community_post_wallet());
