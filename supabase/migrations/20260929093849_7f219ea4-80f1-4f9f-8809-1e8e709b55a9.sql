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
$function$;

CREATE OR REPLACE FUNCTION public.get_my_agents()
 RETURNS TABLE(id uuid, name text, description text, api_key text, owner_wallet_address text, is_active boolean, last_active_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.name, a.description,
         CASE WHEN public.get_signed_request_wallet_address() = LOWER(a.human_owner_wallet)
              THEN a.api_key END,
         a.owner_wallet_address, a.is_active, a.last_active_at, a.created_at
  FROM public.ai_agents a
  WHERE public.get_request_wallet_address() <> ''
    AND LOWER(a.human_owner_wallet) = public.get_request_wallet_address()
  ORDER BY a.created_at DESC;
$function$;

CREATE TABLE IF NOT EXISTS public.app_min_versions (
  platform text PRIMARY KEY CHECK (platform IN ('android', 'ios')),
  min_version text,
  recommended_version text,
  store_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_min_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "App version policy is public" ON public.app_min_versions;
CREATE POLICY "App version policy is public" ON public.app_min_versions FOR SELECT USING (true);
GRANT SELECT ON public.app_min_versions TO anon, authenticated;
INSERT INTO public.app_min_versions (platform, min_version, recommended_version, store_url)
VALUES ('android', NULL, '1.18.0', 'https://play.google.com/store/apps/details?id=io.dehub.mobile')
ON CONFLICT (platform) DO NOTHING;