
-- =============================================
-- 1. COMMUNITIES TABLE
-- =============================================
CREATE TABLE public.communities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  creator_wallet_address TEXT NOT NULL,
  is_private BOOLEAN NOT NULL DEFAULT false,
  member_count INTEGER NOT NULL DEFAULT 1,
  rules JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_communities_slug ON public.communities (slug);
CREATE INDEX idx_communities_creator ON public.communities (lower(creator_wallet_address));
CREATE INDEX idx_communities_member_count ON public.communities (member_count DESC);

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view communities"
  ON public.communities FOR SELECT
  USING (true);

CREATE POLICY "Users can create communities"
  ON public.communities FOR INSERT
  WITH CHECK (lower(creator_wallet_address) = get_request_wallet_address());

CREATE POLICY "Creators can update their communities"
  ON public.communities FOR UPDATE
  USING (lower(creator_wallet_address) = get_request_wallet_address());

CREATE POLICY "Creators can delete their communities"
  ON public.communities FOR DELETE
  USING (lower(creator_wallet_address) = get_request_wallet_address());

-- Auto-update updated_at
CREATE TRIGGER update_communities_updated_at
  BEFORE UPDATE ON public.communities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 2. COMMUNITY MEMBERS TABLE
-- =============================================
CREATE TABLE public.community_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (community_id, wallet_address)
);

CREATE INDEX idx_community_members_wallet ON public.community_members (lower(wallet_address));
CREATE INDEX idx_community_members_community ON public.community_members (community_id);
CREATE INDEX idx_community_members_status ON public.community_members (community_id, status);

ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view community members"
  ON public.community_members FOR SELECT
  USING (true);

CREATE POLICY "Users can join communities"
  ON public.community_members FOR INSERT
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can leave communities"
  ON public.community_members FOR DELETE
  USING (lower(wallet_address) = get_request_wallet_address());

-- Helper function to check community role (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.get_community_role(_community_id UUID, _wallet_address TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.community_members
  WHERE community_id = _community_id
    AND lower(wallet_address) = lower(_wallet_address)
    AND status = 'active'
  LIMIT 1;
$$;

CREATE POLICY "Owners and admins can update members"
  ON public.community_members FOR UPDATE
  USING (
    public.get_community_role(community_id, get_request_wallet_address()) IN ('owner', 'admin')
  );

-- =============================================
-- 3. MEMBER COUNT TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION public.update_community_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_community_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_community_id := OLD.community_id;
  ELSE
    target_community_id := NEW.community_id;
  END IF;

  UPDATE public.communities
  SET member_count = (
    SELECT COUNT(*) FROM public.community_members
    WHERE community_id = target_community_id AND status = 'active'
  )
  WHERE id = target_community_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_community_member_count_trigger
  AFTER INSERT OR DELETE OR UPDATE OF status ON public.community_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_community_member_count();

-- =============================================
-- 4. AUTO-INSERT CREATOR AS OWNER
-- =============================================
CREATE OR REPLACE FUNCTION public.auto_insert_community_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.community_members (community_id, wallet_address, role, status)
  VALUES (NEW.id, NEW.creator_wallet_address, 'owner', 'active');
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_insert_community_owner_trigger
  AFTER INSERT ON public.communities
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_insert_community_owner();

-- =============================================
-- 5. PINNED COMMUNITIES TABLE
-- =============================================
CREATE TABLE public.pinned_communities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (wallet_address, community_id)
);

CREATE INDEX idx_pinned_communities_wallet ON public.pinned_communities (lower(wallet_address));

ALTER TABLE public.pinned_communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view pinned communities"
  ON public.pinned_communities FOR SELECT
  USING (true);

CREATE POLICY "Users can pin communities"
  ON public.pinned_communities FOR INSERT
  WITH CHECK (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can unpin communities"
  ON public.pinned_communities FOR DELETE
  USING (lower(wallet_address) = get_request_wallet_address());

CREATE POLICY "Users can reorder their pins"
  ON public.pinned_communities FOR UPDATE
  USING (lower(wallet_address) = get_request_wallet_address());

-- =============================================
-- 6. STORAGE BUCKET
-- =============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('community-media', 'community-media', true);

CREATE POLICY "Community media is publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'community-media');

CREATE POLICY "Anyone can upload community media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'community-media');

CREATE POLICY "Anyone can update community media"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'community-media');

CREATE POLICY "Anyone can delete community media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'community-media');
