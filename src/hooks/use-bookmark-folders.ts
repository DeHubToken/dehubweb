import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBookmarkFolders,
  createBookmarkFolder,
  updateBookmarkFolder,
  deleteBookmarkFolder,
  addItemToFolder,
  addItemsToFolderBulk,
  removeItemFromFolder,
  getFolderItems,
} from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { BookmarkFolder, BookmarkFolderItem } from '@/lib/api/dehub';

const FOLDERS_KEY = ['bookmark-folders'];

export function useBookmarkFolders() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const foldersQuery = useQuery({
    queryKey: FOLDERS_KEY,
    queryFn: async () => {
      const res = await getBookmarkFolders();
      return res.result || [];
    },
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: createBookmarkFolder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
      toast.success('Folder created');
    },
    onError: () => toast.error('Failed to create folder'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ folderId, ...params }: { folderId: string; name?: string; description?: string; order?: number }) =>
      updateBookmarkFolder(folderId, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
      toast.success('Folder updated');
    },
    onError: () => toast.error('Failed to update folder'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBookmarkFolder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
      toast.success('Folder deleted');
    },
    onError: () => toast.error('Failed to delete folder'),
  });

  const addItemMutation = useMutation({
    mutationFn: ({ folderId, tokenId }: { folderId: string; tokenId: number }) =>
      addItemToFolder(folderId, tokenId),
    onSuccess: (_data, { tokenId }) => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
      queryClient.invalidateQueries({ queryKey: ['folder-items'] });
      queryClient.invalidateQueries({ queryKey: ['folder-containment', tokenId] });
    },
    onError: () => toast.error('Failed to add to folder'),
  });

  const removeItemMutation = useMutation({
    mutationFn: ({ folderId, tokenId }: { folderId: string; tokenId: number }) =>
      removeItemFromFolder(folderId, tokenId),
    onSuccess: (_data, { tokenId }) => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
      queryClient.invalidateQueries({ queryKey: ['folder-items'] });
      queryClient.invalidateQueries({ queryKey: ['folder-containment', tokenId] });
    },
    onError: () => toast.error('Failed to remove from folder'),
  });

  return {
    folders: foldersQuery.data || [],
    isLoading: foldersQuery.isLoading,
    isError: foldersQuery.isError,
    error: foldersQuery.error,
    refetch: foldersQuery.refetch,
    createFolder: createMutation.mutate,
    createFolderAsync: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateFolder: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    deleteFolder: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
    addToFolder: addItemMutation.mutate,
    addToFolderAsync: addItemMutation.mutateAsync,
    isAdding: addItemMutation.isPending,
    removeFromFolder: removeItemMutation.mutate,
    removeFromFolderAsync: removeItemMutation.mutateAsync,
    isRemoving: removeItemMutation.isPending,
  };
}

/**
 * Which folders already contain `tokenId`, as a folderId → boolean map.
 *
 * The API has no "which folders hold this post" endpoint, so this fans out over
 * the folder list the same way mobile's AddToFolderSheet does. Empty folders are
 * skipped, and it only runs while the picker is actually open (`enabled`), so
 * the fan-out never fires during normal feed browsing.
 */
export function useFolderContainment(tokenId: number | null, enabled: boolean) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['folder-containment', tokenId],
    queryFn: async () => {
      const foldersRes = await getBookmarkFolders();
      const folders = foldersRes.result || [];

      const entries = await Promise.all(
        folders.map(async (folder) => {
          if (!folder.itemCount) return [folder._id, false] as const;
          try {
            const itemsRes = await getFolderItems(folder._id, 1, 100);
            const has = (itemsRes.result || []).some(
              (item) => Number(item.tokenId) === Number(tokenId)
            );
            return [folder._id, has] as const;
          } catch {
            // A single unreadable folder shouldn't blank out the whole picker.
            return [folder._id, false] as const;
          }
        })
      );

      return Object.fromEntries(entries) as Record<string, boolean>;
    },
    enabled: isAuthenticated && enabled && tokenId != null,
    staleTime: 30 * 1000,
  });
}

export function useFolderItems(folderId: string) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['folder-items', folderId],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await getFolderItems(folderId, pageParam as number, 20);
      return res.result || [];
    },
    enabled: isAuthenticated && !!folderId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useBulkAddToFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ folderId, tokenIds }: { folderId: string; tokenIds: number[] }) =>
      addItemsToFolderBulk(folderId, tokenIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
      toast.success('Posts added to folder');
    },
    onError: () => toast.error('Failed to add posts'),
  });
}
