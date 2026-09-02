/**
 * Creator Flow — client for the creator-flows edge function.
 * ==========================================================
 * Wallet-native auth, the same headers builder-api takes. The one call that
 * needs no wallet is `fetchPublicFlow`, which is what the share page and the
 * "open a copy" button use.
 */
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/lib/api/dehub/core';
import type { Flow, FlowEdge, FlowNode, Viewport } from './types';

export interface PublicFlow {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport: Viewport | null;
  coverUrl: string | null;
  updatedAt: string;
}

export interface RemoteFlow {
  id: string;
  name: string;
  isPublic: boolean;
  coverUrl: string | null;
  data: {
    nodes?: FlowNode[];
    edges?: FlowEdge[];
    nodeCounters?: Record<string, number>;
    viewport?: Viewport;
    createdAt?: number;
    updatedAt?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface RemoteFolder {
  id: string;
  name: string;
  parent_id: string | null;
  order_index: number;
  created_at: string;
}

/** True when a wallet is signed in and the flows API can be called. */
export function canSyncFlows(): boolean {
  return !!getAuthToken() && !!localStorage.getItem('dehub_wallet');
}

async function readError(error: unknown, data: unknown): Promise<string> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    const payload = await ctx.json().catch(() => null);
    if (payload?.error) return String(payload.error);
  }
  if ((data as { error?: string } | null)?.error) return String((data as { error: string }).error);
  return (error as Error | null)?.message || 'Flow request failed';
}

async function invokeFlows<T>(body: Record<string, unknown>, { auth = true } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (auth) {
    const token = getAuthToken();
    const wallet = localStorage.getItem('dehub_wallet')?.toLowerCase();
    if (!token || !wallet) throw new Error('SIGN_IN_REQUIRED');
    headers['x-wallet-address'] = wallet;
    headers['x-dehub-token'] = token;
  }
  const { data, error } = await supabase.functions.invoke('creator-flows', { body, headers });
  if (error) throw new Error(await readError(error, data));
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

/** The blob the server stores. Inline images are dropped: only URLs survive. */
export function serialiseFlow(flow: Flow) {
  return {
    id: flow.id,
    name: flow.name,
    isPublic: flow.isPublic ?? false,
    data: {
      nodes: flow.nodes.map((n) => ({ ...n, data: { ...n.data, inputImage: undefined } })),
      edges: flow.edges,
      nodeCounters: flow.nodeCounters,
      viewport: flow.viewport,
      createdAt: flow.createdAt,
      updatedAt: flow.updatedAt ?? flow.createdAt,
    },
  };
}

export function remoteToFlow(row: RemoteFlow): Flow {
  return {
    id: row.id,
    name: row.name,
    nodes: row.data?.nodes ?? [],
    edges: row.data?.edges ?? [],
    nodeCounters: row.data?.nodeCounters ?? {},
    viewport: row.data?.viewport,
    createdAt: row.data?.createdAt ?? Date.parse(row.createdAt),
    updatedAt: row.data?.updatedAt ?? row.data?.createdAt ?? Date.parse(row.updatedAt),
    isPublic: row.isPublic ?? false,
    coverUrl: row.coverUrl ?? null,
  };
}

export const listFlows = () => invokeFlows<{ flows: RemoteFlow[] }>({ action: 'list' });

export const saveFlows = (flows: Flow[], deleteMissing = false) =>
  invokeFlows<{ ok: true; savedAt: string }>({
    action: 'save',
    flows: flows.map(serialiseFlow),
    deleteMissing,
  });

export const removeFlow = (id: string) => invokeFlows<{ ok: true }>({ action: 'remove', id });

export const publishFlow = (id: string, isPublic: boolean) =>
  invokeFlows<{ ok: true; isPublic: boolean }>({ action: 'publish', id, isPublic });

export const fetchPublicFlow = (id: string) =>
  invokeFlows<{ flow: PublicFlow }>({ action: 'public', id }, { auth: false }).then((r) => r.flow);

export const listFolders = () =>
  invokeFlows<{ folders: RemoteFolder[]; folderItems: Array<{ folder_id: string; item_id: string }> }>({
    action: 'folders.list',
  });

export const createFolder = (name: string, parentId: string | null, orderIndex: number) =>
  invokeFlows<{ folder: RemoteFolder }>({ action: 'folders.create', name, parentId, orderIndex });

export const updateFolder = (id: string, updates: { name?: string; parentId?: string | null; orderIndex?: number }) =>
  invokeFlows<{ ok: true }>({ action: 'folders.update', id, ...updates });

export const deleteFolder = (id: string) => invokeFlows<{ ok: true }>({ action: 'folders.delete', id });

export const addFolderItems = (folderId: string, itemIds: string[]) =>
  invokeFlows<{ ok: true }>({ action: 'items.add', folderId, itemIds });

export const removeFolderItems = (folderId: string, itemIds: string[]) =>
  invokeFlows<{ ok: true }>({ action: 'items.remove', folderId, itemIds });

/** Canonical share URL for a public flow. */
export function flowShareUrl(id: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://dehub.io';
  return `${origin}/creator/flow/${id}`;
}
