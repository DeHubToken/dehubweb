UPDATE public.feature_requests SET status = 'completed', updated_at = now() WHERE id IN (
  '7d46a6d5-8e47-4202-a57f-f9b18e14b7e0',
  'd6db2242-a459-4484-b160-3f44b53bb69f',
  '3b0a032c-a901-4ab4-afe6-663f8818c0a6',
  'ad9b53e8-c102-4b78-a8d5-85338aa59b60',
  '14ea60d5-70de-481e-b9d2-e6b4c8d87f48'
);