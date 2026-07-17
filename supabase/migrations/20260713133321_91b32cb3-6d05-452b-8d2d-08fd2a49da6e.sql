-- Mark a batch of community feature requests / bug reports as shipped.
-- Moves these items from the "Requests" tab to the "Shipped" tab on the
-- Features page (Shipped tab = status IN ('completed','shipped')).
UPDATE feature_requests SET status = 'shipped', updated_at = now()
WHERE title IN (
  'Sign-up method info in admin panel',
  'Most commented/viewed endpoints and sort filters',
  'Notify when users unlock your PPV',
  'Match mobile app UI to web app style',
  '2FA settings',
  'ETH mainnet support',
  'PPV image posts no UX flow on mobile',
  'Fix badge position on mobile',
  'Save default category setting',
  'Send/forward posts in DMs',
  'PPV sales counter endpoint',
  'Preview Android App',
  'Create a post on android App',
  'Picture in support window',
  'Problem with Video and scrolling',
  'Disable and Enable Autoplay'
);
