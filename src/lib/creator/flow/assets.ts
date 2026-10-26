import { supabase } from '@/integrations/supabase/client';
import { ensureFreshToken } from '@/lib/api/dehub/core';
import type { GraphNode } from './graphContract';
export interface FlowAsset { id: string; kind: string; url?: string; transcript?: string }
export const flowAssetId = (node: GraphNode): string => String(node.data.audioAssetId || node.data.inputAssetId || node.data.outputAssetId || '');

/** Renew private links once per owned graph load/run; never persist the links. */
export async function loadFlowAssets(wallet: string, ids: string[]): Promise<Map<string, FlowAsset>> {
  const needed = new Set(ids.filter(Boolean)), found = new Map<string, FlowAsset>();
  if (!needed.size) return found;
  let offset: number | null = 0;
  while (offset !== null && found.size < needed.size) {
    const token = await ensureFreshToken();
    const { data, error } = await supabase.functions.invoke('creator-library', {
      headers: { 'x-dehub-token': token, 'x-wallet-address': wallet }, body: { action: 'list', offset, includeHidden: true },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not read saved media');
    for (const asset of (data?.jobs || []) as FlowAsset[]) if (needed.has(asset.id)) found.set(asset.id, asset);
    const next = data?.nextOffset;
    offset = Number.isInteger(next) && next > offset && next <= 10000 ? next : null;
  }
  return found;
}

export function assetNodePatch(node: GraphNode, asset: FlowAsset): Record<string, unknown> {
  if (node.type === 'audioInputNode' || node.type === 'audioGenNode') return asset.transcript
    ? { outputText: asset.transcript } : asset.kind === 'audio' && asset.url ? { audioUrl: asset.url } : {};
  if (asset.kind === 'image' && asset.url) return { imageUrl: asset.url };
  if (asset.kind === 'video' && asset.url) return { videoUrl: asset.url };
  return {};
}
