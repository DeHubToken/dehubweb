CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA wallet_auth;
REVOKE ALL ON SCHEMA wallet_auth FROM PUBLIC;
CREATE TABLE wallet_auth.secret(id int PRIMARY KEY,key bytea NOT NULL);
INSERT INTO wallet_auth.secret VALUES(1,decode(repeat('11',32),'hex'));
CREATE TABLE public.editor_assets(id uuid PRIMARY KEY,provenance jsonb);
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text NOT NULL,public boolean DEFAULT false,file_size_limit bigint);
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,bucket_id text REFERENCES storage.buckets(id),name text NOT NULL,metadata jsonb DEFAULT '{}',UNIQUE(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public,storage TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;
GRANT SELECT ON storage.buckets TO anon,authenticated;
GRANT ALL ON storage.objects,storage.buckets TO service_role;
INSERT INTO storage.buckets(id,name,public) VALUES('public-fixture','public-fixture',true);
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('public-fixture','public.png','{"size":10}');
CREATE POLICY fixture_public_read ON storage.objects FOR SELECT USING(bucket_id='public-fixture');

CREATE FUNCTION public.cloud_test_headers(wallet text,expires bigint DEFAULT extract(epoch FROM now())::bigint+3600) RETURNS void LANGUAGE plpgsql AS $$
DECLARE token text;
BEGIN
  token:=wallet||'.'||expires||'.'||encode(extensions.hmac(convert_to(wallet||'.'||expires,'UTF8'),decode(repeat('11',32),'hex'),'sha256'),'hex');
  PERFORM set_config('request.headers',jsonb_build_object('x-wallet-address',wallet,'x-wallet-session',token)::text,false);
END $$;
CREATE FUNCTION public.cloud_test_error(query text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE query;
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE=expected THEN RETURN; END IF; RAISE; END;
  RAISE EXCEPTION 'Expected SQLSTATE % for %',expected,query;
END $$;
