CREATE POLICY "Users can delete own unstake records"
ON public.staking_records
FOR DELETE
TO public
USING (
  action = 'unstake'
  AND lower(wallet_address) = get_request_wallet_address()
);