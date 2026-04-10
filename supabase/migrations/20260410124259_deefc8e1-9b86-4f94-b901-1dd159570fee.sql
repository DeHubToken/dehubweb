
INSERT INTO storage.buckets (id, name, public) VALUES ('ai-media-uploads', 'ai-media-uploads', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can upload ai media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'ai-media-uploads');
CREATE POLICY "Anyone can read ai media" ON storage.objects FOR SELECT USING (bucket_id = 'ai-media-uploads');
