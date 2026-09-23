DROP POLICY IF EXISTS "dex-pool-images public read" ON storage.objects;
CREATE POLICY "dex-pool-images public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'dex-pool-images');
DROP POLICY IF EXISTS "dex-pool-images upload" ON storage.objects;
CREATE POLICY "dex-pool-images upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'dex-pool-images');