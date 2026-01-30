/**
 * Comment Item Component
 * ======================
 * Full-featured comment item with Like/Dislike, Reply, Share dropdown, and Bookmark.
 * Matches the CommentsSection CommentItem exactly.
 */

import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ThumbsUp, ThumbsDown, MessageSquare, Share2, Bookmark, Repeat2, Link } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TranslatableText } from '../TranslatableText';
import { getMediaUrl } from '@/lib/api/dehub';
import { cn } from '@/lib/utils';
import type { Comment } from './types';

interface VoiceNote {
  url: string;
  duration: number;
}

interface VoiceNotePlayerProps {
  voiceNote: VoiceNote;
}

function VoiceNotePlayer({ voiceNote }: VoiceNotePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(voiceNote.url);
      audioRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <button
      onClick={togglePlay}
      className="flex items-center gap-1.5 bg-zinc-700/50 px-2 py-1 rounded-full text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
    >
      {isPlaying ? (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="4" width="4" height="16" />
          <rect x="14" y="4" width="4" height="16" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <polygon points="5,3 19,12 5,21" />
        </svg>
      )}
      <span>{voiceNote.duration}s</span>
    </button>
  );
}

interface CommentItemProps {
  comment: Comment & { 
    likes?: number; 
    dislikes?: number; 
    isLiked?: boolean; 
    isDisliked?: boolean;
    voiceNote?: VoiceNote;
  };
  onReplyPress?: (comment: Comment) => void;
  onUserPress?: (username: string) => void;
  onLike?: (id: string) => void;
  onDislike?: (id: string) => void;
  onShare?: (id: string) => void;
  onBookmark?: (id: string) => void;
  isReply?: boolean;
}

export const CommentItem = memo(function CommentItem({ 
  comment, 
  onReplyPress, 
  onUserPress,
  onLike,
  onDislike,
  onShare,
  onBookmark,
  isReply = false 
}: CommentItemProps) {
  const [isBookmarked, setIsBookmarked] = useState(false);

  const handleUserPress = useCallback(() => {
    onUserPress?.(comment.username);
  }, [comment.username, onUserPress]);

  const handleReplyPress = useCallback(() => {
    onReplyPress?.(comment);
  }, [comment, onReplyPress]);

  const handleBookmark = useCallback(() => {
    setIsBookmarked(!isBookmarked);
    onBookmark?.(comment.id);
  }, [isBookmarked, onBookmark, comment.id]);

  const avatarUrl = comment.avatarUrl ? getMediaUrl(comment.avatarUrl) : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex gap-3 py-3 px-5", isReply && "ml-8")}
    >
      <Avatar 
        className="w-8 h-8 flex-shrink-0 cursor-pointer" 
        onClick={handleUserPress}
      >
        <AvatarImage src={avatarUrl} className="object-cover" />
        <AvatarFallback className="bg-zinc-700">
          {comment.username?.[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <button 
            onClick={handleUserPress}
            className="font-semibold text-white text-sm hover:underline"
          >
            {comment.username || 'Anonymous'}
          </button>
          <span className="text-zinc-500 text-xs">
            {comment.timeAgo}
          </span>
        </div>
        
        {comment.text && (
          <TranslatableText 
            text={comment.text} 
            className="text-zinc-300 text-sm leading-relaxed break-words" 
            as="p" 
          />
        )}

        {comment.voiceNote && (
          <div className="mt-1">
            <VoiceNotePlayer voiceNote={comment.voiceNote} />
          </div>
        )}
        
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-4">
            <button
              onClick={() => onLike?.(comment.id)}
              className={cn(
                "transition-colors",
                comment.isLiked ? "text-zinc-400" : "text-white hover:text-zinc-400"
              )}
              aria-label="Like"
            >
              <ThumbsUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDislike?.(comment.id)}
              className={cn(
                "transition-colors",
                comment.isDisliked ? "text-zinc-400" : "text-white hover:text-zinc-400"
              )}
              aria-label="Dislike"
            >
              <ThumbsDown className="w-4 h-4" />
            </button>
            {!isReply && (
              <button
                onClick={handleReplyPress}
                className="text-white hover:text-zinc-400 transition-colors"
                aria-label="Reply"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="text-white hover:text-zinc-400 transition-colors"
                  aria-label="Share"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[160px]">
                <DropdownMenuItem
                  onClick={() => onShare?.(comment.id)}
                  className="text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white gap-2"
                >
                  <Repeat2 className="w-4 h-4" />
                  Repost
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(comment.text);
                  }}
                  className="text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white gap-2"
                >
                  <Link className="w-4 h-4" />
                  Copy Text
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <button
            onClick={handleBookmark}
            className={cn(
              "transition-colors",
              isBookmarked ? "text-yellow-500" : "text-white hover:text-zinc-400"
            )}
            aria-label="Bookmark"
          >
            <Bookmark className={cn("w-4 h-4", isBookmarked && "fill-current")} />
          </button>
        </div>
      </div>
    </motion.div>
  );
});
