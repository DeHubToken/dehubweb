\ir community-posts-bootstrap.sql

-- Same signed-session validator as production. The secret above is a test fixture.
CREATE OR REPLACE FUNCTION public.get_signed_request_wallet_address()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  cached text := current_setting('dehub.signed_wallet', true);
  headers json;
  sess text;
  parts text[];
  w text := '';
  k bytea;
BEGIN
  IF cached LIKE 'v:%' THEN
    RETURN substr(cached, 3);
  END IF;

  headers := nullif(current_setting('request.headers', true), '')::json;
  sess := headers ->> 'x-wallet-session';

  IF sess IS NOT NULL THEN
    parts := string_to_array(sess, '.');
    IF array_length(parts, 1) = 3
       AND parts[1] ~ '^0x[a-f0-9]{40}$'
       AND parts[2] ~ '^[0-9]{1,12}$'
       AND parts[2]::bigint > extract(epoch FROM now()) THEN
      SELECT s.key INTO k FROM wallet_auth.secret s WHERE s.id = 1;
      IF encode(extensions.hmac(convert_to(parts[1] || '.' || parts[2], 'UTF8'), k, 'sha256'), 'hex') = parts[3] THEN
        w := parts[1];
      END IF;
    END IF;
  END IF;

  PERFORM set_config('dehub.signed_wallet', 'v:' || w, true);
  RETURN w;
END;
$function$
;
CREATE FUNCTION public.get_request_wallet_address() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT public.get_signed_request_wallet_address() $$;
CREATE TABLE public.community_chat_messages(
 id uuid PRIMARY KEY, community_id uuid NOT NULL REFERENCES communities(id),
 wallet_address text NOT NULL, content text NOT NULL DEFAULT '', created_at timestamptz NOT NULL,
 reply_to_id uuid, pinned_at timestamptz, pinned_by text, reactions jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.community_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Community chat read" ON public.community_chat_messages FOR SELECT
USING (
 EXISTS(SELECT 1 FROM public.communities c WHERE c.id=community_id AND NOT c.is_private)
 OR public.community_is_active_member(community_id,public.get_request_wallet_address())
);
GRANT SELECT ON public.communities,public.community_chat_messages TO anon,authenticated,service_role;
-- Each PostgREST request has its own transaction; reset its identity cache in fixtures.
CREATE FUNCTION public.history_test_session(wallet text,expired boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('dehub.signed_wallet','',true);
 PERFORM public.test_wallet(wallet,extract(epoch FROM now())::bigint + CASE WHEN expired THEN -60 ELSE 3600 END);
END $$;
