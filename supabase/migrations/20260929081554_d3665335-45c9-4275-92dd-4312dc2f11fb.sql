DROP POLICY IF EXISTS "Anyone can view story videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload stories" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own story videos" ON storage.objects;
DROP POLICY IF EXISTS "dex-pool-images public read" ON storage.objects;
DROP POLICY IF EXISTS "dex-pool-images upload" ON storage.objects;