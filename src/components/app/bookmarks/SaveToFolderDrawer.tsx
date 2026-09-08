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
import { AppState } from '@/components/app/AppState';

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
      <DrawerContent column className="bg-black/80 backdrop-blur-[24px] border-white/10 h-[min(85dvh,640px)] rounded-t-[24px] overflow-hidden">
        <DrawerHeader className="relative shrink-0 border-b border-white/10 px-5 pb-4 pt-5 text-left">
          <DrawerTitle className="text-white text-lg font-bold">Save to folder</DrawerTitle>
          <p className="mt-1 pr-12 text-xs leading-5 text-zinc-400">
            Choose where you want to keep this post.
          </p>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-xl bg-white/[0.06] text-zinc-400 transition-colors hover:bg-white/10 hover:text-white active:scale-[0.98]"
            aria-label="Close folder picker"
          >
            <X className="w-4 h-4" />
          </button>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 overscroll-contain">
          {showSpinner ? (
            <div className="flex h-full min-h-40 items-center justify-center">
              <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            </div>
          ) : folders.length > 0 ? (
            <div className="space-y-2">
              {folders.map((folder) => {
                const checked = isChecked(folder._id);
                return (
                  <button
                    key={folder._id}
                    type="button"
                    onClick={() => handleToggleFolder(folder._id, folder.name)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-[14px] border border-white/[0.07] bg-white/[0.045] px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.08] active:scale-[0.99]"
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
            <AppState icon="bookmarks" title="No folders yet" description="Create one below to organize this post." size="drawer" />
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {showCreateForm ? (
            <div className="space-y-2.5">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-zinc-300">Folder name</span>
                <Input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Cooking, Travel"
                  maxLength={50}
                  className="h-12 rounded-xl border-white/10 bg-white/[0.06] text-white placeholder:text-zinc-500 focus-visible:ring-yellow-500/70"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-zinc-300">
                  Description <span className="font-normal text-zinc-500">(optional)</span>
                </span>
                <Input
                  value={newFolderDesc}
                  onChange={(e) => setNewFolderDesc(e.target.value)}
                  placeholder="What belongs in this folder?"
                  maxLength={200}
                  className="h-12 rounded-xl border-white/10 bg-white/[0.06] text-white placeholder:text-zinc-500 focus-visible:ring-yellow-500/70"
                />
              </label>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setShowCreateForm(false)}
                  className="h-12 flex-1 rounded-xl bg-white/[0.05] text-zinc-300 hover:bg-white/10 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim() || isCreating}
                  className="h-12 flex-1 rounded-xl bg-yellow-400 font-semibold text-zinc-950 hover:bg-yellow-300 active:scale-[0.98]"
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create & save'}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setShowCreateForm(true)}
              className="h-12 w-full rounded-xl bg-yellow-400 font-semibold text-zinc-950 hover:bg-yellow-300 active:scale-[0.98]"
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
