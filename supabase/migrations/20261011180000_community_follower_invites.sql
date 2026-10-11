CREATE TABLE public.community_invite_attempts(
 community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
 inviter text NOT NULL,recipient text NOT NULL CHECK(recipient ~ '^0x[a-f0-9]{40}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(community_id,inviter,recipient)
);
ALTER TABLE public.community_invite_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_invite_attempts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.community_invite_attempts TO anon,authenticated;
GRANT ALL ON public.community_invite_attempts TO service_role;
CREATE POLICY "Own community invitation receipts" ON public.community_invite_attempts FOR SELECT TO anon,authenticated
 USING(inviter=public.community_post_wallet());

CREATE FUNCTION public.community_claim_invite(_community_id uuid,_recipient text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text:=public.community_post_wallet(); inserted boolean;
BEGIN
 IF actor IS NULL OR NOT public.community_permission(_community_id,actor,'add_members') THEN
  RAISE EXCEPTION 'You cannot invite followers to this community' USING ERRCODE='42501';
 END IF;
 IF _recipient IS NULL OR lower(_recipient)=actor OR lower(_recipient) !~ '^0x[a-f0-9]{40}$' THEN
  RAISE EXCEPTION 'Invalid recipient' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.community_invite_attempts(community_id,inviter,recipient)
 VALUES(_community_id,actor,lower(_recipient)) ON CONFLICT DO NOTHING;
 inserted:=FOUND;
 IF inserted THEN RETURN 'claimed'; END IF;
 RETURN (SELECT status FROM public.community_invite_attempts WHERE community_id=_community_id AND inviter=actor AND recipient=lower(_recipient));
END $$;
CREATE FUNCTION public.community_confirm_invite(_community_id uuid,_recipient text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.community_invite_attempts SET status='sent'
 WHERE community_id=_community_id AND inviter=public.community_post_wallet() AND recipient=lower(_recipient);
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.community_claim_invite(uuid,text),public.community_confirm_invite(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_claim_invite(uuid,text),public.community_confirm_invite(uuid,text) TO anon,authenticated;
