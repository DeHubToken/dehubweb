/**
 * Quote Post Modal
 * =================
 * Liquid glass drawer for quoting a post with your own commentary.
 * Handles full 2-step flow: API signature + on-chain mint.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { quotePost } from '@/lib/api/dehub';
import { mintOnChain } from '@/lib/contracts/stream-collection';
import { QuotedPostEmbed } from '../cards/QuotedPostEmbed';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
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
  const [statusText, setStatusText] = useState('');
  const queryClient = useQueryClient();
  const maxLength = 500;

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast.error('Add some text to your quote');
      return;
    }

    setIsSubmitting(true);
    try {
      // Step 1: Call API to get mint signature
      setStatusText('Preparing quote...');
      const mintSig = await quotePost({
        quotedTokenId: quotedPost.tokenId,
        content: content.trim(),
      });

      console.log('[QuotePost] Mint signature received:', {
        createdTokenId: mintSig.createdTokenId,
        v: mintSig.v,
      });

      // Step 2: Execute on-chain mint transaction
      toast.loading('Publishing to decentralized database...', { id: 'quote-mint', duration: Infinity });

      const txHash = await mintOnChain({
        tokenId: mintSig.createdTokenId,
        timestamp: mintSig.timestamp,
        v: mintSig.v,
        r: mintSig.r,
        s: mintSig.s,
        chainId: 8453,
      });

      console.log('[QuotePost] Minted on-chain, tx:', txHash);

      toast.dismiss('quote-mint');
      toast.success('Quote posted!');
      queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
      setContent('');
      onOpenChange(false);
    } catch (error) {
      console.error('Quote post failed:', error);
      toast.dismiss('quote-mint');
      const message = error instanceof Error ? error.message : 'Failed to post quote';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
      setStatusText('');
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="max-h-[85vh]">
        <VisuallyHidden>
          <DrawerTitle>Quote Post</DrawerTitle>
        </VisuallyHidden>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-white/10">
          <button
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="text-white/50 hover:text-white transition-colors disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !content.trim()}
            className="px-4 py-1.5 rounded-full bg-white text-black font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/90 transition-colors"
          >
            {isSubmitting ? (statusText || 'Posting...') : 'Post'}
          </button>
        </div>

        {/* Compose area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, maxLength))}
            placeholder="Add a comment..."
            className="w-full bg-transparent text-white placeholder-white/30 text-base resize-none outline-none min-h-[80px]"
            autoFocus
            disabled={isSubmitting}
            rows={3}
          />

          {/* Quoted post preview */}
          <QuotedPostEmbed quotedPost={quotedPost} />

          {/* Character count */}
          <div className="flex justify-end">
            <span className={`text-xs ${content.length > maxLength * 0.9 ? 'text-amber-400' : 'text-white/40'}`}>
              {content.length}/{maxLength}
            </span>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
