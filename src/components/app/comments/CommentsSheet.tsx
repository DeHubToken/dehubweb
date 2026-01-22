/**
 * Comments Sheet Component
 * ========================
 * Full-featured comments sheet that fetches from API, supports replies,
 * and allows authenticated users to post comments.
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';
import { getNFTComments, postComment, getMediaUrl, type ApiCommentResponse } from '@/lib/api/dehub';
import { toast } from 'sonner';
import { CommentItem } from './CommentItem';
import { CommentInput } from './CommentInput';
import type { Comment, CommentsSectionProps } from './types';

// Format time ago from ISO string
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w ago`;
}

// Map API comment to local Comment type
function mapApiComment(apiComment: ApiCommentResponse): Comment {
  return {
    id: String(apiComment.id),
    address: apiComment.address,
    username: apiComment.writor?.username || 'Anonymous',
    avatarUrl: apiComment.writor?.avatarUrl,
    text: apiComment.content,
    timeAgo: formatTimeAgo(apiComment.createdAt),
    // Convert parentId to string for consistent comparison
    replyToId: apiComment.parentId ? String(apiComment.parentId) : undefined,
  };
}

export function CommentsSheet({ tokenId, onClose }: CommentsSectionProps) {
  const navigate = useNavigate();
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [optimisticComments, setOptimisticComments] = useState<Comment[]>([]);
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();

  // Fetch comments from API
  const { data: apiComments, isLoading, error } = useQuery({
    queryKey: ['comments', tokenId],
    queryFn: () => getNFTComments(tokenId),
    staleTime: 30000, // 30 seconds
  });

  // Combine API comments with optimistic ones
  const comments = useMemo(() => {
    const mapped = apiComments?.map(mapApiComment) || [];
    // Add optimistic comments, filter out any that now exist in API response
    const apiIds = new Set(mapped.map(c => c.id));
    const pending = optimisticComments.filter(c => !apiIds.has(c.id) && c.id.startsWith('temp-'));
    return [...pending, ...mapped];
  }, [apiComments, optimisticComments]);

  // Group comments: top-level and replies
  const groupedComments = useMemo(() => {
    const topLevel = comments.filter(c => !c.replyToId);
    const replies = comments.filter(c => c.replyToId);
    
    // For each top-level comment, attach its replies
    return topLevel.map(comment => ({
      comment,
      replies: replies.filter(r => r.replyToId === comment.id),
    }));
  }, [comments]);

  const handleReply = useCallback((comment: Comment) => {
    setReplyTo(comment);
  }, []);

  const handleClearReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  const handleUserPress = useCallback((username: string) => {
    onClose();
    navigate(`/${username}`);
  }, [navigate, onClose]);

  const handleSubmit = useCallback(async (text: string) => {
    if (!isAuthenticated || !user) {
      toast.error('Please connect your wallet to comment');
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const tempComment: Comment = {
      id: tempId,
      address: user.address || user.wallet_address || '',
      username: user.username || 'you',
      avatarUrl: user.avatarImageUrl || user.avatarUrl,
      text,
      timeAgo: 'Just now',
      replyToId: replyTo?.id,
    };

    // Optimistic update
    setOptimisticComments(prev => [tempComment, ...prev]);
    const replyTarget = replyTo;
    setReplyTo(null);
    setIsSubmitting(true);

    try {
      await postComment(tokenId, text, replyTarget?.id);
      
      // On success, invalidate query to refetch real comments
      // The temp comment will be removed once we have the real data
      queryClient.invalidateQueries({ queryKey: ['comments', tokenId] });
    } catch (err) {
      // Revert optimistic update
      setOptimisticComments(prev => prev.filter(c => c.id !== tempId));
      toast.error('Failed to post comment');
      console.error('Comment error:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [isAuthenticated, user, replyTo, tokenId, queryClient]);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent 
        side="bottom" 
        className="h-[70vh] bg-zinc-900 border-t border-zinc-800 rounded-t-2xl p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-white font-semibold">
            Comments {comments.length > 0 && `(${comments.length})`}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comments list */}
        <ScrollArea className="flex-1 h-[calc(70vh-130px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-zinc-500 text-sm">Failed to load comments</p>
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-zinc-500 text-sm">No comments yet</p>
              <p className="text-zinc-600 text-xs mt-1">Be the first to comment!</p>
            </div>
          ) : (
            <div className="py-2">
              <AnimatePresence mode="popLayout">
                {groupedComments.map(({ comment, replies }) => (
                  <div key={comment.id}>
                    <CommentItem
                      comment={comment}
                      onReplyPress={handleReply}
                      onUserPress={handleUserPress}
                    />
                    {replies.map(reply => (
                      <CommentItem
                        key={reply.id}
                        comment={reply}
                        onUserPress={handleUserPress}
                        isReply
                      />
                    ))}
                  </div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>

        {/* Comment input */}
        <CommentInput
          replyTo={replyTo}
          onClearReply={handleClearReply}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </SheetContent>
    </Sheet>
  );
}
