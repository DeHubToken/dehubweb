-- Create agent-avatars storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('agent-avatars', 'agent-avatars', true);

-- Allow public read access
CREATE POLICY "Allow public read on agent-avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'agent-avatars');

-- Allow service role insert
CREATE POLICY "Allow service role insert on agent-avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'agent-avatars');