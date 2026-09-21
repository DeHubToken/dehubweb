import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBookmarkFolders,
  createBookmarkFolder,
  updateBookmarkFolder,
  deleteBookmarkFolder,
  addItemToFolder,
  addItemsToFolderBulk,
  removeItemFromFolder,
  getFolderItems,
  getPublicPlaylists,
  getPublicPlaylistItems,
} from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { BookmarkFolder, BookmarkFolderItem, PublicPlaylist } from '@/lib/api/dehub';

const FOLDERS_KEY = ['bookmark-folders'];
/** Public playlists of a profile — what visitors see. Keyed by owner address. */
const PUBLIC_PLAYLISTS_KEY = 'public-playlists';

type CreateFolderVariables = Parameters<typeof createBookmarkFolder>[0] & {
  suppressToast?: boolean;
};

type FolderItemVariables = {
  folderId: string;
  tokenId: number;
  suppressToast?: boolean;
};

export function useBookmarkFolders() {
  const { isAuthenticated, walletAddress } = useAuth();
  const queryClient = useQueryClient();

  // Anything that changes a folder can change what the owner's profile shows,
  // so the public view is refreshed alongside the private one.
  const invalidateOwnPlaylists = () => {
    if (walletAddress) {
      queryClient.invalidateQueries({ queryKey: [PUBLIC_PLAYLISTS_KEY, walletAddress.toLowerCase()] });
    }
  };

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
    mutationFn: ({ suppressToast: _suppressToast, ...params }: CreateFolderVariables) =>
      createBookmarkFolder(params),
    onSuccess: (_data, { suppressToast }) => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
      invalidateOwnPlaylists();
      if (!suppressToast) toast.success('Folder created');
    },
    onError: (_error, { suppressToast }) => {
      if (!suppressToast) toast.error('Failed to create folder');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ folderId, ...params }: { folderId: string; name?: string; description?: string; order?: number; isPublic?: boolean }) =>
      updateBookmarkFolder(folderId, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
      invalidateOwnPlaylists();
      toast.success('Folder updated');
    },
    onError: () => toast.error('Failed to update folder'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBookmarkFolder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
      invalidateOwnPlaylists();
      toast.success('Folder deleted');
    },
    onError: () => toast.error('Failed to delete folder'),
  });

  const addItemMutation = useMutation({
    mutationFn: ({ folderId, tokenId }: FolderItemVariables) =>
      addItemToFolder(folderId, tokenId),
    onSuccess: (_data, { tokenId }) => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
      queryClient.invalidateQueries({ queryKey: ['folder-items'] });
      queryClient.invalidateQueries({ queryKey: ['folder-containment', tokenId] });
      invalidateOwnPlaylists();
    },
    onError: (_error, { suppressToast }) => {
      if (!suppressToast) toast.error('Failed to add to folder');
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: ({ folderId, tokenId }: FolderItemVariables) =>
      removeItemFromFolder(folderId, tokenId),
    onSuccess: (_data, { tokenId }) => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
      queryClient.invalidateQueries({ queryKey: ['folder-items'] });
      queryClient.invalidateQueries({ queryKey: ['folder-containment', tokenId] });
      invalidateOwnPlaylists();
    },
    onError: (_error, { suppressToast }) => {
      if (!suppressToast) toast.error('Failed to remove from folder');
    },
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

// ─── Public playlists (profile) ────────────────────────────────────────

/**
 * A profile's public playlists. Unauthenticated; the same query backs both
 * the tab's count badge and the tab's content, so the two never disagree.
 */
export function usePublicPlaylists(address: string | undefined) {
  const key = (address || '').toLowerCase();
  return useQuery<PublicPlaylist[]>({
    queryKey: [PUBLIC_PLAYLISTS_KEY, key],
    queryFn: async () => {
      const res = await getPublicPlaylists(key);
      return res.result || [];
    },
    enabled: !!key,
    staleTime: 2 * 60 * 1000,
  });
}

/** One public playlist's posts, newest save first, paged on the server cursor. */
export function usePublicPlaylistItems(address: string | undefined, playlistId: string | null) {
  const key = (address || '').toLowerCase();
  return useInfiniteQuery({
    queryKey: [PUBLIC_PLAYLISTS_KEY, key, 'items', playlistId],
    queryFn: ({ pageParam }) => getPublicPlaylistItems(key, playlistId!, { limit: 20, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    enabled: !!key && !!playlistId,
    staleTime: 60 * 1000,
    retry: (count, error) => (error as { httpStatus?: number })?.httpStatus === 404 ? false : count < 2,
  });
}
