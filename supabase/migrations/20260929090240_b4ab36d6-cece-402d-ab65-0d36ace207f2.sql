-- custom_notifications: clients may only insert a feature-request mention, in their own name.
-- Every other notification type is written by SECURITY DEFINER triggers or service-role edge
-- functions, which bypass RLS, so they are unaffected.
DROP POLICY IF EXISTS "Allow insert custom notifications" ON public.custom_notifications;
DROP POLICY IF EXISTS "Clients insert their own feature request mentions" ON public.custom_notifications;
CREATE POLICY "Clients insert their own feature request mentions"
  ON public.custom_notifications
  FOR INSERT
  TO public
  WITH CHECK (
    type = 'feature_request_mention'
    AND (select public.get_request_wallet_address()) <> ''
    AND lower(actor_address) = (select public.get_request_wallet_address())
  );