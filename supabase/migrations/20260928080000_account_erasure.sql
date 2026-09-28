-- Called only by the account-erasure service after the backend accepts a
-- deletion request for the account its verified session belongs to.
CREATE OR REPLACE FUNCTION public.account_erasure_storage(p_wallet text, p_user_id uuid DEFAULT NULL)
RETURNS TABLE(bucket_id text, name text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, storage AS $$
  SELECT o.bucket_id, o.name FROM storage.objects o
  WHERE (p_user_id IS NOT NULL AND (o.owner = p_user_id OR o.owner_id = p_user_id::text))
     OR split_part(lower(o.name), '/', 1) = lower(p_wallet);
$$;
REVOKE ALL ON FUNCTION public.account_erasure_storage(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_erasure_storage(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.erase_account_app_data(p_wallet text, p_user_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w text := lower(p_wallet);
  target record;
BEGIN
  IF w IS NULL OR w !~ '^0x[a-f0-9]{40}$' THEN RAISE EXCEPTION 'Invalid wallet'; END IF;
  UPDATE public.event_chat_messages SET reply_to_id=NULL
    WHERE reply_to_id IN (SELECT id FROM public.event_chat_messages WHERE lower(wallet_address)=w);
  -- Trading receipts keep the store identifier; its personal profile is removed.
  UPDATE public.stores SET name=NULL, description=NULL, avatar_url=NULL, banner_url=NULL, is_active=false
    WHERE lower(wallet_address)=w;
  -- Child rows precede the parent rows. Payment, settlement and public-chain
  -- ledgers remain for accounting; personal profile/activity data is erased.
  FOR target IN SELECT * FROM (VALUES
    ('story_views','viewer_wallet_address'),
    ('story_reactions','wallet_address'), ('story_comments','wallet_address'),
    ('stories','wallet_address'), ('stage_chat_messages','wallet_address'),
    ('event_chat_messages','wallet_address'), ('tv_chat_messages','wallet_address'),
    ('community_chat_messages','wallet_address'), ('community_event_rsvps','wallet_address'),
    ('community_members','wallet_address'), ('pinned_communities','wallet_address'),
    ('space_participants','wallet_address'), ('raise_hand_requests','wallet_address'),
    ('stage_reminders','wallet_address'), ('arcade_map_presence','wallet_address'),
    ('feature_request_comment_reactions','wallet_address'), ('feature_request_comments','wallet_address'),
    ('feature_request_votes','wallet_address'), ('feature_shipped_notifications','wallet_address'),
    ('governance_comment_reactions','wallet_address'), ('governance_comments','wallet_address'),
    ('ai_user_memories','wallet_address'), ('ai_conversations','wallet_address'),
    ('ai_free_generations','wallet_address'), ('ai_generation_jobs','wallet_address'),
    ('dub_jobs','wallet_address'), ('custom_voices','wallet_address'),
    ('editor_assets','wallet_address'), ('creator_assets','wallet_address'),
    ('post_drafts','wallet_address'), ('post_link_copies','wallet_address'),
    ('social_crossposts','wallet_address'), ('social_farcaster_signers','wallet_address'),
    ('social_profiles','wallet_address'), ('saved_addresses','wallet_address'),
    ('user_display_preferences','wallet_address'), ('user_privacy_settings','wallet_address'),
    ('user_feedback_surveys','wallet_address'), ('user_testimonials','wallet_address'),
    ('onboarding_events','wallet_address'), ('onboarding_progress','wallet_address'),
    ('new_members','wallet_address'), ('santa_snake_scores','wallet_address'),
    ('feature_requests','author_wallet_address'),
    ('creator_packs','owner'), ('custom_emojis','created_by'),
    ('ai_agents','human_owner_wallet'),
    ('audio_spaces','host_wallet_address'),
    ('creator_flows','wallet'), ('creator_folder_items','wallet'), ('creator_folders','wallet'),
    ('saved_creator_packs','wallet'), ('builder_projects','wallet'),
    ('user_skills','creator_wallet_address'), ('user_characters','creator_wallet_address'),
    ('post_discussion_settings','creator_address'), ('ad_audience_members','wallet_address'),
    ('affiliate_page_views','owner_address'), ('affiliate_cta_clicks','owner_address'),
    ('arcade_runs','wallet'), ('arcade_scores','wallet'),
    ('trench_alerts','wallet'), ('trench_members','wallet'), ('trench_desks','wallet'),
    ('trench_paper','wallet')
  ) AS targets(table_name, column_name)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public'
      AND c.table_name=target.table_name AND c.column_name=target.column_name) THEN
      EXECUTE format('DELETE FROM public.%I WHERE lower(%I::text) = $1', target.table_name, target.column_name) USING w;
    END IF;
  END LOOP;
  IF p_user_id IS NOT NULL THEN
    DELETE FROM public.passkey_challenges WHERE user_id=p_user_id;
    DELETE FROM public.passkey_identities WHERE user_id=p_user_id;
    DELETE FROM public.user_wallet_passkeys WHERE user_id=p_user_id;
    DELETE FROM public.user_wallet_recovery WHERE user_id=p_user_id;
    DELETE FROM public.user_wallets WHERE user_id=p_user_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.erase_account_app_data(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erase_account_app_data(text, uuid) TO service_role;
