/**
 * Comment Item Component
 * ======================
 * Renders a single comment with avatar, username, text, and reply button.
 */

import { memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getMediaUrl } from '@/lib/api/dehub';
import type { Comment } from './types';

interface CommentItemProps {
  comment: Comment;
  onReplyPress?: (comment: Comment) => void;
  onUserPress?: (username: string) => void;
  isReply?: boolean;
}

export const CommentItem = memo(function CommentItem({ 
  comment, 
  onReplyPress, 
  onUserPress,
  isReply = false 
}: CommentItemProps) {
  const handleUserPress = useCallback(() => {
    onUserPress?.(comment.username);
  }, [comment.username, onUserPress]);

  const handleReplyPress = useCallback(() => {
    onReplyPress?.(comment);
  }, [comment, onReplyPress]);

  const avatarUrl = comment.avatarUrl ? getMediaUrl(comment.avatarUrl) : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start gap-3 px-4 py-3 ${isReply ? 'pl-12' : ''}`}
    >
      <Avatar 
        className="w-7 h-7 flex-shrink-0 cursor-pointer" 
        onClick={handleUserPress}
      >
        <AvatarImage src={avatarUrl} className="object-cover" />
        <AvatarFallback className="bg-zinc-700 text-xs">
          {comment.username?.[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <button 
            onClick={handleUserPress}
            className="text-white text-[13px] font-semibold hover:underline"
          >
            {comment.username || 'Anonymous'}
          </button>
          <span className="text-zinc-500 text-[11px]">
            {comment.timeAgo}
          </span>
        </div>
        
        <p className="text-zinc-200 text-[13px] leading-5 mt-1 break-words">
          {comment.text}
        </p>
        
        {!comment.replyToId && (
          <div className="flex items-center gap-4 mt-2">
            <button
              onClick={handleReplyPress}
              className="text-zinc-500 text-[11px] hover:text-white transition-colors"
            >
              Reply
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
});
