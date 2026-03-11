/**
 * Quote Post Modal
 * =================
 * Liquid glass drawer for quoting a post with your own commentary.
 * Handles full 2-step flow: API signature + on-chain mint.
 */

import { useState, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { quotePost } from '@/lib/api/dehub';
import { mintOnChain } from '@/lib/contracts/stream-collection';
import { QuotedPostEmbed } from '../cards/QuotedPostEmbed';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const creepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queryClient = useQueryClient();
  const maxLength = 500;

  const clearCreepInterval = useCallback(() => {
    if (creepIntervalRef.current) {
      clearInterval(creepIntervalRef.current);
      creepIntervalRef.current = null;
    }
  }, []);

  const startCreepProgress = useCallback(() => {
    clearCreepInterval();
    setUploadProgress(69);
    creepIntervalRef.current = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 99) {
          clearCreepInterval();
          return 99;
        }
        const remaining = 99 - prev;
        const increment = Math.max(0.3, remaining * 0.08);
        return Math.min(99, prev + increment);
      });
    }, 1200);
  }, [clearCreepInterval]);

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast.error('Add some text to your quote');
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(0);
    try {
      // Step 1: Call API to get mint signature
      setStatusText('Preparing quote...');
      setUploadProgress(30);
      const mintSig = await quotePost({
        quotedTokenId: quotedPost.tokenId,
        content: content.trim(),
      });

      console.log('[QuotePost] Mint signature received:', {
        createdTokenId: mintSig.createdTokenId,
        v: mintSig.v,
      });

      // Step 2: Execute on-chain mint transaction
      setUploadProgress(65);
      startCreepProgress();
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

      clearCreepInterval();
      setUploadProgress(100);
      toast.dismiss('quote-mint');
      toast.success('Quote posted!');
      queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
      setContent('');
      onOpenChange(false);
    } catch (error) {
      console.error('Quote post failed:', error);
      clearCreepInterval();
      setUploadProgress(0);
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
            {isSubmitting ? 'Posting...' : 'Post'}
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

          {/* Progress bar */}
          {isSubmitting && uploadProgress > 0 && (
            <LiquidGlassBubble shimmer noBorder className="mt-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/70 font-medium">
                    Publishing...
                  </span>
                  <span className="text-xs text-white/50 tabular-nums">
                    {Math.round(uploadProgress)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-white/40 via-white/60 to-white/40 transition-all duration-500 ease-out relative"
                    style={{ width: `${uploadProgress}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                  </div>
                </div>
              </div>
            </LiquidGlassBubble>
          )}

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
