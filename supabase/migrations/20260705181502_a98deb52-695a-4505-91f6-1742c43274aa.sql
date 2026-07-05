
-- Extensions for scheduled cleanup
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Editor assets table
CREATE TABLE public.editor_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('video','audio','image','export')),
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  duration_seconds DOUBLE PRECISION,
  width INTEGER,
  height INTEGER,
  preserved BOOLEAN NOT NULL DEFAULT false,
  posted_post_id TEXT,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX editor_assets_wallet_idx ON public.editor_assets (wallet_address);
CREATE INDEX editor_assets_cleanup_idx ON public.editor_assets (preserved, last_used_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.editor_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.editor_assets TO anon;
GRANT ALL ON public.editor_assets TO service_role;

ALTER TABLE public.editor_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "editor_assets owner select" ON public.editor_assets
  FOR SELECT USING (lower(wallet_address) = public.get_request_wallet_address());

CREATE POLICY "editor_assets owner insert" ON public.editor_assets
  FOR INSERT WITH CHECK (lower(wallet_address) = public.get_request_wallet_address());

CREATE POLICY "editor_assets owner update" ON public.editor_assets
  FOR UPDATE USING (lower(wallet_address) = public.get_request_wallet_address())
  WITH CHECK (lower(wallet_address) = public.get_request_wallet_address());

CREATE POLICY "editor_assets owner delete" ON public.editor_assets
  FOR DELETE USING (lower(wallet_address) = public.get_request_wallet_address());

CREATE TRIGGER editor_assets_updated_at
  BEFORE UPDATE ON public.editor_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Usage aggregate
CREATE OR REPLACE FUNCTION public.get_editor_storage_usage(_wallet TEXT)
RETURNS TABLE (used_bytes BIGINT, asset_count BIGINT)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(size_bytes), 0)::BIGINT AS used_bytes,
         COUNT(*)::BIGINT AS asset_count
  FROM public.editor_assets
  WHERE lower(wallet_address) = lower(_wallet);
$$;

-- Storage RLS on editor-assets bucket (each user reads/writes under /<wallet>/...)
CREATE POLICY "editor_assets bucket owner read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'editor-assets'
    AND lower(split_part(name, '/', 1)) = public.get_request_wallet_address()
  );

CREATE POLICY "editor_assets bucket owner insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'editor-assets'
    AND lower(split_part(name, '/', 1)) = public.get_request_wallet_address()
  );

CREATE POLICY "editor_assets bucket owner update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'editor-assets'
    AND lower(split_part(name, '/', 1)) = public.get_request_wallet_address()
  );

CREATE POLICY "editor_assets bucket owner delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'editor-assets'
    AND lower(split_part(name, '/', 1)) = public.get_request_wallet_address()
  );

-- Daily cleanup cron: invokes edge function
SELECT cron.schedule(
  'editor-assets-cleanup-daily',
  '15 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/editor-assets-cleanup',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  );
  $$
);
