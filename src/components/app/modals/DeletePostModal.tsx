import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Delete Post Modal
 * =================
 * Confirmation dialog for deleting (soft-deleting) a post.
 * Only visible to the post creator (minter).
 */

import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { deletePost } from '@/lib/api/dehub';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { markPostDeleted } from '@/lib/deleted-posts-store';

interface DeletePostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId: number | string;
  onSuccess?: () => void;
}

export function DeletePostModal({
  open,
  onOpenChange,
  tokenId,
  onSuccess,
}: DeletePostModalProps) {
  const { t: _copy } = _useCopy();
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deletePost(tokenId);
      if (result.result) {
        markPostDeleted(tokenId);
        queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
        queryClient.invalidateQueries({ queryKey: ['dehub-user-content'] });
        toast.success(_copy("copy.4352dab43457", { defaultValue: "Post deleted" }));
        onSuccess?.();
        onOpenChange(false);
      } else {
        toast.error(_copy("copy.95ff1729b2c2", { defaultValue: "Failed to delete post" }));
      }
    } catch (error: any) {
      console.error('[DeletePostModal] Error:', error);
      toast.error(error.message || 'Failed to delete post');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="max-h-[50dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2 text-white">
            <Trash2 className="w-5 h-5 text-red-500" />{_copy("copy.e139251e4f5b", { defaultValue: "Delete Post" })}</DrawerTitle>
          <DrawerDescription className="text-zinc-400">{_copy("copy.b3661ad568df", { defaultValue: "This action cannot be undone. Your post will be permanently removed." })}</DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4">
          <div className="flex gap-3">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isDeleting}
              className="flex-1 text-zinc-400 hover:text-white hover:bg-white/10"
            >{_copy("copy.19766ed6ccb2", { defaultValue: "Cancel" })}</Button>
            <Button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 bg-red-600 text-white hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />{_copy("copy.685ecb984ac2", { defaultValue: "Deleting..." })}</>
              ) : (
                _copy("copy.e139251e4f5b", { defaultValue: "Delete Post" })
              )}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
