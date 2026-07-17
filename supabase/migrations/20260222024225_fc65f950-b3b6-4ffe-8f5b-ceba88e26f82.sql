
-- Create feature request comments table
CREATE TABLE public.feature_request_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_request_id UUID NOT NULL REFERENCES public.feature_requests(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  username TEXT,
  avatar TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.feature_request_comments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view comments"
  ON public.feature_request_comments FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own comments"
  ON public.feature_request_comments FOR INSERT
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can delete their own comments"
  ON public.feature_request_comments FOR DELETE
  USING (lower(wallet_address) = get_request_wallet_address());

-- Trigger to update comment_count on feature_requests
CREATE OR REPLACE FUNCTION public.update_feature_request_comment_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_id := OLD.feature_request_id;
  ELSE
    target_id := NEW.feature_request_id;
  END IF;

  UPDATE public.feature_requests
  SET comment_count = (
    SELECT COUNT(*) FROM public.feature_request_comments
    WHERE feature_request_id = target_id
  )
  WHERE id = target_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_comment_count
AFTER INSERT OR DELETE ON public.feature_request_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_feature_request_comment_count();

-- Index for fast lookups
CREATE INDEX idx_feature_request_comments_request_id ON public.feature_request_comments(feature_request_id);
