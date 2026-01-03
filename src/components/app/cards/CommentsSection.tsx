/**
 * Comments Section Component
 * ==========================
 * Full-featured comments UI with tabs (Replies/Quotes), search, and sorting.
 * 
 * @example
 * ```tsx
 * <CommentsSection onClose={() => setShowComments(false)} />
 * ```
 */

import { useState, useMemo } from 'react';
import { X, Search, ThumbsUp, MessageCircle, Quote, ArrowUpDown, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ============================================================================
// TYPES
// ============================================================================

interface Comment {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  text: string;
  likes: number;
  timeAgo: string;
  isLiked?: boolean;
}

interface CommentsSectionProps {
  onClose: () => void;
  contentId?: string;
}

// ============================================================================
// MOCK DATA
// ============================================================================

const MOCK_REPLIES: Comment[] = [
  { id: 'r1', userId: 'u1', username: 'viewer_123', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face', text: 'Great content! Really helpful for my project.', likes: 42, timeAgo: '2h ago' },
  { id: 'r2', userId: 'u2', username: 'tech_fan', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face', text: 'Thanks for sharing this! Been looking for exactly this.', likes: 18, timeAgo: '5h ago' },
  { id: 'r3', userId: 'u3', username: 'dev_master', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face', text: 'Can you do a follow-up on advanced techniques?', likes: 156, timeAgo: '1d ago' },
  { id: 'r4', userId: 'u4', username: 'code_ninja', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face', text: 'This is exactly what I needed. Subscribed!', likes: 8, timeAgo: '2d ago' },
  { id: 'r5', userId: 'u5', username: 'web_wizard', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face', text: 'The explanation at 5:30 was perfect.', likes: 234, timeAgo: '3d ago' },
  { id: 'r6', userId: 'u6', username: 'learner_42', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=face', text: 'Finally understand this concept!', likes: 67, timeAgo: '4d ago' },
];

const MOCK_QUOTES: Comment[] = [
  { id: 'q1', userId: 'u7', username: 'blogger_joe', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face', text: '"Building a Full Stack App" - This changed how I approach development. A must-watch for anyone starting out.', likes: 89, timeAgo: '1h ago' },
  { id: 'q2', userId: 'u8', username: 'startup_sarah', avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&h=100&fit=crop&crop=face', text: 'As mentioned in this video, "The key is to start simple and iterate." Words to live by.', likes: 312, timeAgo: '6h ago' },
  { id: 'q3', userId: 'u9', username: 'indie_dev', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop&crop=face', text: 'Shared this with my team. The section on architecture is gold.', likes: 45, timeAgo: '2d ago' },
];

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'liked', label: 'Most Liked' },
];

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface CommentItemProps {
  comment: Comment;
  onLike: (id: string) => void;
}

function CommentItem({ comment, onLike }: CommentItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 py-3"
    >
      <Avatar className="w-8 h-8 flex-shrink-0">
        <AvatarImage src={comment.avatar} className="object-cover" />
        <AvatarFallback className="bg-zinc-700">{comment.username[0].toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-white text-sm">{comment.username}</span>
          <span className="text-zinc-500 text-xs">{comment.timeAgo}</span>
        </div>
        <p className="text-zinc-300 text-sm leading-relaxed break-words">{comment.text}</p>
        <button
          onClick={() => onLike(comment.id)}
          className={cn(
            "flex items-center gap-1.5 mt-2 text-xs transition-colors",
            comment.isLiked ? "text-red-500" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
          <span>{comment.likes}</span>
        </button>
      </div>
    </motion.div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CommentsSection({ onClose }: CommentsSectionProps) {
  const [activeTab, setActiveTab] = useState<'replies' | 'quotes'>('replies');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'liked'>('recent');
  const [replies, setReplies] = useState(MOCK_REPLIES);
  const [quotes, setQuotes] = useState(MOCK_QUOTES);
  const [newComment, setNewComment] = useState('');

  // Filter and sort comments
  const filteredComments = useMemo(() => {
    const comments = activeTab === 'replies' ? replies : quotes;
    
    let filtered = comments;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = comments.filter(
        (c) => c.text.toLowerCase().includes(query) || c.username.toLowerCase().includes(query)
      );
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === 'liked') {
        return b.likes - a.likes;
      }
      // For 'recent', we'll just use the original order (mock data is already time-sorted)
      return 0;
    });
  }, [activeTab, replies, quotes, searchQuery, sortBy]);

  const handleLike = (commentId: string) => {
    const updateComments = (comments: Comment[]) =>
      comments.map((c) =>
        c.id === commentId
          ? { ...c, likes: c.isLiked ? c.likes - 1 : c.likes + 1, isLiked: !c.isLiked }
          : c
      );

    if (activeTab === 'replies') {
      setReplies(updateComments);
    } else {
      setQuotes(updateComments);
    }
  };

  const handlePostComment = () => {
    if (!newComment.trim()) return;

    const newItem: Comment = {
      id: `new-${Date.now()}`,
      userId: 'current-user',
      username: 'you',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=currentuser',
      text: newComment,
      likes: 0,
      timeAgo: 'Just now',
    };

    if (activeTab === 'replies') {
      setReplies([newItem, ...replies]);
    } else {
      setQuotes([newItem, ...quotes]);
    }
    setNewComment('');
  };

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="mt-3 pt-3 border-t border-zinc-800"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-white">Comments</span>
        <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'replies' | 'quotes')}>
        <TabsList className="w-full bg-zinc-800 p-1 rounded-lg mb-3">
          <TabsTrigger
            value="replies"
            className="flex-1 data-[state=active]:bg-zinc-700 data-[state=active]:text-white text-zinc-400 rounded-md py-1.5 text-sm gap-1.5"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Replies
            <span className="text-xs text-zinc-500 ml-1">({replies.length})</span>
          </TabsTrigger>
          <TabsTrigger
            value="quotes"
            className="flex-1 data-[state=active]:bg-zinc-700 data-[state=active]:text-white text-zinc-400 rounded-md py-1.5 text-sm gap-1.5"
          >
            <Quote className="w-3.5 h-3.5" />
            Quotes
            <span className="text-xs text-zinc-500 ml-1">({quotes.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* Search & Sort */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search comments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-zinc-800 border-zinc-700 text-white text-sm h-9"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-300 hover:bg-zinc-700 transition-colors">
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{currentSortLabel}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-800 border-zinc-700">
              {SORT_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setSortBy(option.value as 'recent' | 'liked')}
                  className={cn(
                    "text-white hover:bg-zinc-700 cursor-pointer",
                    sortBy === option.value && "bg-zinc-700"
                  )}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* New Comment Input */}
        <div className="flex gap-2 mb-3">
          <Avatar className="w-8 h-8">
            <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=currentuser" />
            <AvatarFallback className="bg-zinc-700">U</AvatarFallback>
          </Avatar>
          <div className="flex-1 flex gap-2">
            <Input
              placeholder={activeTab === 'replies' ? 'Add a reply...' : 'Add a quote...'}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white text-sm h-9"
              onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
            />
            <button
              onClick={handlePostComment}
              disabled={!newComment.trim()}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                newComment.trim()
                  ? "bg-blue-500 text-white hover:bg-blue-600"
                  : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
              )}
            >
              Post
            </button>
          </div>
        </div>

        {/* Comments List */}
        <TabsContent value="replies" className="mt-0">
          <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto">
            <AnimatePresence mode="popLayout">
              {filteredComments.length > 0 ? (
                filteredComments.map((comment) => (
                  <CommentItem key={comment.id} comment={comment} onLike={handleLike} />
                ))
              ) : (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-zinc-500 text-sm py-6 text-center"
                >
                  {searchQuery ? 'No replies found' : 'No replies yet. Be the first!'}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </TabsContent>

        <TabsContent value="quotes" className="mt-0">
          <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto">
            <AnimatePresence mode="popLayout">
              {filteredComments.length > 0 ? (
                filteredComments.map((comment) => (
                  <CommentItem key={comment.id} comment={comment} onLike={handleLike} />
                ))
              ) : (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-zinc-500 text-sm py-6 text-center"
                >
                  {searchQuery ? 'No quotes found' : 'No quotes yet. Be the first!'}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
