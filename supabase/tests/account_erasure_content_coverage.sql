-- Run after installing the migration in the same transaction. Always roll back.
DO $$
<<audit>>
DECLARE
  w text := '0x' || replace(gen_random_uuid()::text, '-', '') || 'decafbad';
  other_wallet text := '0x' || replace(gen_random_uuid()::text, '-', '') || 'decafbad';
  community_id uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  campaign_id uuid := gen_random_uuid();
  creative_id uuid := gen_random_uuid();
  store_id uuid := gen_random_uuid();
  listing_id uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('dehub.community_privileged', '1', true);
  INSERT INTO public.communities(id,name,slug,creator_wallet_address,description)
    VALUES (community_id,'Private creator name','audit-' || community_id,upper(w),'Private description');
  PERFORM set_config('dehub.community_privileged', '1', true);
  INSERT INTO public.community_members(community_id,wallet_address)
    VALUES (community_id,w),(community_id,other_wallet) ON CONFLICT DO NOTHING;
  INSERT INTO public.community_events(id,community_id,creator_wallet_address,creator_username,title,starts_at,location)
    VALUES (event_id,community_id,w,'private-name','Private event',now(),'Private location');
  INSERT INTO public.ad_accounts(wallet_address,company_name,website,balance_usd,total_deposited_usd)
    VALUES (w,'Private company','https://example.invalid',10,20),(other_wallet,'Other company',NULL,3,4);
  INSERT INTO public.ad_campaigns(id,wallet_address,name,daily_budget_usd,total_budget_usd,spent_usd)
    VALUES (campaign_id,w,'Private campaign',1,2,1);
  INSERT INTO public.ad_creatives(id,campaign_id,wallet_address,kind,headline,body,media_url)
    VALUES (creative_id,campaign_id,w,'text','Private headline','Private content','https://example.invalid/photo');
  INSERT INTO public.stores(id,wallet_address,name) VALUES (store_id,w,'Private shop');
  INSERT INTO public.store_listings(id,store_id,wallet_address,title,price,shipping_info,digital_file_url)
    VALUES (listing_id,store_id,w,'Private listing',7,'{"address":"Private shipping"}','https://example.invalid/file');

  PERFORM set_config('dehub.community_privileged', '0', true);
  PERFORM public.erase_account_app_data(w,NULL);
  IF current_setting('dehub.community_privileged', true)<>'0' THEN
    RAISE EXCEPTION 'Erasure leaked the community privilege context'; END IF;
  IF EXISTS (SELECT 1 FROM public.communities WHERE id=community_id AND
    (creator_wallet_address<> '0x0000000000000000000000000000000000000000' OR description IS NOT NULL OR name<>'Deleted community'))
    THEN RAISE EXCEPTION 'Community identity was retained'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.community_members m WHERE m.community_id=audit.community_id AND wallet_address=other_wallet)
    THEN RAISE EXCEPTION 'Another community member was removed'; END IF;
  IF EXISTS (SELECT 1 FROM public.community_events WHERE id=event_id AND
    (creator_username IS NOT NULL OR location IS NOT NULL OR is_private=false))
    THEN RAISE EXCEPTION 'Event identity was retained'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ad_accounts WHERE wallet_address=w AND company_name IS NULL AND website IS NULL
    AND balance_usd=10 AND total_deposited_usd=20 AND status='suspended')
    THEN RAISE EXCEPTION 'Ad identity was not cleared or accounting changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ad_accounts WHERE wallet_address=other_wallet AND company_name='Other company')
    THEN RAISE EXCEPTION 'Another advertiser was changed'; END IF;
  IF EXISTS (SELECT 1 FROM public.ad_creatives WHERE id=creative_id AND (body IS NOT NULL OR media_url IS NOT NULL))
    THEN RAISE EXCEPTION 'Ad content was retained'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ad_campaigns WHERE id=campaign_id AND spent_usd=1 AND status='archived')
    THEN RAISE EXCEPTION 'Campaign accounting changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.store_listings WHERE id=listing_id AND price=7 AND shipping_info IS NULL
    AND digital_file_url IS NULL AND status='archived')
    THEN RAISE EXCEPTION 'Store identity was not cleared or accounting changed'; END IF;
END;
$$;
