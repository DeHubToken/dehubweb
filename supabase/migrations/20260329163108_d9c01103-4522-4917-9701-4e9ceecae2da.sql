
-- Create soundboard-sounds storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('soundboard-sounds', 'soundboard-sounds', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read sounds
CREATE POLICY "Anyone can view soundboard sounds"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'soundboard-sounds');

-- Allow authenticated uploads via wallet header
CREATE POLICY "Users can upload their own sounds"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'soundboard-sounds');

-- Allow users to delete their own sounds
CREATE POLICY "Users can delete their own sounds"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'soundboard-sounds');
