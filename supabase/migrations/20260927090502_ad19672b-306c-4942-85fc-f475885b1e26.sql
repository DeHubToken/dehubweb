-- Creator packs: badge holders publish emoji, sticker and GIF packs.
-- Every write goes through the creator-packs edge function (service role),
-- which checks the caller's badge tier and its limits. Clients only read,
-- plus save/unsave packs into their own picker.

CREATE TABLE IF NOT EXISTS public.creator_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('emoji', 'sticker', 'gif')),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 64),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{2,47}$'),
  owner text NOT NULL CHECK (owner ~ '^0x[a-f0-9]{40}$'),
  cover_url text CHECK (cover_url IS NULL OR (cover_url ~ '^https://' AND char_length(cover_url) <= 2048)),
  item_count integer NOT NULL DEFAULT 0,
  save_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS creator_packs_slug_key ON public.creator_packs (slug);
CREATE INDEX IF NOT EXISTS creator_packs_owner_kind_idx ON public.creator_packs (owner, kind);

CREATE TABLE IF NOT EXISTS public.creator_pack_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL REFERENCES public.creator_packs(id) ON DELETE CASCADE,
  image_url text NOT NULL CHECK (image_url ~ '^https://' AND char_length(image_url) <= 2048),
  animated boolean NOT NULL DEFAULT false,
  emoji text CHECK (emoji IS NULL OR char_length(emoji) <= 16),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_pack_items_pack_idx ON public.creator_pack_items (pack_id, position);

ALTER TABLE public.custom_emojis
  ADD COLUMN IF NOT EXISTS pack_id uuid REFERENCES public.creator_packs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS custom_emojis_pack_idx ON public.custom_emojis (pack_id);

CREATE TABLE IF NOT EXISTS public.saved_creator_packs (
  wallet text NOT NULL,
  pack_id uuid NOT NULL REFERENCES public.creator_packs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet, pack_id)
);

-- item_count / save_count kept by triggers so list views never count rows.
CREATE OR REPLACE FUNCTION public.creator_pack_recount()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid := COALESCE(NEW.pack_id, OLD.pack_id);
BEGIN
  IF pid IS NULL THEN RETURN NULL; END IF;
  UPDATE public.creator_packs p SET
    item_count = (SELECT count(*) FROM public.creator_pack_items i WHERE i.pack_id = pid)
               + (SELECT count(*) FROM public.custom_emojis e WHERE e.pack_id = pid),
    updated_at = now()
  WHERE p.id = pid;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS creator_pack_items_recount ON public.creator_pack_items;
CREATE TRIGGER creator_pack_items_recount AFTER INSERT OR DELETE ON public.creator_pack_items
  FOR EACH ROW EXECUTE FUNCTION public.creator_pack_recount();
DROP TRIGGER IF EXISTS custom_emojis_pack_recount ON public.custom_emojis;
CREATE TRIGGER custom_emojis_pack_recount AFTER INSERT OR DELETE ON public.custom_emojis
  FOR EACH ROW EXECUTE FUNCTION public.creator_pack_recount();

CREATE OR REPLACE FUNCTION public.creator_pack_save_recount()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid := COALESCE(NEW.pack_id, OLD.pack_id);
BEGIN
  UPDATE public.creator_packs p
    SET save_count = (SELECT count(*) FROM public.saved_creator_packs s WHERE s.pack_id = pid)
  WHERE p.id = pid;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS saved_creator_packs_recount ON public.saved_creator_packs;
CREATE TRIGGER saved_creator_packs_recount AFTER INSERT OR DELETE ON public.saved_creator_packs
  FOR EACH ROW EXECUTE FUNCTION public.creator_pack_save_recount();

-- RLS
ALTER TABLE public.creator_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_pack_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_creator_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read creator packs" ON public.creator_packs;
CREATE POLICY "Anyone can read creator packs" ON public.creator_packs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can read creator pack items" ON public.creator_pack_items;
CREATE POLICY "Anyone can read creator pack items" ON public.creator_pack_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "Wallets read their saved packs" ON public.saved_creator_packs;
CREATE POLICY "Wallets read their saved packs" ON public.saved_creator_packs FOR SELECT
  USING (lower(wallet) = get_request_wallet_address());
DROP POLICY IF EXISTS "Wallets save packs" ON public.saved_creator_packs;
CREATE POLICY "Wallets save packs" ON public.saved_creator_packs FOR INSERT
  WITH CHECK (get_request_wallet_address() <> '' AND lower(wallet) = get_request_wallet_address());
DROP POLICY IF EXISTS "Wallets unsave packs" ON public.saved_creator_packs;
CREATE POLICY "Wallets unsave packs" ON public.saved_creator_packs FOR DELETE
  USING (lower(wallet) = get_request_wallet_address());

-- custom_emojis: writes now only via the edge function (badge + tier checked there).
DROP POLICY IF EXISTS "Signed in users can add custom emojis" ON public.custom_emojis;
DROP POLICY IF EXISTS "Creators can remove their custom emojis" ON public.custom_emojis;

REVOKE ALL ON public.custom_emojis, public.creator_packs, public.creator_pack_items FROM anon, authenticated;
GRANT SELECT ON public.custom_emojis, public.creator_packs, public.creator_pack_items TO anon, authenticated;
REVOKE ALL ON public.saved_creator_packs FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.saved_creator_packs TO anon, authenticated;
GRANT ALL ON public.custom_emojis, public.creator_packs, public.creator_pack_items, public.saved_creator_packs TO service_role;