-- The stories and dex-pool-images buckets were emptied and deleted through the Storage API
-- (Stories was removed from both apps; dex-pool-images was never used). Their access rules go too.
-- Already applied to the database (version 20260929081554); idempotent so a re-run is harmless.
drop policy if exists "Anyone can view story videos" on storage.objects;
drop policy if exists "Authenticated users can upload stories" on storage.objects;
drop policy if exists "Users can delete their own story videos" on storage.objects;
drop policy if exists "dex-pool-images public read" on storage.objects;
drop policy if exists "dex-pool-images upload" on storage.objects;
