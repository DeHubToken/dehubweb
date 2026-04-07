DROP POLICY "Users can create their own drafts" ON public.post_drafts;

CREATE POLICY "Users can create their own drafts"
ON public.post_drafts FOR INSERT
WITH CHECK (wallet_address = current_setting('request.headers', true)::json->>'x-wallet-address');