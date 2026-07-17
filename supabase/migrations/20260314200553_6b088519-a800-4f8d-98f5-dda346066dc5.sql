ALTER TABLE public.category_post_log ADD COLUMN IF NOT EXISTS token_id integer;

CREATE UNIQUE INDEX IF NOT EXISTS idx_category_post_log_token_name 
ON public.category_post_log (token_id, name) WHERE token_id IS NOT NULL;