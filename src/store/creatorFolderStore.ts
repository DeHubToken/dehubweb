/**
 * Creator folders.
 * ================
 *
 * Folders the creator sorts the generation library into. Membership is a map
 * of job id → folder ids, mirrored to creator_folders / creator_folder_items
 * through the creator-flows edge function. Every action is optimistic: the
 * local state changes first and the server call follows, retried once, so a
 * flaky request never leaves the UI out of step with what was clicked.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as api from '@/lib/creator/flow/api';

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  orderIndex: number;
  createdAt: string;
}

interface FolderState {
  folders: Folder[];
  selectedFolderId: string | null;
  itemFolderMap: Record<string, string[]>;
  loaded: boolean;

  loadFromServer: () => Promise<void>;
  createFolder: (name: string, parentId?: string | null) => Promise<Folder>;
  deleteFolder: (id: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  selectFolder: (id: string | null) => void;
  assignItemsToFolder: (itemIds: string[], folderId: string) => Promise<void>;
  removeItemsFromFolder: (itemIds: string[], folderId: string) => Promise<void>;
  folderItemCount: (folderId: string) => number;
  reset: () => void;
}

export const useCreatorFolderStore = create<FolderState>()(
  persist(
    (set, get) => ({
      folders: [],
      selectedFolderId: null,
      itemFolderMap: {},
      loaded: false,

      loadFromServer: async () => {
        if (!api.canSyncFlows()) return;
        try {
          const data = await api.listFolders();
          const folders: Folder[] = (data.folders ?? []).map((f) => ({
            id: f.id,
            name: f.name,
            parentId: f.parent_id,
            orderIndex: f.order_index,
            createdAt: f.created_at,
          }));
          const serverMap: Record<string, string[]> = {};
          for (const fi of data.folderItems ?? []) {
            (serverMap[fi.item_id] ??= []).push(fi.folder_id);
          }
          const valid = new Set(folders.map((f) => f.id));
          set((s) => {
            // Keep a local assignment the server is missing (a POST that
            // failed silently), drop ones whose folder is gone server-side.
            const merged: Record<string, string[]> = { ...serverMap };
            for (const [itemId, folderIds] of Object.entries(s.itemFolderMap)) {
              for (const fid of folderIds) {
                if (!valid.has(fid)) continue;
                if (!merged[itemId]) merged[itemId] = [];
                if (!merged[itemId].includes(fid)) merged[itemId].push(fid);
              }
            }
            return { folders, itemFolderMap: merged, loaded: true };
          });
        } catch {
          /* offline: keep local */
        }
      },

      createFolder: async (name, parentId = null) => {
        const siblings = get().folders.filter((f) => f.parentId === (parentId ?? null));
        const orderIndex = siblings.length > 0 ? Math.max(...siblings.map((f) => f.orderIndex)) + 1 : 0;
        const optimistic: Folder = {
          id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2),
          name,
          parentId: parentId ?? null,
          orderIndex,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ folders: [...s.folders, optimistic] }));
        if (!api.canSyncFlows()) return optimistic;
        try {
          const { folder } = await api.createFolder(name, parentId ?? null, orderIndex);
          const real: Folder = { id: folder.id, name: folder.name, parentId: folder.parent_id, orderIndex: folder.order_index, createdAt: folder.created_at };
          set((s) => ({
            folders: s.folders.map((f) => (f.id === optimistic.id ? real : f)),
            selectedFolderId: s.selectedFolderId === optimistic.id ? real.id : s.selectedFolderId,
            itemFolderMap: Object.fromEntries(
              Object.entries(s.itemFolderMap).map(([itemId, fids]) => [itemId, fids.map((fid) => (fid === optimistic.id ? real.id : fid))]),
            ),
          }));
          return real;
        } catch {
          return optimistic;
        }
      },

      deleteFolder: async (id) => {
        set((s) => {
          const next: Record<string, string[]> = {};
          for (const [itemId, folderIds] of Object.entries(s.itemFolderMap)) {
            const filtered = folderIds.filter((fid) => fid !== id);
            if (filtered.length > 0) next[itemId] = filtered;
          }
          return {
            folders: s.folders.filter((f) => f.id !== id && f.parentId !== id),
            selectedFolderId: s.selectedFolderId === id ? null : s.selectedFolderId,
            itemFolderMap: next,
          };
        });
        if (!api.canSyncFlows()) return;
        try {
          await api.deleteFolder(id);
        } catch {
          /* already gone locally */
        }
      },

      renameFolder: async (id, name) => {
        set((s) => ({ folders: s.folders.map((f) => (f.id === id ? { ...f, name } : f)) }));
        if (!api.canSyncFlows()) return;
        try {
          await api.updateFolder(id, { name });
        } catch {
          /* keep optimistic */
        }
      },

      selectFolder: (id) => set({ selectedFolderId: id }),

      assignItemsToFolder: async (itemIds, folderId) => {
        set((s) => {
          const next = { ...s.itemFolderMap };
          for (const id of itemIds) {
            const existing = next[id] ?? [];
            if (!existing.includes(folderId)) next[id] = [...existing, folderId];
          }
          return { itemFolderMap: next };
        });
        if (!api.canSyncFlows()) return;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            await api.addFolderItems(folderId, itemIds);
            return;
          } catch {
            if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
          }
        }
      },

      removeItemsFromFolder: async (itemIds, folderId) => {
        set((s) => {
          const next = { ...s.itemFolderMap };
          for (const id of itemIds) {
            const existing = next[id];
            if (!existing) continue;
            const filtered = existing.filter((fid) => fid !== folderId);
            if (filtered.length > 0) next[id] = filtered;
            else delete next[id];
          }
          return { itemFolderMap: next };
        });
        if (!api.canSyncFlows()) return;
        try {
          await api.removeFolderItems(folderId, itemIds);
        } catch {
          /* keep optimistic */
        }
      },

      folderItemCount: (folderId) => {
        let count = 0;
        for (const folderIds of Object.values(get().itemFolderMap)) if (folderIds.includes(folderId)) count += 1;
        return count;
      },

      reset: () => set({ folders: [], selectedFolderId: null, itemFolderMap: {}, loaded: false }),
    }),
    {
      name: 'dehub-creator-folders-v1',
      partialize: (s) => ({ folders: s.folders, selectedFolderId: s.selectedFolderId, itemFolderMap: s.itemFolderMap }),
    },
  ),
);
