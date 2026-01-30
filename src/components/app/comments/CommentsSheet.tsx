/**
 * Comments Sheet Component
 * ========================
 * Full-featured comments sheet that fetches from API, supports replies,
 * search, and sorting. Matches the CommentsSection component styling.
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, MessageCircle, Quote, Search, ArrowUpDown, Reply } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { getNFTComments, postComment, getMediaUrl, type ApiCommentResponse } from '@/lib/api/dehub';
import { toast } from 'sonner';
import { CommentItem } from './CommentItem';
import type { Comment, CommentsSectionProps } from './types';

type CommentTab = 'replies' | 'quotes' | 'search';

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'liked', label: 'Most Liked' },
];

// Format time ago from ISO string
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Just now';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  if (diffMs < 0) return 'Just now';
  
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `${diffWeeks}w`;
  
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo`;
  
  return `${Math.floor(diffDays / 365)}y`;
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
    replyToId: apiComment.parentId ? String(apiComment.parentId) : undefined,
  };
}

export function CommentsSheet({ tokenId, onClose }: CommentsSectionProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<CommentTab>('replies');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'liked'>('recent');
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [optimisticComments, setOptimisticComments] = useState<Comment[]>([]);
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();

  // Fetch comments from API
  const { data: apiComments, isLoading, error } = useQuery({
    queryKey: ['comments', tokenId],
    queryFn: () => getNFTComments(tokenId),
    staleTime: 30000,
  });

  // Combine API comments with optimistic ones
  const comments = useMemo(() => {
    const mapped = apiComments?.map(mapApiComment) || [];
    const apiIds = new Set(mapped.map(c => c.id));
    const pending = optimisticComments.filter(c => !apiIds.has(c.id) && c.id.startsWith('temp-'));
    return [...pending, ...mapped];
  }, [apiComments, optimisticComments]);

  // Group comments: top-level and replies
  const groupedComments = useMemo(() => {
    const topLevel = comments.filter(c => !c.replyToId);
    const replies = comments.filter(c => c.replyToId);
    
    return topLevel.map(comment => ({
      comment,
      replies: replies.filter(r => r.replyToId === comment.id),
    }));
  }, [comments]);

  // Filter and sort comments
  const filteredGroupedComments = useMemo(() => {
    let filtered = groupedComments;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = groupedComments.filter(
        ({ comment, replies }) => 
          comment.text.toLowerCase().includes(query) || 
          comment.username.toLowerCase().includes(query) ||
          replies.some(r => r.text.toLowerCase().includes(query) || r.username.toLowerCase().includes(query))
      );
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === 'liked') {
        return 0; // Would sort by likes if available
      }
      return 0;
    });
  }, [groupedComments, searchQuery, sortBy]);

  const handleReply = useCallback((comment: Comment) => {
    setReplyTo(comment);
    setNewComment(`@${comment.username} `);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  const handleClearReply = useCallback(() => {
    setReplyTo(null);
    setNewComment('');
  }, []);

  const handleUserPress = useCallback((username: string) => {
    onClose();
    navigate(`/${username}`);
  }, [navigate, onClose]);

  const handleSubmit = useCallback(async () => {
    const trimmed = newComment.trim();
    if (!trimmed || isSubmitting) return;
    
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
      text: trimmed,
      timeAgo: 'Just now',
      replyToId: replyTo?.id,
    };

    setOptimisticComments(prev => [tempComment, ...prev]);
    const replyTarget = replyTo;
    setReplyTo(null);
    setNewComment('');
    setIsSubmitting(true);

    try {
      await postComment(tokenId, trimmed, replyTarget?.id);
      queryClient.invalidateQueries({ queryKey: ['comments', tokenId] });
    } catch (err) {
      setOptimisticComments(prev => prev.filter(c => c.id !== tempId));
      toast.error('Failed to post comment');
      console.error('Comment error:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [newComment, isSubmitting, isAuthenticated, user, replyTo, tokenId, queryClient]);

  const canPost = newComment.trim() && !isSubmitting;
  const avatarUrl = user?.avatarImageUrl || user?.avatarUrl;

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent 
        glass 
        hideHandle
        className="h-[70vh] p-0"
      >
        {/* Header with close button */}
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="text-white font-semibold">
            Comments {comments.length > 0 && `(${comments.length})`}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher - 4 Icons: Replies, Quotes, Search, Sort */}
        <div className="flex">
          <button
            type="button"
            onClick={() => setActiveTab('replies')}
            className={`relative flex-1 py-3 flex items-center justify-center transition-colors ${
              activeTab === 'replies'
                ? 'text-white'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
            }`}
          >
            {activeTab === 'replies' && (
              <div className="absolute inset-0 bg-gradient-to-b from-zinc-800/60 to-transparent" />
            )}
            <MessageCircle className="w-5 h-5 relative z-10" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('quotes')}
            className={`relative flex-1 py-3 flex items-center justify-center transition-colors ${
              activeTab === 'quotes'
                ? 'text-white'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
            }`}
          >
            {activeTab === 'quotes' && (
              <div className="absolute inset-0 bg-gradient-to-b from-zinc-800/60 to-transparent" />
            )}
            <Quote className="w-5 h-5 relative z-10" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`relative flex-1 py-3 flex items-center justify-center transition-colors ${
              activeTab === 'search'
                ? 'text-white'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
            }`}
          >
            {activeTab === 'search' && (
              <div className="absolute inset-0 bg-gradient-to-b from-zinc-800/60 to-transparent" />
            )}
            <Search className="w-5 h-5 relative z-10" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`relative flex-1 py-3 flex items-center justify-center transition-colors ${
                  sortBy !== 'recent'
                    ? 'text-white'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
                }`}
              >
                {sortBy !== 'recent' && (
                  <div className="absolute inset-0 bg-gradient-to-b from-zinc-800/60 to-transparent" />
                )}
                <ArrowUpDown className="w-5 h-5 relative z-10" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              {SORT_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setSortBy(option.value as 'recent' | 'liked')}
                  className={cn(
                    "text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white",
                    sortBy === option.value && "text-white"
                  )}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Search Input - shown only on search tab */}
        {activeTab === 'search' && (
          <div className="mb-3 px-5">
            <Input
              placeholder="Search comments & quotes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white text-sm h-9"
              autoFocus
            />
          </div>
        )}

        {/* Comments list with fade gradients */}
        <div className="flex-1 relative">
          <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-black/60 to-transparent pointer-events-none z-10" />
          <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-black/60 to-transparent pointer-events-none z-10" />
          
          <div className="h-[calc(70vh-280px)] overflow-y-auto pt-2 pb-2">
            {/* Replies Tab */}
            {activeTab === 'replies' && (
              <>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
                  </div>
                ) : error ? (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-zinc-500 text-sm">Failed to load comments</p>
                  </div>
                ) : filteredGroupedComments.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-zinc-500 text-sm">No replies yet. Be the first!</p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {filteredGroupedComments.map(({ comment, replies }) => (
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
                )}
              </>
            )}

            {/* Quotes Tab */}
            {activeTab === 'quotes' && (
              <div className="flex items-center justify-center py-12">
                <p className="text-zinc-500 text-sm">No quotes yet. Be the first!</p>
              </div>
            )}

            {/* Search Tab */}
            {activeTab === 'search' && (
              <>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
                  </div>
                ) : filteredGroupedComments.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-zinc-500 text-sm">
                      {searchQuery ? 'No results found' : 'No comments or quotes yet'}
                    </p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {filteredGroupedComments.map(({ comment, replies }) => (
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
                )}
              </>
            )}
          </div>
        </div>

        {/* Comment Input - matching CommentsSection style */}
        <div className="mt-4 pt-4 px-5">
          {/* Reply indicator */}
          {replyTo && (
            <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-zinc-800/50 rounded-lg">
              <Reply className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs text-zinc-400">Replying to @{replyTo.username}</span>
              <button 
                onClick={handleClearReply}
                className="ml-auto text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex gap-2 pb-1.5">
            <Avatar className="w-8 h-8 flex-shrink-0">
              {avatarUrl && (
                <AvatarImage src={getMediaUrl(avatarUrl)} className="object-cover" />
              )}
              <AvatarFallback className="bg-zinc-700 text-white font-medium">
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 flex gap-2">
              <Input
                ref={inputRef}
                placeholder={replyTo ? `Reply to @${replyTo.username}...` : 'Add a reply...'}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white text-sm h-9"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSubmit();
                  } else if (e.key === 'Escape') {
                    handleClearReply();
                    inputRef.current?.blur();
                  }
                }}
              />
              <button
                onClick={handleSubmit}
                disabled={!canPost}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0",
                  canPost
                    ? "bg-zinc-700 text-white hover:bg-zinc-600"
                    : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                )}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post'}
              </button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
