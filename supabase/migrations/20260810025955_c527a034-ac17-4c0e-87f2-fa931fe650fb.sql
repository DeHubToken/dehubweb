ALTER TABLE public.editor_assets
  ADD COLUMN IF NOT EXISTS provenance jsonb;

COMMENT ON COLUMN public.editor_assets.provenance IS
  'Creator, source, licence, and attribution details for stock-library media.';