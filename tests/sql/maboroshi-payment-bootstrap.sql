CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE FUNCTION public.get_request_wallet_address() RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
