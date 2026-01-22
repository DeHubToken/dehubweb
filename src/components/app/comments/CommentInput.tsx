/**
 * Comment Input Component
 * =======================
 * Input field for posting comments with reply-to indicator.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { getMediaUrl } from '@/lib/api/dehub';
import type { Comment } from './types';

interface CommentInputProps {
  replyTo: Comment | null;
  onClearReply: () => void;
  onSubmit: (text: string) => void;
  isSubmitting: boolean;
}

export function CommentInput({ replyTo, onClearReply, onSubmit, isSubmitting }: CommentInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { user, isAuthenticated } = useAuth();

  // Focus input when replying
  useEffect(() => {
    if (replyTo) {
      inputRef.current?.focus();
    }
  }, [replyTo]);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) return;
    onSubmit(trimmed);
    setText('');
  }, [text, isSubmitting, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const avatarUrl = user?.avatarImageUrl || user?.avatarUrl;

  if (!isAuthenticated) {
    return (
      <div className="p-4 border-t border-zinc-800">
        <p className="text-zinc-500 text-sm text-center">
          Connect your wallet to comment
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-800">
      {/* Reply indicator */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 py-2 bg-zinc-800/50 flex items-center justify-between overflow-hidden"
          >
            <span className="text-zinc-400 text-xs">
              Replying to <span className="text-white font-medium">@{replyTo.username}</span>
            </span>
            <button
              onClick={onClearReply}
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="p-4 flex items-center gap-3">
        <Avatar className="w-8 h-8 flex-shrink-0">
          <AvatarImage src={avatarUrl ? getMediaUrl(avatarUrl) : undefined} className="object-cover" />
          <AvatarFallback className="bg-zinc-700 text-xs">
            {user?.username?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 flex items-center gap-2 bg-zinc-800 rounded-full px-4 py-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={replyTo ? `Reply to @${replyTo.username}...` : "Add a comment..."}
            className="flex-1 bg-transparent text-white text-sm placeholder:text-zinc-500 outline-none"
            disabled={isSubmitting}
          />
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || isSubmitting}
            className="text-primary hover:text-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
