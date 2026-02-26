/**
 * Quote Post Modal
 * =================
 * Twitter/X-style modal for quoting a post with your own commentary.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { quotePost } from '@/lib/api/dehub';
import { QuotedPostEmbed } from '../cards/QuotedPostEmbed';
import type { DeHubNFT } from '@/lib/api/dehub/types';

interface QuotePostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The post being quoted */
  quotedPost: DeHubNFT;
}

export function QuotePostModal({ open, onOpenChange, quotedPost }: QuotePostModalProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const maxLength = 500;

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast.error('Add some text to your quote');
      return;
    }

    setIsSubmitting(true);
    try {
      await quotePost({
        quotedTokenId: quotedPost.tokenId,
        content: content.trim(),
      });
      toast.success('Quote posted!');
      queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
      setContent('');
      onOpenChange(false);
    } catch (error) {
      console.error('Quote post failed:', error);
      toast.error('Failed to post quote. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <button
                onClick={() => onOpenChange(false)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !content.trim()}
                className="px-4 py-1.5 rounded-full bg-white text-black font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-200 transition-colors"
              >
                {isSubmitting ? 'Posting...' : 'Post'}
              </button>
            </div>

            {/* Compose area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, maxLength))}
                placeholder="Add a comment..."
                className="w-full bg-transparent text-white placeholder-zinc-500 text-base resize-none outline-none min-h-[80px]"
                autoFocus
                rows={3}
              />

              {/* Quoted post preview */}
              <QuotedPostEmbed quotedPost={quotedPost} />

              {/* Character count */}
              <div className="flex justify-end">
                <span className={`text-xs ${content.length > maxLength * 0.9 ? 'text-amber-400' : 'text-zinc-500'}`}>
                  {content.length}/{maxLength}
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
