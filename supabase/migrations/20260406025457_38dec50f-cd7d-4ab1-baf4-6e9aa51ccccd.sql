-- Allow hosts to delete their own audio spaces
CREATE POLICY "Host can delete their own space"
ON public.audio_spaces
FOR DELETE
USING (lower(host_wallet_address) = get_request_wallet_address());