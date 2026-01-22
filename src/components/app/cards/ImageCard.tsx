/**
 * Image Card Component
 * ====================
 * Displays image post content with support for multi-image grids (1-4 images).
 * 
 * @example
 * ```tsx
 * <ImageCard post={imageData} />
 * ```
 */

import { useState, memo } from 'react';
import { Eye, MoreVertical, Download, Flag, Ban, EyeOff, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
 * Multi-image grid component
 * Displays 1-4 images in an Instagram-style grid layout
 */
function ImageGrid({ images, onImageClick }: { images: string[]; onImageClick?: (index: number) => void }) {
  const count = images.length;
  
  if (count === 1) {
    return (
      <div className="aspect-square bg-zinc-800">
        <img 
          src={images[0]} 
          alt="" 
          className="w-full h-full object-cover cursor-pointer"
          onClick={() => onImageClick?.(0)}
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/placeholder.svg';
          }}
        />
      </div>
    );
  }
  
  if (count === 2) {
    return (
      <div className="grid grid-cols-2 gap-0.5 aspect-square bg-zinc-800">
        {images.map((img, idx) => (
          <img 
            key={idx}
            src={img} 
            alt="" 
            className="w-full h-full object-cover cursor-pointer"
            onClick={() => onImageClick?.(idx)}
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/placeholder.svg';
            }}
          />
        ))}
      </div>
    );
  }
  
  if (count === 3) {
    return (
      <div className="grid grid-cols-2 gap-0.5 aspect-square bg-zinc-800">
        <img 
          src={images[0]} 
          alt="" 
          className="row-span-2 w-full h-full object-cover cursor-pointer"
          onClick={() => onImageClick?.(0)}
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/placeholder.svg';
          }}
        />
        <img 
          src={images[1]} 
          alt="" 
          className="w-full h-full object-cover cursor-pointer"
          onClick={() => onImageClick?.(1)}
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/placeholder.svg';
          }}
        />
        <img 
          src={images[2]} 
          alt="" 
          className="w-full h-full object-cover cursor-pointer"
          onClick={() => onImageClick?.(2)}
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/placeholder.svg';
          }}
        />
      </div>
    );
  }
  
  // 4 images
  return (
    <div className="grid grid-cols-2 gap-0.5 aspect-square bg-zinc-800">
      {images.slice(0, 4).map((img, idx) => (
        <img 
          key={idx}
          src={img} 
          alt="" 
          className="w-full h-full object-cover cursor-pointer"
          onClick={() => onImageClick?.(idx)}
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/placeholder.svg';
          }}
        />
      ))}
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

      {/* Image Grid */}
      <ImageGrid images={images} />

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
