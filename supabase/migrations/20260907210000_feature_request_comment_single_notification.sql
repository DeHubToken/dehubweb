-- APPLIED 2026-09-07
--
-- `feature_request_comments` carried two AFTER INSERT triggers running the same
-- function, so every comment wrote the request's author two identical bell rows.
-- The second one arrived in the same microsecond, which is why it read as a
-- rendering duplicate rather than a double write. Six live rows were affected.
--
-- The comment-count pair is harmless (the function recomputes with COUNT(*), so
-- running it twice lands on the same number) but it does a full count per insert
-- for nothing, so the spare goes too.

DROP TRIGGER IF EXISTS trg_notify_feature_request_comment ON public.feature_request_comments;
DROP TRIGGER IF EXISTS update_comment_count ON public.feature_request_comments;

-- Collapse the rows the second trigger already wrote. A duplicate is byte-identical
-- down to created_at, so identity is the whole tuple and the survivor is arbitrary.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY recipient_address, actor_address, reference_id, content, created_at
    ORDER BY id
  ) AS rn
  FROM public.custom_notifications
  WHERE type = 'feature_request_comment'
)
DELETE FROM public.custom_notifications c
USING ranked r
WHERE c.id = r.id AND r.rn > 1;
