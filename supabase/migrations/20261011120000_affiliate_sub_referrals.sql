-- Outreach identifiers are private to the direct affiliate. Existing public
-- referral records and commission accounting keep their current shape.
-- The general wallet resolver still allows unsigned headers during rollout.
-- Private outreach attribution always requires the signed session itself.
CREATE OR REPLACE FUNCTION public.affiliate_wallet() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE headers jsonb; parts text[]; secret_key bytea; claimed text;
BEGIN
  headers := coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  parts := string_to_array(headers->>'x-wallet-session','.');
  IF array_length(parts,1) IS DISTINCT FROM 3 OR parts[1] !~ '^0x[a-f0-9]{40}$'
     OR parts[2] !~ '^[0-9]{1,12}$' OR parts[3] !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  IF parts[2]::bigint <= extract(epoch FROM now()) THEN RETURN NULL; END IF;
  SELECT key INTO secret_key FROM wallet_auth.secret WHERE id=1;
  IF secret_key IS NULL OR encode(extensions.hmac(convert_to(parts[1]||'.'||parts[2],'UTF8'),secret_key,'sha256'),'hex') IS DISTINCT FROM parts[3] THEN RETURN NULL; END IF;
  claimed := lower(headers->>'x-wallet-address');
  IF claimed IS NOT NULL AND claimed <> parts[1] THEN RETURN NULL; END IF;
  RETURN parts[1];
END;
$$;
REVOKE ALL ON FUNCTION public.affiliate_wallet() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.affiliate_wallet() TO anon, authenticated;

CREATE TABLE public.affiliate_sub_referrals (
  referral_id uuid PRIMARY KEY REFERENCES public.affiliate_referrals(id) ON DELETE CASCADE,
  owner_address text NOT NULL CHECK (owner_address ~ '^0x[a-f0-9]{40}$'),
  sub_id text NOT NULL CHECK (sub_id ~ '^[A-Za-z0-9_.-]{1,64}$')
);
CREATE INDEX affiliate_sub_referrals_owner_idx ON public.affiliate_sub_referrals(owner_address, sub_id);
ALTER TABLE public.affiliate_sub_referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.affiliate_sub_referrals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.affiliate_sub_referrals TO anon, authenticated;
GRANT ALL ON public.affiliate_sub_referrals TO service_role;
CREATE POLICY "Direct owners read outreach identifiers" ON public.affiliate_sub_referrals
  FOR SELECT TO anon, authenticated USING (owner_address = public.affiliate_wallet());

CREATE OR REPLACE FUNCTION public.attribute_affiliate_referral(p_code text, p_sub_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  who text := public.affiliate_wallet();
  parent text;
  secondary text;
  referral uuid;
  code_value text := upper(btrim(p_code));
  sub_value text := nullif(btrim(p_sub_id), '');
BEGIN
  IF who IS NULL OR who !~ '^0x[a-f0-9]{40}$' THEN RAISE EXCEPTION 'Sign in to attribute a referral'; END IF;
  SELECT lower(owner_address) INTO parent FROM public.affiliate_codes WHERE code = code_value AND active;
  IF parent IS NULL OR parent = who THEN RETURN; END IF;
  SELECT lower(owner_address) INTO secondary FROM public.affiliate_referrals WHERE referred_address = parent;
  INSERT INTO public.affiliate_referrals(code,owner_address,referred_address,l2_owner_address,source)
    VALUES (code_value,parent,who,CASE WHEN secondary <> who THEN secondary END,'dehub.io')
    ON CONFLICT (referred_address) DO NOTHING RETURNING id INTO referral;
  -- Only the successful first attribution can set a tag. Retrying or arriving
  -- from another outreach link never relabels a previous signup.
  IF referral IS NOT NULL AND sub_value ~ '^[A-Za-z0-9_.-]{1,64}$' THEN
    INSERT INTO public.affiliate_sub_referrals(referral_id,owner_address,sub_id)
      VALUES (referral,parent,sub_value);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.attribute_affiliate_referral(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attribute_affiliate_referral(text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_affiliate_sub_referrals()
RETURNS TABLE(referred_address text, sub_id text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT r.referred_address, s.sub_id
  FROM public.affiliate_sub_referrals s JOIN public.affiliate_referrals r ON r.id = s.referral_id
  WHERE s.owner_address = public.affiliate_wallet()
  ORDER BY r.created_at DESC, r.id
  LIMIT 500;
$$;
REVOKE ALL ON FUNCTION public.get_affiliate_sub_referrals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_affiliate_sub_referrals() TO anon, authenticated;
