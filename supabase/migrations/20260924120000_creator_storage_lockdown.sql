-- Editor media is only reachable through the editor-assets edge function now,
-- which takes the wallet from a verified DeHub token. The policies below trusted
-- the x-wallet-address request header, which any caller can set.
DROP POLICY IF EXISTS "editor_assets owner select" ON public.editor_assets;
DROP POLICY IF EXISTS "editor_assets owner insert" ON public.editor_assets;
DROP POLICY IF EXISTS "editor_assets owner update" ON public.editor_assets;
DROP POLICY IF EXISTS "editor_assets owner delete" ON public.editor_assets;
ALTER TABLE public.editor_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "editor_assets bucket owner read" ON storage.objects;
DROP POLICY IF EXISTS "editor_assets bucket owner insert" ON storage.objects;
DROP POLICY IF EXISTS "editor_assets bucket owner update" ON storage.objects;
DROP POLICY IF EXISTS "editor_assets bucket owner delete" ON storage.objects;

-- The usage RPC took any wallet as an argument; the edge function calls it
-- with the service role.
REVOKE EXECUTE ON FUNCTION public.get_editor_storage_usage(TEXT) FROM anon, authenticated, public;

-- ai-media-uploads stays an anonymous staging bucket (six features upload
-- references into it), but only for media and at a sane size, so it stops
-- being free hosting for arbitrary files.
UPDATE storage.buckets
SET file_size_limit = 104857600,
    allowed_mime_types = ARRAY['image/*', 'video/*', 'audio/*']
WHERE id = 'ai-media-uploads';
