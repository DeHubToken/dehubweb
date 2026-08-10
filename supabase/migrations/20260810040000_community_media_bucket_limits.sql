-- Restore the community-media upload limits
-- =========================================
-- 20260804120000_community_admin_system.sql ended with an UPDATE on
-- storage.buckets that caps community avatars, banners and event images at
-- 10 MB and restricts them to still images. When that migration was applied on
-- 10 Aug 2026 the tooling ran every statement in the file except this one —
-- statements against the storage schema were dropped silently — so the bucket
-- is still uncapped and accepts any MIME type.
--
-- Re-stating it here rather than editing the original, which is already
-- recorded as applied and would never re-run.
--
-- Note for whoever applies this: if the migration runner refuses it again, run
-- it directly in the Supabase SQL editor. It is a single idempotent UPDATE.

UPDATE storage.buckets
   SET file_size_limit = 10485760,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
 WHERE id = 'community-media';
