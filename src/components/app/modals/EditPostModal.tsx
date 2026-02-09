/**
 * Edit Post Modal
 * ===============
 * Drawer for editing post title, description, and categories.
 * Only visible to the post creator (minter).
 */

import { useState, useEffect } from 'react';
import { Pencil, Loader2, X } from 'lucide-react';
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
import { editPost } from '@/lib/api/dehub';
import { toast } from 'sonner';

interface EditPostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId: number | string;
  currentTitle?: string;
  currentDescription?: string;
  currentCategories?: string[];
  onSuccess?: () => void;
}

export function EditPostModal({
  open,
  onOpenChange,
  tokenId,
  currentTitle = '',
  currentDescription = '',
  currentCategories = [],
  onSuccess,
}: EditPostModalProps) {
  const [name, setName] = useState(currentTitle);
  const [description, setDescription] = useState(currentDescription);
  const [categoryInput, setCategoryInput] = useState('');
  const [categories, setCategories] = useState<string[]>(currentCategories);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync with props when modal opens
  useEffect(() => {
    if (open) {
      setName(currentTitle);
      setDescription(currentDescription);
      setCategories(currentCategories);
      setCategoryInput('');
    }
  }, [open, currentTitle, currentDescription, currentCategories]);

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

    if (Object.keys(params).length === 0) {
      toast('No changes to save');
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
        onSuccess?.();
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
              className="flex-1 bg-white text-black hover:bg-white/90"
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
