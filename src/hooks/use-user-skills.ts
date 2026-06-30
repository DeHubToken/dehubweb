import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface UserSkill {
  id: string;
  creator_wallet_address: string;
  creator_username: string | null;
  name: string;
  slug: string;
  description: string;
  trigger_phrases: string[];
  system_prompt: string;
  asset_urls: string[];
  model: string;
  kind: 'image' | 'chat';
  usage_count: number;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export type NewSkillInput = Omit<
  UserSkill,
  'id' | 'creator_wallet_address' | 'creator_username' | 'usage_count' | 'is_featured' | 'created_at' | 'updated_at' | 'slug'
> & { slug?: string };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48) || 'skill';
}

export function useUserSkills() {
  return useQuery({
    queryKey: ['user-skills'],
    queryFn: async (): Promise<UserSkill[]> => {
      const { data, error } = await supabase
        .from('user_skills')
        .select('*')
        .order('is_featured', { ascending: false })
        .order('usage_count', { ascending: false });
      if (error) throw error;
      return (data ?? []) as UserSkill[];
    },
    staleTime: 30_000,
  });
}

export function useCreateSkill() {
  const { walletAddress, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewSkillInput): Promise<UserSkill> => {
      if (!walletAddress) throw new Error('Connect your wallet to create skills.');
      const wallet = walletAddress.toLowerCase();
      const baseSlug = input.slug ? slugify(input.slug) : slugify(input.name);
      let slug = baseSlug;
      // ensure unique
      for (let i = 1; i < 8; i++) {
        const { data: existing } = await supabase
          .from('user_skills').select('id').eq('slug', slug).maybeSingle();
        if (!existing) break;
        slug = `${baseSlug}-${i}`;
      }
      const { data, error } = await supabase
        .from('user_skills')
        .insert({
          creator_wallet_address: wallet,
          creator_username: user?.username ?? null,
          name: input.name,
          slug,
          description: input.description,
          trigger_phrases: input.trigger_phrases,
          system_prompt: input.system_prompt,
          asset_urls: input.asset_urls,
          model: input.model,
          kind: input.kind,
        })
        .select('*')
        .single()
        .setHeader('x-wallet-address', wallet);
      if (error) throw error;
      return data as UserSkill;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-skills'] }),
  });
}

export function useUpdateSkill() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NewSkillInput> }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const wallet = walletAddress.toLowerCase();
      const { error } = await supabase
        .from('user_skills')
        .update(patch as never)
        .eq('id', id)
        .setHeader('x-wallet-address', wallet);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-skills'] }),
  });
}

export function useDeleteSkill() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const wallet = walletAddress.toLowerCase();
      const { error } = await supabase
        .from('user_skills')
        .delete()
        .eq('id', id)
        .setHeader('x-wallet-address', wallet);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-skills'] }),
  });
}

export async function uploadSkillAsset(file: File, slug: string): Promise<string> {
  const path = `skills/${slug}/${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, '_')}`;
  const { error } = await supabase.storage.from('ai-media-uploads').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('ai-media-uploads').getPublicUrl(path);
  return data.publicUrl;
}

export async function incrementSkillUsage(skillId: string) {
  await supabase.rpc('increment_user_skill_usage', { p_skill_id: skillId });
}
