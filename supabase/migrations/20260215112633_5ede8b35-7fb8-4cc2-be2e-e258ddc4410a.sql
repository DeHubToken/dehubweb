
-- Create temporary storage bucket for image compression pipeline
INSERT INTO storage.buckets (id, name, public) VALUES ('temp-compress', 'temp-compress', true);

-- Allow public read access for downloading compressed images
CREATE POLICY "Allow public read on temp-compress"
ON storage.objects FOR SELECT
USING (bucket_id = 'temp-compress');
