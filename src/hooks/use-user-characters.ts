import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface UserCharacter {
  id: string;
  creator_wallet_address: string;
  creator_username: string | null;
  name: string;
  slug: string;
  description: string;
  reference_image_urls: string[];
  primary_image_url: string | null;
  visibility: 'private' | 'public';
  usage_count: number;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export type NewCharacterInput = Omit<
  UserCharacter,
  'id' | 'creator_wallet_address' | 'creator_username' | 'usage_count' | 'is_featured' | 'created_at' | 'updated_at' | 'slug'
> & { slug?: string };

export function slugifyCharacter(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'character';
}

export function useUserCharacters() {
  const { walletAddress } = useAuth();
  return useQuery({
    queryKey: ['user-characters', walletAddress?.toLowerCase() ?? null],
    queryFn: async (): Promise<UserCharacter[]> => {
      const { data, error } = await supabase
        .from('user_characters')
        .select('*')
        .order('usage_count', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as UserCharacter[];
    },
    staleTime: 30_000,
  });
}

export function useCreateCharacter() {
  const { walletAddress, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewCharacterInput): Promise<UserCharacter> => {
      if (!walletAddress) throw new Error('Connect your wallet to create characters.');
      const wallet = walletAddress.toLowerCase();
      const baseSlug = input.slug ? slugifyCharacter(input.slug) : slugifyCharacter(input.name);
      let slug = baseSlug;
      for (let i = 1; i < 12; i++) {
        const { data: existing } = await supabase
          .from('user_characters')
          .select('id')
          .eq('creator_wallet_address', wallet)
          .eq('slug', slug)
          .maybeSingle();
        if (!existing) break;
        slug = `${baseSlug}-${i}`;
      }
      const primary = input.primary_image_url ?? input.reference_image_urls[0] ?? null;
      const { data, error } = await supabase
        .from('user_characters')
        .insert({
          creator_wallet_address: wallet,
          creator_username: user?.username ?? null,
          name: input.name,
          slug,
          description: input.description,
          reference_image_urls: input.reference_image_urls,
          primary_image_url: primary,
          visibility: input.visibility,
        })
        .select('*')
        .single()
        .setHeader('x-wallet-address', wallet);
      if (error) throw error;
      return data as UserCharacter;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-characters'] }),
  });
}

export function useUpdateCharacter() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NewCharacterInput> }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const wallet = walletAddress.toLowerCase();
      const { error } = await supabase
        .from('user_characters')
        .update(patch as never)
        .eq('id', id)
        .setHeader('x-wallet-address', wallet);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-characters'] }),
  });
}

export function useDeleteCharacter() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const wallet = walletAddress.toLowerCase();
      const { error } = await supabase
        .from('user_characters')
        .delete()
        .eq('id', id)
        .setHeader('x-wallet-address', wallet);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-characters'] }),
  });
}

export async function uploadCharacterAsset(file: File, slug: string): Promise<string> {
  const safe = file.name.replace(/[^a-z0-9.\-_]/gi, '_');
  const path = `characters/${slug}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('ai-media-uploads').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('ai-media-uploads').getPublicUrl(path);
  return data.publicUrl;
}

export async function incrementCharacterUsage(characterId: string) {
  await supabase.rpc('increment_user_character_usage', { p_character_id: characterId });
}
