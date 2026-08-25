/**
 * Bookmark Folders Panel
 * ======================
 * The other half of a feature that was only ever half-visible: posts could be
 * filed into folders from the save button, and there was nowhere to open one.
 *
 * Two views in one panel — the folder list, and one folder's contents. Items
 * render as compact rows rather than full feed cards on purpose: this is the
 * screen for tidying a hundred saved posts, and a hundred autoplaying video
 * cards is the wrong tool for that.
 *
 * Sorting and moving happen here because the API has no ordering of its own —
 * folder items come back newest-first and that is all it offers, so "oldest
 * first" and "group by channel" are done on the page over the loaded list.
 *
 * @module components/app/bookmarks/BookmarkFoldersPanel
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Folder, FolderOpen, Loader2, Pencil, Trash2, X, Check, ArrowUpDown, FolderInput } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useBookmarkFolders } from '@/hooks/use-bookmark-folders';
import { getFolderItems, addItemsToFolderBulk, removeItemFromFolder, type BookmarkFolderItem } from '@/lib/api/dehub';
import { buildImageUrl, buildFeedImageUrls } from '@/lib/media-url';
import { formatTimeAgo } from '@/lib/feed-utils';

type FolderSort = 'newest' | 'oldest' | 'channel';

const SORT_LABELS: Record<FolderSort, string> = {
  newest: 'Newest saved',
  oldest: 'Oldest saved',
  channel: 'By channel',
};

/** One page of 100 covers any folder a person actually curates by hand. */
const ITEMS_LIMIT = 100;

function itemChannel(item: BookmarkFolderItem): string {
  const post = item.post as (BookmarkFolderItem['post'] & { minterDisplayName?: string; minterUsername?: string }) | undefined;
  return post?.minterDisplayName || post?.minterUsername || post?.minter || 'Unknown';
}

function itemThumbnail(item: BookmarkFolderItem): string | undefined {
  const post = item.post;
  if (!post) return undefined;
  const fromImages = buildFeedImageUrls(post.imageUrls)?.[0];
  return fromImages || buildImageUrl(post.tokenId, post.imageUrl);
}

export function BookmarkFoldersPanel() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const {
    folders,
    isLoading,
    createFolder,
    isCreating,
    updateFolder,
    deleteFolder,
  } = useBookmarkFolders();

  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [sort, setSort] = useState<FolderSort>('newest');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isMoving, setIsMoving] = useState(false);

  const openFolder = folders.find(f => f._id === openFolderId) ?? null;

  const { data: items = [], isLoading: isLoadingItems } = useQuery({
    // Distinct from useFolderItems' key: same folder, different page size, and
    // one cache entry cannot hold both. Still under the ['folder-items'] prefix
    // so the existing invalidations reach it.
    queryKey: ['folder-items', openFolderId, 'panel'],
    queryFn: async () => {
      const res = await getFolderItems(openFolderId!, 1, ITEMS_LIMIT);
      return res.result || [];
    },
    enabled: isAuthenticated && !!openFolderId,
    staleTime: 60 * 1000,
  });

  const sortedItems = useMemo(() => {
    const copy = [...items];
    if (sort === 'oldest') {
      return copy.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    if (sort === 'channel') {
      return copy.sort((a, b) => {
        const byChannel = itemChannel(a).localeCompare(itemChannel(b));
        return byChannel !== 0 ? byChannel : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }
    return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [items, sort]);

  const closeFolder = () => {
    setOpenFolderId(null);
    setSelected(new Set());
  };

  const toggleSelected = (tokenId: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(tokenId)) next.delete(tokenId);
      else next.add(tokenId);
      return next;
    });
  };

  const refreshFolders = () => {
    queryClient.invalidateQueries({ queryKey: ['bookmark-folders'] });
    queryClient.invalidateQueries({ queryKey: ['folder-items'] });
  };

  const removeSelected = async () => {
    if (!openFolderId || selected.size === 0) return;
    setIsMoving(true);
    try {
      // One at a time: the API removes by token, and a partial failure should
      // still leave the successful removals applied.
      await Promise.all(Array.from(selected).map(tokenId => removeItemFromFolder(openFolderId, tokenId)));
      toast.success(selected.size === 1 ? 'Removed from folder' : `${selected.size} removed`);
      setSelected(new Set());
      refreshFolders();
    } catch {
      toast.error('Could not remove those');
    } finally {
      setIsMoving(false);
    }
  };

  const moveSelected = async (targetFolderId: string) => {
    if (!openFolderId || selected.size === 0 || targetFolderId === openFolderId) return;
    setIsMoving(true);
    const tokenIds = Array.from(selected);
    try {
      // Add first: if the add fails the posts are still filed where they were,
      // which is the safer half to get wrong.
      await addItemsToFolderBulk(targetFolderId, tokenIds);
      await Promise.all(tokenIds.map(tokenId => removeItemFromFolder(openFolderId, tokenId)));
      const target = folders.find(f => f._id === targetFolderId);
      toast.success(`Moved to ${target?.name ?? 'folder'}`);
      setSelected(new Set());
      refreshFolders();
    } catch {
      toast.error('Could not move those');
    } finally {
      setIsMoving(false);
    }
  };

  if (!isAuthenticated) return null;

  // ── Folder list ────────────────────────────────────────────────────────
  if (!openFolder) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !newFolderName.trim()) return;
              createFolder({ name: newFolderName.trim() });
              setNewFolderName('');
            }}
            maxLength={40}
            placeholder="New folder name"
            className="flex-1 h-9 px-3 rounded-xl bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={!newFolderName.trim() || isCreating}
            onClick={() => { createFolder({ name: newFolderName.trim() }); setNewFolderName(''); }}
            className="h-9 shrink-0 rounded-xl bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl bg-white/[0.06]" />
            ))}
          </div>
        ) : folders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Folder className="w-12 h-12 text-zinc-600 mb-3" />
            <p className="text-zinc-400 text-lg font-medium">No folders yet</p>
            <p className="text-zinc-500 text-sm mt-1 max-w-xs">
              Save a post with the bookmark button and file it into a folder, or make one here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {folders.map((folder) => (
              <div
                key={folder._id}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
              >
                <FolderOpen className="w-5 h-5 text-zinc-400 shrink-0" />
                {renamingId === folder._id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setRenamingId(null);
                      if (e.key !== 'Enter' || !renameValue.trim()) return;
                      updateFolder({ folderId: folder._id, name: renameValue.trim() });
                      setRenamingId(null);
                    }}
                    maxLength={40}
                    className="flex-1 h-8 px-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => { setOpenFolderId(folder._id); setSelected(new Set()); }}
                    className="flex-1 min-w-0 text-left"
                  >
                    <span className="block truncate font-medium text-white">{folder.name}</span>
                    <span className="block text-xs text-zinc-500">
                      {folder.itemCount ?? 0} {folder.itemCount === 1 ? 'post' : 'posts'}
                    </span>
                  </button>
                )}

                {renamingId === folder._id ? (
                  <>
                    <button
                      onClick={() => {
                        if (!renameValue.trim()) return;
                        updateFolder({ folderId: folder._id, name: renameValue.trim() });
                        setRenamingId(null);
                      }}
                      className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
                      aria-label="Save name"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setRenamingId(null)}
                      className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
                      aria-label="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setRenamingId(folder._id); setRenameValue(folder.name); }}
                      className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
                      aria-label={`Rename ${folder.name}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (!confirm(`Delete "${folder.name}"? The posts stay saved.`)) return;
                        deleteFolder(folder._id);
                      }}
                      className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                      aria-label={`Delete ${folder.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── One folder ─────────────────────────────────────────────────────────
  const otherFolders = folders.filter(f => f._id !== openFolder._id);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={closeFolder}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
          aria-label="Back to folders"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="truncate font-semibold text-white">{openFolder.name}</p>
          <p className="text-xs text-zinc-500">{items.length} {items.length === 1 ? 'post' : 'posts'}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSort(prev => (prev === 'newest' ? 'oldest' : prev === 'oldest' ? 'channel' : 'newest'))}
          className="h-9 shrink-0 rounded-lg bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white text-xs gap-1.5"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          {SORT_LABELS[sort]}
        </Button>
      </div>

      {isLoadingItems ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl bg-white/[0.06]" />
          ))}
        </div>
      ) : sortedItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Folder className="w-12 h-12 text-zinc-600 mb-3" />
          <p className="text-zinc-400 text-lg font-medium">This folder is empty</p>
          <p className="text-zinc-500 text-sm mt-1">Save a post and file it here from the bookmark button.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedItems.map((item) => {
            const isSelected = selected.has(Number(item.tokenId));
            const thumbnail = itemThumbnail(item);
            const title = item.post?.name || item.post?.description?.split('\n')[0] || `Post #${item.tokenId}`;
            return (
              <div
                key={item._id}
                className={cn(
                  'flex items-center gap-3 p-2 rounded-xl border transition-colors',
                  isSelected ? 'bg-white/10 border-white/30' : 'bg-white/5 border-white/10',
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelected(Number(item.tokenId))}
                  aria-label={`Select ${title}`}
                  className="w-4 h-4 shrink-0 accent-white"
                />
                <button
                  onClick={() => navigate(`/app/post/${item.tokenId}`)}
                  className="flex flex-1 min-w-0 items-center gap-3 text-left"
                >
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt=""
                      loading="lazy"
                      className="w-16 h-10 rounded-lg object-cover bg-zinc-800 shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-10 rounded-lg bg-zinc-800 shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-white">{title}</span>
                    <span className="block truncate text-xs text-zinc-500">
                      {itemChannel(item)} · saved {formatTimeAgo(item.createdAt)}
                    </span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Selection actions. Fixed to the bottom of the panel rather than the
          viewport — the page's own nav already owns the bottom edge. */}
      {selected.size > 0 && (
        <div className="sticky bottom-2 flex items-center gap-2 rounded-xl border border-white/15 bg-zinc-900/95 backdrop-blur-xl p-2">
          <span className="px-1 text-xs text-zinc-400">{selected.size} selected</span>
          {otherFolders.length > 0 && (
            <div className="relative flex items-center gap-1">
              <FolderInput className="w-4 h-4 text-zinc-400" />
              <select
                value=""
                disabled={isMoving}
                onChange={(e) => { if (e.target.value) void moveSelected(e.target.value); }}
                className="h-8 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-white px-2 focus:outline-none"
              >
                <option value="">Move to…</option>
                {otherFolders.map(f => (
                  <option key={f._id} value={f._id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={isMoving}
            onClick={removeSelected}
            className="h-8 ml-auto rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            {isMoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
            Remove
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
            className="h-8 rounded-lg text-zinc-400 hover:text-white"
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
