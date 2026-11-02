-- Requests board comments take the same attachments as post comments:
-- one photo, video clip, audio file / voice note, or GIF per comment.
--
-- Files live in the public `feature-media` bucket (the same bucket request
-- attachments already use). GIFs are linked from Giphy as-is, the same way
-- post comments store them. The check keeps the column from pointing anywhere
-- else.

ALTER TABLE public.feature_request_comments
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_duration integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feature_request_comments_media_check'
  ) THEN
    ALTER TABLE public.feature_request_comments
      ADD CONSTRAINT feature_request_comments_media_check
      CHECK (
        (media_url IS NULL AND media_type IS NULL)
        OR (
          media_type IN ('image', 'video', 'audio', 'voice')
          AND media_url LIKE 'https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/feature-media/%'
        )
        OR (
          media_type = 'gif'
          AND media_url ~ '^https://media[0-9]*\.giphy\.com/'
        )
      );
  END IF;
END $$;
