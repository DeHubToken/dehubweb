/**
 * Image Card Component
 * ====================
 * Displays image post content with Instagram-style swipeable carousel for multi-image posts.
 * 
 * @example
 * ```tsx
 * <ImageCard post={imageData} />
 * ```
 */

import { useState, memo, useCallback, useEffect } from 'react';
import { Eye, MoreVertical, Download, Flag, Ban, EyeOff, Sparkles, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useEmblaCarousel from 'embla-carousel-react';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsSection } from './CommentsSection';
import { TranslatableText } from '../TranslatableText';
import { PostAIChat } from './PostAIChat';
import { getViewCount } from '@/lib/feed-utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ImagePost } from '@/types/feed.types';

interface ImageCardProps {
  post: ImagePost;
}

/**
 * Instagram-style image carousel component
 * Supports swipe navigation with dot indicators
 */
function ImageCarousel({ images }: { images: string[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCurrentIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);
  
  // Set up the select callback when emblaApi becomes available
  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    onSelect();
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  
  const hasMultiple = images.length > 1;
  
  return (
    <div className="relative">
      {/* Carousel container */}
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {images.map((img, idx) => (
            <div key={idx} className="flex-[0_0_100%] min-w-0">
              <div className="aspect-square bg-zinc-800">
                <img 
                  src={img} 
                  alt="" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/placeholder.svg';
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Navigation arrows - only show if multiple images */}
      {hasMultiple && (
        <>
          {currentIndex > 0 && (
            <button
              onClick={scrollPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {currentIndex < images.length - 1 && (
            <button
              onClick={scrollNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              aria-label="Next image"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </>
      )}
      
      {/* Dot indicators - only show if multiple images */}
      {hasMultiple && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((_, idx) => (
            <button
              key={idx}
              onClick={() => emblaApi?.scrollTo(idx)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                idx === currentIndex 
                  ? 'bg-white w-2' 
                  : 'bg-white/50 hover:bg-white/70'
              }`}
              aria-label={`Go to image ${idx + 1}`}
            />
          ))}
        </div>
      )}
      
      {/* Image counter badge - only show if multiple images */}
      {hasMultiple && (
        <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-black/60 text-white text-xs font-medium">
          {currentIndex + 1}/{images.length}
        </div>
      )}
    </div>
  );
}

/**
 * Feed description component with expandable text
 */
function FeedDescription({ 
  title, 
  description 
}: { 
  title?: string; 
  description?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const MAX_LENGTH = 150;
  
  const hasLongDescription = description && description.length > MAX_LENGTH;
  const displayDescription = expanded || !hasLongDescription 
    ? description 
    : `${description.slice(0, MAX_LENGTH)}...`;
  
  if (!title && !description) return null;
  
  return (
    <div className="space-y-1">
      {title && (
        <h3 className="text-white text-sm font-semibold leading-tight">
          <TranslatableText text={title} as="span" />
        </h3>
      )}
      {description && (
        <div>
          <p className="text-zinc-300 text-sm leading-relaxed">
            <TranslatableText text={displayDescription} as="span" />
          </p>
          {hasLongDescription && (
            <button 
              onClick={() => setExpanded(!expanded)}
              className="text-zinc-500 text-xs flex items-center gap-0.5 mt-1 hover:text-zinc-400 transition-colors"
            >
              {expanded ? (
                <>Show less <ChevronUp className="w-3 h-3" /></>
              ) : (
                <>Show more <ChevronDown className="w-3 h-3" /></>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export const ImageCard = memo(function ImageCard({ post }: ImageCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);

  // Get images array - use imageUrls if available, otherwise fall back to single image
  const images = post.imageUrls && post.imageUrls.length > 0 
    ? post.imageUrls 
    : [post.image];

  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      {/* Header with AI and menu buttons */}
      <div className="flex items-center justify-between">
        <CardHeader
          username={post.username}
          avatarSeed={post.avatar}
          verified={post.verified}
          contentType="image"
          creatorId={post.creatorId}
          creatorUsername={post.creatorUsername}
        />
        <div className="flex items-center gap-1 pr-3">
          <motion.button
            onClick={() => setShowAIChat(true)}
            className="text-zinc-400 hover:text-white transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Ask AI about this post"
          >
            <Sparkles className="w-5 h-5" />
          </motion.button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-800 border-zinc-700">
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Download className="w-4 h-4" /> Download
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Flag className="w-4 h-4" /> Report
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Ban className="w-4 h-4" /> Block Creator
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <EyeOff className="w-4 h-4" /> See Less Like This
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Image Carousel */}
      <ImageCarousel images={images} />

      {/* Info & Actions */}
      <div className="p-3 space-y-2">
        <ActionBar 
          postId={post.id} 
          className="p-0" 
          onComment={() => setShowComments(true)} 
          isLiked={post.isLiked} 
          isDisliked={post.isDisliked} 
        />
        
        <p className="font-semibold text-white text-sm">{post.likes.toLocaleString()} likes</p>
        
        {/* Title & Description */}
        <FeedDescription 
          title={post.title} 
          description={post.description} 
        />
        
        <div className="flex items-center gap-3">
          <span className="text-zinc-500 text-xs">{post.timeAgo}</span>
          <span className="inline-flex items-center gap-1 text-zinc-500 text-xs leading-none">
            <Eye className="w-3 h-3 shrink-0 translate-y-[0.5px]" />
            <span className="leading-none">{getViewCount(post.id)} views</span>
          </span>
        </div>
      </div>

      {/* Inline Comments Section */}
      <AnimatePresence>
        {showComments && (
          <CommentsSection
            tokenId={post.id}
            onClose={() => setShowComments(false)}
          />
        )}
      </AnimatePresence>

      {/* AI Chat */}
      <PostAIChat
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
        postContext={{
          type: 'image',
          author: post.username,
          caption: post.description || post.title || post.caption,
          imageUrl: post.image
        }}
      />
    </div>
  );
});
