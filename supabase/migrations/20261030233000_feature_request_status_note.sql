-- Why a request was marked not feasible, shown under it on the Not feasible tab.
-- NOTE: git-pushed migrations don't reliably auto-apply; run against prod via SQL.
ALTER TABLE public.feature_requests ADD COLUMN IF NOT EXISTS status_note text;
