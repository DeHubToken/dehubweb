/**
 * Edit Post Modal
 * ===============
 * Drawer for editing post title, description, and categories.
 * Only visible to the post creator (minter).
 */

import { useState, useEffect, useRef } from 'react';
import { Pencil, Loader2, X, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { editPost, replaceVideoFile } from '@/lib/api/dehub';
import type { ContentRating } from '@/lib/api/dehub/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface EditPostResult {
  name: string;
  description: string;
  categories: string[];
  commentsDisabled: boolean;
  contentRating: ContentRating;
}

interface EditPostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId: number | string;
  currentTitle?: string;
  currentDescription?: string;
  currentCategories?: string[];
  currentCommentsDisabled?: boolean;
  currentContentRating?: ContentRating;
  /** The post has a video file to swap. False for text and image posts, which have none. */
  canReplaceVideo?: boolean;
  onSuccess?: (edited: EditPostResult) => void;
}

export function EditPostModal({
  open,
  onOpenChange,
  tokenId,
  currentTitle = '',
  currentDescription = '',
  currentCategories = [],
  currentCommentsDisabled = false,
  currentContentRating,
  canReplaceVideo = false,
  onSuccess,
}: EditPostModalProps) {
  const [name, setName] = useState(currentTitle);
  const [description, setDescription] = useState(currentDescription);
  const [categoryInput, setCategoryInput] = useState('');
  const [categories, setCategories] = useState<string[]>(currentCategories);
  const [commentsDisabled, setCommentsDisabled] = useState(currentCommentsDisabled);
  const [isMature, setIsMature] = useState(currentContentRating === 'mature');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [isReplacing, setIsReplacing] = useState(false);
  const [replaceProgress, setReplaceProgress] = useState(0);

  const handleReplaceVideo = async (file: File) => {
    setIsReplacing(true);
    setReplaceProgress(0);
    try {
      await replaceVideoFile(tokenId, file, { onProgress: setReplaceProgress });
      toast.success('New file uploaded — it will swap in once it finishes processing');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not replace that file';
      toast.error(message);
    } finally {
      setIsReplacing(false);
      setReplaceProgress(0);
    }
  };

  // Sync with props when modal opens
  useEffect(() => {
    if (open) {
      setName(currentTitle);
      setDescription(currentDescription);
      setCategories(currentCategories);
      setCommentsDisabled(currentCommentsDisabled);
      setIsMature(currentContentRating === 'mature');
      setCategoryInput('');
    }
  }, [open, currentTitle, currentDescription, currentCategories, currentCommentsDisabled, currentContentRating]);

  const handleAddCategory = () => {
    const trimmed = categoryInput.trim();
    if (trimmed && !categories.includes(trimmed) && categories.length < 5) {
      setCategories(prev => [...prev, trimmed]);
      setCategoryInput('');
    }
  };

  const handleRemoveCategory = (cat: string) => {
    setCategories(prev => prev.filter(c => c !== cat));
  };

  const handleSubmit = async () => {
    const params: Record<string, unknown> = {};
    if (name.trim() !== currentTitle) params.name = name.trim();
    if (description.trim() !== currentDescription) params.description = description.trim();
    if (JSON.stringify(categories) !== JSON.stringify(currentCategories)) params.category = categories;
    if (commentsDisabled !== currentCommentsDisabled) params.commentsDisabled = commentsDisabled;
    const nextRating: ContentRating = isMature ? 'mature' : 'safe';
    // The API stores nothing for a safe post, so an unrated one arrives as
    // undefined — compare against the rating it means rather than the field.
    if (nextRating !== (currentContentRating ?? 'safe')) params.contentRating = nextRating;

    if (Object.keys(params).length === 0) {
      toast.message('No changes to save');
      return;
    }

    if (params.name && (params.name as string).length > 140) {
      toast.error('Title must be 140 characters or less');
      return;
    }
    if (params.description && (params.description as string).length > 500) {
      toast.error('Description must be 500 characters or less');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await editPost(tokenId, params as any);
      if (result.result) {
        toast.success('Post updated successfully');
        onSuccess?.({ name: name.trim(), description: description.trim(), categories, commentsDisabled, contentRating: nextRating });
        onOpenChange(false);
      } else {
        toast.error('Failed to update post');
      }
    } catch (error: any) {
      console.error('[EditPostModal] Submit error:', error);
      toast.error(error.message || 'Failed to update post');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="max-h-[90vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2 text-white">
            <Pencil className="w-5 h-5" />
            Edit Post
          </DrawerTitle>
          <DrawerDescription className="text-zinc-400">
            Update your post details
          </DrawerDescription>
        </DrawerHeader>

        <div
          className="flex-1 px-4 pb-6 overflow-y-auto overscroll-contain space-y-4"
          style={{ maxHeight: 'calc(90vh - 160px)', WebkitOverflowScrolling: 'touch' }}
          data-vaul-no-drag
        >
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="edit-title" className="text-sm font-medium text-zinc-300">
              Title
            </Label>
            <Input
              id="edit-title"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-white/5 border-white/10 text-white rounded-xl"
              maxLength={140}
              placeholder="Post title"
            />
            <p className="text-xs text-zinc-500 text-right">{name.length}/140</p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="edit-description" className="text-sm font-medium text-zinc-300">
              Description
            </Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-white/5 border-white/10 text-white min-h-[100px] rounded-xl resize-none"
              maxLength={500}
              placeholder="Post description"
            />
            <p className="text-xs text-zinc-500 text-right">{description.length}/500</p>
          </div>

          {/* Categories */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-zinc-300">
              Categories
            </Label>
            <div className="flex gap-2">
              <Input
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
                className="bg-white/5 border-white/10 text-white rounded-xl flex-1"
                placeholder="Add category"
                maxLength={30}
              />
              <Button
                type="button"
                onClick={handleAddCategory}
                disabled={!categoryInput.trim() || categories.length >= 5}
                className="bg-white/10 text-white hover:bg-white/20 rounded-xl"
                size="sm"
              >
                Add
              </Button>
            </div>
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {categories.map((cat) => (
                  <span
                    key={cat}
                    className="flex items-center gap-1 px-3 py-1 bg-white/10 text-white text-xs rounded-lg border border-white/10"
                  >
                    {cat}
                    <button onClick={() => handleRemoveCategory(cat)} className="hover:text-red-400">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Comments */}
          <div>
            <label className="text-zinc-400 text-sm mb-2 block">Comments</label>
            <button
              type="button"
              role="switch"
              aria-checked={!commentsDisabled}
              onClick={() => setCommentsDisabled((v) => !v)}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-colors text-left"
            >
              <span className="min-w-0">
                <span className="block text-white text-sm font-medium">
                  {commentsDisabled ? 'Comments are off' : 'Allow comments'}
                </span>
                <span className="block text-zinc-500 text-xs mt-0.5">
                  {commentsDisabled
                    ? 'Replies already posted stay visible — turning this back on restores them.'
                    : 'Anyone who can see this post can reply to it.'}
                </span>
              </span>
              <span
                className={cn(
                  'relative shrink-0 w-11 h-6 rounded-full transition-colors',
                  commentsDisabled ? 'bg-zinc-700' : 'bg-emerald-500/80'
                )}
              >
                <span
                  /* A knob, not a white badge — War's plain-white-surface net
                     dimmed it to 16% HUD cyan and it vanished into the track. */
                  data-keep-white
                  className={cn(
                    'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                    commentsDisabled ? 'translate-x-0.5' : 'translate-x-[22px]'
                  )}
                />
              </span>
            </button>
          </div>

          {/* Mature content */}
          <div>
            <label className="text-zinc-400 text-sm mb-2 block">Content rating</label>
            <button
              type="button"
              role="switch"
              aria-checked={isMature}
              onClick={() => setIsMature((v) => !v)}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-colors text-left"
            >
              <span className="min-w-0">
                <span className="block text-white text-sm font-medium">
                  {isMature ? 'Marked mature' : 'Mark as mature'}
                </span>
                <span className="block text-zinc-500 text-xs mt-0.5">
                  {isMature
                    ? 'Kept off the public feed. Followers, your profile and the link still work.'
                    : 'For adult or graphic posts. Turning this on takes it off the public feed.'}
                </span>
              </span>
              <span
                className={cn(
                  'relative shrink-0 w-11 h-6 rounded-full transition-colors',
                  isMature ? 'bg-amber-500/80' : 'bg-zinc-700'
                )}
              >
                <span
                  data-keep-white
                  className={cn(
                    'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                    isMature ? 'translate-x-[22px]' : 'translate-x-0.5'
                  )}
                />
              </span>
            </button>
          </div>

          {/* Replace the file. Only for posts that have one — a text or image
              post has nothing to swap, and the server refuses those anyway. */}
          {canReplaceVideo && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-zinc-300">Video file</Label>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void handleReplaceVideo(file);
                }}
              />
              <button
                type="button"
                disabled={isReplacing || isSubmitting}
                onClick={() => videoInputRef.current?.click()}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-colors text-left disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block text-white text-sm font-medium">
                    {isReplacing ? `Uploading… ${replaceProgress}%` : 'Replace video file'}
                  </span>
                  <span className="block text-zinc-500 text-xs mt-0.5">
                    Keeps this post's link, views and comments. The old file plays until the new
                    one finishes processing.
                  </span>
                </span>
                {isReplacing ? (
                  <Loader2 className="w-5 h-5 shrink-0 text-zinc-400 animate-spin" />
                ) : (
                  <Upload className="w-5 h-5 shrink-0 text-zinc-400" />
                )}
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="flex-1 text-zinc-400 hover:text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              variant="glass"
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
