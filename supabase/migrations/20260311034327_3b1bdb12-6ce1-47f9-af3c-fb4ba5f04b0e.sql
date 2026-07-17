
-- Add image_url column to feature_requests
ALTER TABLE public.feature_requests ADD COLUMN IF NOT EXISTS image_url text DEFAULT NULL;

-- Create storage bucket for feature request media
INSERT INTO storage.buckets (id, name, public)
VALUES ('feature-media', 'feature-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload to feature-media bucket
CREATE POLICY "Anyone can upload feature media"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'feature-media');

-- Allow anyone to read feature media
CREATE POLICY "Anyone can read feature media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'feature-media');

-- Allow owners to delete their own feature media
CREATE POLICY "Owners can delete feature media"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'feature-media');
