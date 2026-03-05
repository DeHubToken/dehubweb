/**
 * Story Comments Drawer
 * =====================
 * Comments drawer for stories, matching the shorts comments UX.
 */

import { useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { X, Send, ThumbsUp, ThumbsDown, ArrowUpDown, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { UserMentionDropdown } from '@/components/app/mentions';
import { useMention } from '@/hooks/use-mention';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useStoryComments, type StoryComment } from '@/hooks/use-story-comments';
import { useAuth } from '@/contexts/AuthContext';
import { buildAvatarUrl } from '@/lib/media-url';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface StoryCommentsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  storyId: string;
}

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'oldest', label: 'Oldest' },
];

interface CommentItemProps {
  comment: StoryComment;
  currentWallet?: string;
  onDelete: (id: string) => void;
  onUserPress: (username: string) => void;
}

function CommentItem({ comment, currentWallet, onDelete, onUserPress }: CommentItemProps) {
  const isOwnComment = currentWallet && comment.wallet_address.toLowerCase() === currentWallet.toLowerCase();
  
  // Resolve avatar
  const avatarUrl = useMemo(() => {
    if (comment.avatar?.startsWith('http')) return comment.avatar;
    return buildAvatarUrl(comment.wallet_address, comment.avatar) || undefined;
  }, [comment.avatar, comment.wallet_address]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 py-3"
    >
      <button onClick={() => comment.username && onUserPress(comment.username)} className="flex-shrink-0">
        <Avatar className="w-8 h-8 cursor-pointer hover:opacity-80 transition-opacity">
          {avatarUrl && <AvatarImage src={avatarUrl} className="object-cover" />}
          <AvatarFallback className="bg-zinc-700">
            {(comment.username || comment.wallet_address)?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <button 
            onClick={() => comment.username && onUserPress(comment.username)}
            className="font-semibold text-white text-sm hover:underline"
          >
            {comment.username || `${comment.wallet_address.slice(0, 6)}...`}
          </button>
          <span className="text-zinc-500 text-xs">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
          </span>
        </div>
        <p className="text-zinc-300 text-sm leading-relaxed break-words">{comment.content}</p>
        {isOwnComment && (
          <button
            onClick={() => onDelete(comment.id)}
            className="text-red-400 text-xs mt-1 hover:underline"
          >
            Delete
          </button>
        )}
      </div>
    </motion.div>
  );
}

export function StoryCommentsDrawer({ isOpen, onClose, storyId }: StoryCommentsDrawerProps) {
  const navigate = useNavigate();
  const { walletAddress, user } = useAuth();
  const [newComment, setNewComment] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest'>('recent');
  const inputRef = useRef<HTMLInputElement>(null);

  const mention = useMention({
    inputRef,
    onMentionInsert: (_user, newText) => setNewComment(newText),
  });

  const { comments, commentCount, isLoading, isPosting, postComment, deleteComment } = useStoryComments(storyId);

  const sortedComments = useMemo(() => {
    return [...comments].sort((a, b) => {
      const aDate = new Date(a.created_at).getTime();
      const bDate = new Date(b.created_at).getTime();
      return sortBy === 'oldest' ? aDate - bDate : bDate - aDate;
    });
  }, [comments, sortBy]);

  const handleSubmit = useCallback(() => {
    if (!newComment.trim()) return;
    
    // Get user info for the comment
    const username = (user as any)?.username;
    const avatar = (user as any)?.avatar;
    
    postComment(newComment, undefined, username, avatar);
    setNewComment('');
  }, [newComment, postComment, user]);

  const handleUserPress = useCallback((username: string) => {
    onClose();
    navigate(`/app/${username}`);
  }, [navigate, onClose]);

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent glass className="max-h-[70vh] flex flex-col">
        <DrawerHeader className="flex items-center justify-between px-4 pb-2 flex-shrink-0">
          <DrawerTitle className="text-white/90 font-semibold">
            Comments ({commentCount})
          </DrawerTitle>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors text-sm">
                  <ArrowUpDown className="w-4 h-4" />
                  <span>{SORT_OPTIONS.find(o => o.value === sortBy)?.label}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                {SORT_OPTIONS.map(option => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setSortBy(option.value as 'recent' | 'oldest')}
                    className={cn(
                      "text-zinc-300 cursor-pointer",
                      sortBy === option.value && "bg-white/10"
                    )}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </DrawerHeader>

        {/* Comments list */}
        <ScrollArea className="flex-1 px-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
            </div>
          ) : sortedComments.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-sm">
              No comments yet. Be the first to comment!
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {sortedComments.map(comment => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  currentWallet={walletAddress || undefined}
                  onDelete={deleteComment}
                  onUserPress={handleUserPress}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Comment input */}
        <div className="p-4 border-t border-zinc-800/50 flex-shrink-0">
          <div className="relative flex items-center gap-2">
            <Input
              ref={inputRef}
              value={newComment}
              onChange={(e) => {
                const val = e.target.value;
                setNewComment(val);
                mention.handleInput(val, e.target.selectionStart ?? val.length);
              }}
              placeholder="Add a comment..."
              className="flex-1 bg-white/5 border-zinc-700 text-white placeholder:text-zinc-500"
              onKeyDown={(e) => {
                if (mention.isOpen) {
                  const handled = mention.handleKeyDown(e);
                  if (handled) {
                    if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      const liveResults = (window as any).__mentionResults || [];
                      if (liveResults[mention.selectedIndex]) {
                        mention.handleSelect(liveResults[mention.selectedIndex]);
                      }
                    }
                    return;
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <UserMentionDropdown
              query={mention.query}
              isOpen={mention.isOpen}
              position={mention.position}
              selectedIndex={mention.selectedIndex}
              onSelectedIndexChange={mention.setSelectedIndex}
              onSelect={mention.handleSelect}
              onClose={mention.handleClose}
            />
            <button
              onClick={handleSubmit}
              disabled={!newComment.trim() || isPosting}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                newComment.trim()
                  ? "bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)] hover:from-white/30 hover:via-white/15 hover:to-white/10"
                  : "bg-zinc-700 text-zinc-400"
              )}
            >
              {isPosting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
