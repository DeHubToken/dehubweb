/**
 * Shorts Viewer Component
 * =======================
 * Full-screen mobile shorts viewer with comments overlay.
 */

import { useState } from 'react';
import { X, Heart, MessageCircle, Share2, MoreHorizontal, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { ShortVideo } from '@/types/feed.types';

interface ShortsViewerProps {
  shorts: ShortVideo[];
  initialIndex: number;
  onClose: () => void;
}

// Mock comments data
const MOCK_COMMENTS = [
  { id: '1', username: 'username', text: 'lets gooo!!', avatar: 'user1' },
  { id: '2', username: 'username', text: 'Another one!', avatar: 'user2' },
  { id: '3', username: 'username', text: 'User comment goes here. It can have a max of 2 lines as...', avatar: 'user3' },
];

const MOCK_NOTIFICATION = { username: 'User994', action: 'followed the host' };

export function ShortsViewer({ shorts, initialIndex, onClose }: ShortsViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [comment, setComment] = useState('');
  const [isLiked, setIsLiked] = useState(false);

  const currentShort = shorts[currentIndex];

  const handleSwipeUp = () => {
    if (currentIndex < shorts.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsLiked(false);
    }
  };

  const handleSwipeDown = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsLiked(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black"
    >
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={currentShort.thumbnail}
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
      </div>

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10">
        <span className="text-white/70 text-sm font-medium">Live stories</span>
        <button
          onClick={onClose}
          className="w-8 h-8 bg-zinc-800/80 rounded-full flex items-center justify-center"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Creator Info */}
      <div className="absolute top-16 left-4 z-10">
        <div className="flex items-center gap-2 bg-zinc-800/70 backdrop-blur-sm rounded-full pl-1 pr-3 py-1">
          <Avatar className="w-8 h-8 border border-white/20">
            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${currentShort.username}`} />
            <AvatarFallback>{currentShort.username[0]}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-white text-sm font-medium">creatorname</span>
            <span className="text-white/60 text-xs">{currentShort.likes} viewers</span>
          </div>
          <button className="ml-2 bg-white text-black text-xs font-semibold px-3 py-1 rounded-full">
            Follow
          </button>
        </div>
      </div>

      {/* Comments Section */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 space-y-3">
        {/* Comments List */}
        <div className="space-y-3 max-h-[200px] overflow-y-auto scrollbar-hide">
          {MOCK_COMMENTS.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <Avatar className="w-7 h-7 flex-shrink-0">
                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${c.avatar}`} />
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <span className="text-white text-sm font-medium">{c.username}</span>
                <p className="text-white/80 text-sm line-clamp-2">{c.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Follow Notification */}
        <div className="flex items-center gap-2">
          <Avatar className="w-5 h-5">
            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=user994`} />
            <AvatarFallback>U</AvatarFallback>
          </Avatar>
          <span className="text-white/60 text-xs">
            <span className="text-white/80">{MOCK_NOTIFICATION.username}</span> {MOCK_NOTIFICATION.action}
          </span>
        </div>

        {/* Comment Input & Actions */}
        <div className="flex items-center gap-3 pt-2">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Add Comment..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full bg-zinc-800/70 backdrop-blur-sm text-white placeholder-white/40 text-sm rounded-full px-4 py-2.5 pr-10 border border-white/10 focus:outline-none focus:border-white/30"
            />
            {comment && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-primary">
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <button
            onClick={() => setIsLiked(!isLiked)}
            className="w-10 h-10 bg-zinc-800/70 backdrop-blur-sm rounded-full flex items-center justify-center"
          >
            <Heart className={`w-5 h-5 ${isLiked ? 'text-red-500 fill-red-500' : 'text-white'}`} />
          </button>
          <button className="w-10 h-10 bg-zinc-800/70 backdrop-blur-sm rounded-full flex items-center justify-center">
            <Share2 className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Swipe areas (invisible) */}
      <div
        className="absolute top-0 left-0 right-0 h-1/2 z-5"
        onClick={handleSwipeDown}
      />
      <div
        className="absolute bottom-1/3 left-0 right-0 h-1/3 z-5"
        onClick={handleSwipeUp}
      />

      {/* Progress indicators */}
      <div className="absolute top-12 left-4 right-4 flex gap-1 z-10">
        {shorts.map((_, idx) => (
          <div
            key={idx}
            className={`h-0.5 flex-1 rounded-full transition-colors ${
              idx === currentIndex ? 'bg-white' : 'bg-white/30'
            }`}
          />
        ))}
      </div>
    </motion.div>
  );
}
