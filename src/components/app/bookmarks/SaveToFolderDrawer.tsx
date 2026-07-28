/**
 * Save to Folder Drawer
 * =====================
 * Folder picker shown right after a post is bookmarked — check existing folders
 * to file it into, or create a new one and save straight into it.
 *
 * Mirrors mobile's components/Home/AddToFolderSheet.tsx (same trigger point: the
 * save half of the bookmark toggle, never the un-save half) so the two clients
 * behave the same way. The /api/bookmark-folders endpoints and the
 * use-bookmark-folders hooks already existed on web with no UI attached; this is
 * that missing surface.
 */

import { useEffect, useState } from 'react';
import { Folder, FolderPlus, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBookmarkFolders, useFolderContainment } from '@/hooks/use-bookmark-folders';

interface SaveToFolderDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId: number | null;
}

export function SaveToFolderDrawer({ open, onOpenChange, tokenId }: SaveToFolderDrawerProps) {
  const {
    folders,
    isLoading,
    createFolderAsync,
    isCreating,
    addToFolderAsync,
    removeFromFolderAsync,
  } = useBookmarkFolders();
  const { data: containment, isLoading: isLoadingContainment } = useFolderContainment(tokenId, open);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDesc, setNewFolderDesc] = useState('');
  // Folder IDs whose checkbox has been flipped locally but whose request hasn't
  // settled yet — the row reads from this first so the tick is instant.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  // Reset the form each time the drawer opens so a half-typed folder name from
  // last time doesn't reappear on the next post.
  useEffect(() => {
    if (open) {
      setShowCreateForm(false);
      setNewFolderName('');
      setNewFolderDesc('');
      setPending({});
    }
  }, [open]);

  const isChecked = (folderId: string) => pending[folderId] ?? containment?.[folderId] ?? false;

  const handleToggleFolder = async (folderId: string, folderName: string) => {
    if (tokenId == null) return;
    const adding = !isChecked(folderId);
    setPending((prev) => ({ ...prev, [folderId]: adding }));

    try {
      if (adding) {
        await addToFolderAsync({ folderId, tokenId });
        toast.success(`Added to ${folderName}`);
      } else {
        await removeFromFolderAsync({ folderId, tokenId });
        toast.success(`Removed from ${folderName}`);
      }
    } catch {
      // Roll the tick back; the mutation's own onError raises the toast.
      setPending((prev) => ({ ...prev, [folderId]: !adding }));
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || isCreating || tokenId == null) return;

    try {
      const res = await createFolderAsync({ name, description: newFolderDesc.trim() || undefined });
      const created = res.result;
      if (!created) return;

      setNewFolderName('');
      setNewFolderDesc('');
      setShowCreateForm(false);

      // Creating a folder from this drawer implies filing the post into it —
      // otherwise the user has to create it and then hunt for its row.
      setPending((prev) => ({ ...prev, [created._id]: true }));
      await addToFolderAsync({ folderId: created._id, tokenId });
      toast.success(`Saved to ${created.name}`);
    } catch {
      // Both mutations toast their own failure.
    }
  };

  const showSpinner = isLoading || isLoadingContainment;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-black/60 backdrop-blur-[24px] border-white/10 max-h-[85vh]">
        <DrawerHeader className="relative">
          <DrawerTitle className="text-white text-lg font-bold">Save to folder</DrawerTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </DrawerHeader>

        <div className="px-4 pb-6 overflow-y-auto">
          {showSpinner ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            </div>
          ) : folders.length > 0 ? (
            <div className="space-y-1.5 mb-3">
              {folders.map((folder) => {
                const checked = isChecked(folder._id);
                return (
                  <button
                    key={folder._id}
                    type="button"
                    onClick={() => handleToggleFolder(folder._id, folder.name)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
                  >
                    <Folder className="w-5 h-5 text-yellow-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{folder.name}</p>
                      {folder.description && (
                        <p className="text-zinc-500 text-xs truncate">{folder.description}</p>
                      )}
                    </div>
                    <span
                      className={cn(
                        'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors',
                        checked ? 'bg-yellow-500 border-yellow-500' : 'border-zinc-600'
                      )}
                    >
                      {checked && <Check className="w-3 h-3 text-black" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <FolderPlus className="w-12 h-12 text-zinc-700 mb-3" />
              <p className="text-zinc-500 text-sm">No folders yet</p>
            </div>
          )}

          {showCreateForm ? (
            <div className="space-y-2">
              <Input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name (e.g. Cooking, Travel)"
                maxLength={50}
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
              />
              <Input
                value={newFolderDesc}
                onChange={(e) => setNewFolderDesc(e.target.value)}
                placeholder="Description (optional)"
                maxLength={200}
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
              />
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 rounded-xl text-zinc-400"
                >
                  Cancel
                </Button>
                <Button
                  variant="glass"
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim() || isCreating}
                  className="flex-1 rounded-xl font-semibold"
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create & save'}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="glass"
              onClick={() => setShowCreateForm(true)}
              className="w-full rounded-xl font-semibold"
            >
              <FolderPlus className="w-4 h-4" />
              Create new folder
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
