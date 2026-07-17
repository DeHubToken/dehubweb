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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
      toast.success('Added to folder');
    },
    onError: () => toast.error('Failed to add to folder'),
  });

  const removeItemMutation = useMutation({
    mutationFn: ({ folderId, tokenId }: { folderId: string; tokenId: number }) =>
      removeItemFromFolder(folderId, tokenId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FOLDERS_KEY });
      queryClient.invalidateQueries({ queryKey: ['folder-items'] });
      toast.success('Removed from folder');
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
    isCreating: createMutation.isPending,
    updateFolder: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    deleteFolder: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
    addToFolder: addItemMutation.mutate,
    isAdding: addItemMutation.isPending,
    removeFromFolder: removeItemMutation.mutate,
    isRemoving: removeItemMutation.isPending,
  };
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
