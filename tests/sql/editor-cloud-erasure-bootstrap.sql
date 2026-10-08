-- Minimal existing account tables exercise the complete erasure entry point.
ALTER TABLE storage.objects ADD COLUMN owner uuid, ADD COLUMN owner_id text;
ALTER TABLE public.editor_assets ADD COLUMN wallet_address text;
CREATE TABLE public.event_chat_messages(id uuid PRIMARY KEY,wallet_address text,reply_to_id uuid);
CREATE TABLE public.stores(id uuid PRIMARY KEY,wallet_address text,name text,description text,avatar_url text,banner_url text,is_active boolean);
CREATE TABLE public.communities(id uuid PRIMARY KEY,creator_wallet_address text,name text,slug text,description text,avatar_url text,banner_url text,rules jsonb);
CREATE TABLE public.community_events(id uuid PRIMARY KEY,creator_wallet_address text,creator_username text,creator_avatar text,title text,description text,cover_image_url text,location text,is_private boolean);
CREATE TABLE public.ad_accounts(wallet_address text,company_name text,website text,status text);
CREATE TABLE public.ad_campaigns(wallet_address text,name text,status text,review_note text,targeting jsonb,cta_url text);
CREATE TABLE public.ad_creatives(wallet_address text,headline text,body text,media_url text,thumbnail_url text,cta_url text,cta_label text,review_note text,status text);
CREATE TABLE public.store_listings(wallet_address text,title text,description text,images jsonb,digital_file_url text,shipping_info text,external_url text,status text);
CREATE TABLE public.passkey_challenges(user_id uuid);
CREATE TABLE public.passkey_identities(user_id uuid);
CREATE TABLE public.user_wallet_passkeys(user_id uuid);
CREATE TABLE public.user_wallet_recovery(user_id uuid);
CREATE TABLE public.user_wallets(user_id uuid);
