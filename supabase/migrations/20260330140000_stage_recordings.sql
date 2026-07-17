-- Add recording_url to audio_spaces
ALTER TABLE public.audio_spaces
  ADD COLUMN IF NOT EXISTS recording_url TEXT;

-- Supabase Storage bucket for stage recordings
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'stage-recordings',
  'stage-recordings',
  true,
  524288000, -- 500 MB max per file
  ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']
)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read recordings (public bucket)
CREATE POLICY "Public read stage recordings"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'stage-recordings');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated upload stage recordings"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'stage-recordings');

-- Allow uploader to delete their own
CREATE POLICY "Uploader can delete stage recordings"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'stage-recordings');

