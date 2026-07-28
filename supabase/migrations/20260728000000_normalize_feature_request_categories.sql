-- Normalize legacy feature_requests.category values.
--
-- `category` is a plain TEXT column with no CHECK, so rows landed with `feature`
-- (5) and `bug` (3) — values absent from CATEGORY_LABELS in
-- src/hooks/use-feature-requests.ts. On the Features page those rendered a blank
-- category badge and never matched any filter chip except "All".
--
-- Fold them into their modern equivalents, then add the constraint that should
-- have been there so the enum can't drift again.
--
-- NOTE: git-pushed migrations don't reliably auto-apply — run this against prod
-- via SQL, same as 20260719110500_ship_shipped_popup_request.sql.

UPDATE feature_requests SET category = 'new_feature' WHERE category = 'feature';
UPDATE feature_requests SET category = 'bug_fix'     WHERE category = 'bug';

-- Anything else unexpected falls back to 'other' rather than blocking the
-- constraint below.
UPDATE feature_requests
SET category = 'other'
WHERE category NOT IN ('ui_ux', 'performance', 'new_feature', 'bug_fix', 'integration', 'other');

ALTER TABLE public.feature_requests
  DROP CONSTRAINT IF EXISTS feature_requests_category_check;

ALTER TABLE public.feature_requests
  ADD CONSTRAINT feature_requests_category_check
  CHECK (category IN ('ui_ux', 'performance', 'new_feature', 'bug_fix', 'integration', 'other'));
