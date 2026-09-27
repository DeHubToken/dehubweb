/**
 * Creator packs — emoji, sticker and GIF packs people publish and share.
 *
 * Reads go straight to the tables (public SELECT). Every write to a pack goes
 * through the `creator-packs` edge function, which checks the caller's badge
 * tier and its limits on the server; the numbers in ./limits are only for
 * showing. Saving someone else's pack into your picker is open to anyone
 * signed in and goes through RLS on `saved_creator_packs`.
 *
 * Emoji packs store their items in `custom_emojis` (one global `:shortcode:`
 * namespace, so a name means the same image in every message). Sticker and
 * GIF packs store theirs in `creator_pack_items`.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { walletScopedClient } from '@/lib/supabase-wallet-client';
import { dehubAuthHeaders } from '@/lib/ai-invoke';
import { ensureFreshToken } from '@/lib/api/dehub/core';
import { mergeCustomEmojis, loadCustomEmojis, type CustomEmoji } from '@/lib/emoji/custom-emoji';
import type { PackKind, PackLimits } from './limits';

export type { PackKind, PackLimits } from './limits';

export interface CreatorPack {
  id: string;
  kind: PackKind;
  name: string;
  slug: string;
  owner: string;
  cover_url: string | null;
  item_count: number;
  save_count: number;
  created_at: string;
}

export interface PackItem {
  id: string;
  pack_id: string;
  image_url: string;
  animated: boolean;
  /** Emoji packs: the `:shortcode:` the image answers to. */
  shortcode?: string;
  /** Sticker packs: the emoji the sticker stands for, Telegram-style. */
  emoji?: string | null;
}

export interface PackStatus {
  tier: string | null;
  limits: PackLimits;
  usage: Record<PackKind, number>;
}

export interface NewPackItem {
  imageUrl: string;
  animated: boolean;
  shortcode?: string;
  emoji?: string;
}

const PACK_COLS = 'id, kind, name, slug, owner, cover_url, item_count, save_count, created_at';

export const PACK_UPLOAD_TYPES = ['image/png', 'image/gif', 'image/webp', 'image/jpeg'];
export const MAX_PACK_UPLOAD_BYTES: Record<PackKind, number> = {
  emoji: 2 * 1024 * 1024,
  sticker: 2 * 1024 * 1024,
  gif: 8 * 1024 * 1024,
};

export class PackError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

async function callPacks<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  await ensureFreshToken();
  const { data, error } = await supabase.functions.invoke('creator-packs', {
    body: { action, ...body },
    headers: dehubAuthHeaders(),
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    let detail: { error?: string; code?: string } | undefined;
    try {
      detail = await context?.json();
    } catch {
      // Not JSON — fall back to the transport message.
    }
    throw new PackError(detail?.error || error.message || 'Request failed', detail?.code);
  }
  if ((data as { error?: string })?.error) {
    throw new PackError((data as { error: string }).error, (data as { code?: string }).code);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Writes (server-checked)

export const getPackStatus = () => callPacks<PackStatus>('status');

export async function createPack(kind: PackKind, name: string): Promise<CreatorPack> {
  return (await callPacks<{ pack: CreatorPack }>('create_pack', { kind, name })).pack;
}

export async function renamePack(packId: string, name: string): Promise<CreatorPack> {
  return (await callPacks<{ pack: CreatorPack }>('rename_pack', { packId, name })).pack;
}

export async function deletePack(packId: string): Promise<void> {
  await callPacks('delete_pack', { packId });
  void loadCustomEmojis(true);
}

export async function addPackItems(
  packId: string,
  items: NewPackItem[],
  source?: string,
): Promise<{ added: number; skipped: number }> {
  const res = await callPacks<{ added: Array<Record<string, unknown>>; skipped: number }>('add_items', {
    packId,
    items,
    source,
  });
  const emoji = res.added.filter((r) => typeof r.shortcode === 'string') as unknown as CustomEmoji[];
  if (emoji.length) mergeCustomEmojis(emoji);
  return { added: res.added.length, skipped: res.skipped };
}

export async function removePackItem(packId: string, itemId: string): Promise<void> {
  await callPacks('remove_item', { packId, itemId });
}

export async function uploadPackImage(file: File, wallet: string, kind: PackKind): Promise<string> {
  if (!PACK_UPLOAD_TYPES.includes(file.type)) throw new PackError('unsupported_type', 'FILE_TYPE');
  if (file.size > MAX_PACK_UPLOAD_BYTES[kind]) throw new PackError('too_large', 'FILE_SIZE');
  const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
  const path = `creator-packs/${wallet.toLowerCase()}/${crypto.randomUUID()}.${ext}`;
  const client = walletScopedClient(wallet);
  const { error } = await client.storage
    .from('community-media')
    .upload(path, file, { cacheControl: '31536000', contentType: file.type });
  if (error) throw error;
  return client.storage.from('community-media').getPublicUrl(path).data.publicUrl;
}

// ---------------------------------------------------------------------------
// Reads

export async function fetchPackBySlug(slug: string): Promise<CreatorPack | null> {
  const { data } = await supabase
    .from('creator_packs' as never)
    .select(PACK_COLS)
    .eq('slug', slug.toLowerCase())
    .maybeSingle();
  return (data as unknown as CreatorPack) ?? null;
}

export async function fetchOwnedPacks(wallet: string): Promise<CreatorPack[]> {
  const { data, error } = await supabase
    .from('creator_packs' as never)
    .select(PACK_COLS)
    .eq('owner', wallet.toLowerCase())
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CreatorPack[];
}

export async function fetchSavedPacks(wallet: string): Promise<CreatorPack[]> {
  const { data, error } = await walletScopedClient(wallet)
    .from('saved_creator_packs' as never)
    .select(`created_at, pack:creator_packs(${PACK_COLS})`)
    .eq('wallet', wallet.toLowerCase())
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{ pack: CreatorPack | null }>)
    .map((r) => r.pack)
    .filter((p): p is CreatorPack => !!p);
}

/** Items for several packs at once, grouped by pack, in pack order. */
export async function fetchPackItems(packs: Pick<CreatorPack, 'id' | 'kind'>[]): Promise<Record<string, PackItem[]>> {
  const out: Record<string, PackItem[]> = {};
  const emojiIds = packs.filter((p) => p.kind === 'emoji').map((p) => p.id);
  const otherIds = packs.filter((p) => p.kind !== 'emoji').map((p) => p.id);
  const [emoji, other] = await Promise.all([
    emojiIds.length
      ? supabase
          .from('custom_emojis' as never)
          .select('id, pack_id, image_url, animated, shortcode')
          .in('pack_id', emojiIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    otherIds.length
      ? supabase
          .from('creator_pack_items' as never)
          .select('id, pack_id, image_url, animated, emoji')
          .in('pack_id', otherIds)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  for (const row of [...((emoji.data ?? []) as PackItem[]), ...((other.data ?? []) as PackItem[])]) {
    (out[row.pack_id] ??= []).push(row);
  }
  return out;
}

export async function savePack(wallet: string, packId: string): Promise<void> {
  const { error } = await walletScopedClient(wallet)
    .from('saved_creator_packs' as never)
    .insert({ wallet: wallet.toLowerCase(), pack_id: packId } as never);
  if (error && error.code !== '23505') throw error;
}

export async function unsavePack(wallet: string, packId: string): Promise<void> {
  const { error } = await walletScopedClient(wallet)
    .from('saved_creator_packs' as never)
    .delete()
    .eq('wallet', wallet.toLowerCase())
    .eq('pack_id', packId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Hooks

export const packKeys = {
  status: (wallet?: string | null) => ['creator-packs', 'status', wallet ?? ''] as const,
  owned: (wallet?: string | null) => ['creator-packs', 'owned', wallet ?? ''] as const,
  saved: (wallet?: string | null) => ['creator-packs', 'saved', wallet ?? ''] as const,
  slug: (slug?: string) => ['creator-packs', 'slug', slug ?? ''] as const,
  items: (ids: string[]) => ['creator-packs', 'items', ids.join(',')] as const,
};

export function usePackStatus(wallet?: string | null) {
  return useQuery({
    queryKey: packKeys.status(wallet),
    queryFn: getPackStatus,
    enabled: !!wallet,
    staleTime: 60_000,
    retry: false,
  });
}

export function useOwnedPacks(wallet?: string | null) {
  return useQuery({
    queryKey: packKeys.owned(wallet),
    queryFn: () => fetchOwnedPacks(wallet!),
    enabled: !!wallet,
    staleTime: 30_000,
  });
}

export function useSavedPacks(wallet?: string | null) {
  return useQuery({
    queryKey: packKeys.saved(wallet),
    queryFn: () => fetchSavedPacks(wallet!),
    enabled: !!wallet,
    staleTime: 30_000,
  });
}

export function usePackItems(packs: Pick<CreatorPack, 'id' | 'kind'>[] | undefined) {
  const ids = (packs ?? []).map((p) => p.id);
  return useQuery({
    queryKey: packKeys.items(ids),
    queryFn: () => fetchPackItems(packs ?? []),
    enabled: ids.length > 0,
    staleTime: 30_000,
  });
}

/** Your own packs of one kind first, then the ones you saved, deduplicated. */
export function usePickerPacks(wallet: string | null | undefined, kind: PackKind) {
  const owned = useOwnedPacks(wallet);
  const saved = useSavedPacks(wallet);
  const seen = new Set<string>();
  const packs = [...(owned.data ?? []), ...(saved.data ?? [])].filter(
    (p) => p.kind === kind && p.item_count > 0 && !seen.has(p.id) && !!seen.add(p.id),
  );
  const items = usePackItems(packs);
  return { packs, items: items.data ?? {}, loading: owned.isLoading || saved.isLoading || items.isLoading };
}

export function useInvalidatePacks() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['creator-packs'] });
}
