
CREATE POLICY "Users can delete their own messages"
ON public.direct_messages
FOR DELETE
USING (
  lower(sender_address) = get_request_wallet_address()
  OR lower(receiver_address) = get_request_wallet_address()
);
