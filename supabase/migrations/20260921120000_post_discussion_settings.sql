-- Per-post discussion settings a creator turns on from the client.
--
-- Posts live on the NestJS/Mongo side, so Postgres cannot check that the
-- caller owns the token it is writing a row for. The policies only prove the
-- caller IS the creator_address they wrote. Ownership of the post is settled
-- by the readers: both clients drop any row whose creator_address is not the
-- post's minter, so a row written against somebody else's token is inert.
--
-- The key is (token_id, creator_address) rather than token_id alone for the
-- same reason: with a lone token_id key the first writer would own the row,
-- and anyone could lock a creator out of their own post by writing first.
CREATE TABLE IF NOT EXISTS public.post_discussion_settings (
  token_id BIGINT NOT NULL,
  creator_address TEXT NOT NULL,
  common_ground BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (token_id, creator_address)
);

ALTER TABLE public.post_discussion_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read discussion settings"
ON public.post_discussion_settings FOR SELECT USING (true);

CREATE POLICY "Creator inserts own discussion settings"
ON public.post_discussion_settings FOR INSERT
WITH CHECK (lower(creator_address) = get_request_wallet_address());

CREATE POLICY "Creator updates own discussion settings"
ON public.post_discussion_settings FOR UPDATE
USING (lower(creator_address) = get_request_wallet_address())
WITH CHECK (lower(creator_address) = get_request_wallet_address());

CREATE POLICY "Creator deletes own discussion settings"
ON public.post_discussion_settings FOR DELETE
USING (lower(creator_address) = get_request_wallet_address());

CREATE TRIGGER update_post_discussion_settings_updated_at
BEFORE UPDATE ON public.post_discussion_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
