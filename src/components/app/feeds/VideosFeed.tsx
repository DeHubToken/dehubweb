/**
 * Videos Feed Component
 * =====================
 * Displays a grid/list of video content with filtering options.
 * Uses universal card components and centralized mock data.
 * 
 * @module components/app/feeds/VideosFeed
 */

import { useState, useMemo } from 'react';
import { MoreVertical, ListPlus, Clock, Flag, Download, Ban, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PostAIChat } from '@/components/app/cards/PostAIChat';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CardHeader } from '@/components/app/cards/CardHeader';
import { ActionBar } from '@/components/app/cards/ActionBar';
import { CommentsSection, generateRandomComments, generateRandomQuotes } from '@/components/app/cards/CommentsSection';

import { SAMPLE_VIDEOS } from '@/data/mock-feed.data';
import { shuffleArray } from '@/lib/feed-utils';
import type { VideoItem } from '@/types/feed.types';

// ============================================================================
// TYPES
// ============================================================================

interface VideosFeedProps {
  showFilters?: boolean;
  isRefreshing?: boolean;
  refreshKey?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DURATION_OPTIONS = ['0-1m', '1-4m', '4-20m', '20m+'];
const SORT_OPTIONS = ['New to Old', 'Most Liked', 'Most Viewed', 'Most Commented'];
const UPLOAD_DATE_OPTIONS = ['1d', '1w', '1y', 'All Time'];
const CATEGORY_PILLS = ['All', 'PPV', 'W2E', 'Programming', 'Web Dev', 'JavaScript', 'React', 'Python', 'Gaming', 'Music'];

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface FilterSectionProps {
  label: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}

function FilterSection({ label, options, selected, onSelect }: FilterSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
      <div className="flex gap-1.5 flex-wrap">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onSelect(option)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              selected === option
                ? 'bg-white text-black'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

interface VideoCardProps {
  video: VideoItem;
  expandedComments: string | null;
  onToggleComments: (id: string) => void;
}

function VideoCardItem({ 
  video, 
  expandedComments, 
  onToggleComments
}: VideoCardProps) {
  const [showAIChat, setShowAIChat] = useState(false);

  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      {/* Header with AI and menu */}
      <div className="flex items-center justify-between">
        <CardHeader
          username={video.channel}
          avatarSeed={video.channelAvatar}
          verified={video.verified}
          contentType="video"
        />
        <div className="flex items-center gap-1 pr-3">
          <motion.button
            onClick={() => setShowAIChat(true)}
            className="text-zinc-400 hover:text-white transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Ask AI about this video"
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
                <ListPlus className="w-4 h-4" /> Queue
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Clock className="w-4 h-4" /> Watch List
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Flag className="w-4 h-4" /> Report
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Download className="w-4 h-4" /> Download
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Ban className="w-4 h-4" /> Block Creator
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Thumbnail */}
      <div className="relative aspect-video bg-zinc-800">
        <img src={video.thumbnail} alt="" className="w-full h-full object-cover" />
        <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-xs text-white font-medium">
          {video.duration}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center cursor-pointer hover:bg-black/80 transition-colors">
            <div className="w-0 h-0 border-l-[18px] border-l-white border-y-[11px] border-y-transparent ml-1" />
          </div>
        </div>
      </div>

      {/* Actions & Info */}
      <div className="p-3">
        <ActionBar 
          postId={video.id}
          className="p-0 mb-2" 
          onComment={() => onToggleComments(video.id)}
        />
        <p className="font-semibold text-white text-sm mb-1">{video.views}</p>
        <h3 className="text-white text-sm mb-1">
          <span className="font-semibold">{video.channel}</span>{' '}
          <span className="text-zinc-300">{video.title}</span>
        </h3>
        <p className="text-zinc-500 text-xs">{video.uploadedAgo}</p>

        {/* Comments Section */}
        <AnimatePresence>
          {expandedComments === video.id && (
            <CommentsSection 
              onClose={() => onToggleComments(video.id)} 
              initialReplies={generateRandomComments(15, video.id)}
              initialQuotes={generateRandomQuotes(5, video.id)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* AI Chat */}
      <PostAIChat
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
        postContext={{
          type: 'video',
          author: video.channel,
          title: video.title,
          imageUrl: video.thumbnail
        }}
      />
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VideosFeed({ showFilters = false, isRefreshing = false, refreshKey = 0 }: VideosFeedProps) {
  const [selectedDuration, setSelectedDuration] = useState(DURATION_OPTIONS[0]);
  const [selectedSort, setSelectedSort] = useState(SORT_OPTIONS[0]);
  const [selectedUploadDate, setSelectedUploadDate] = useState(UPLOAD_DATE_OPTIONS[3]);
  const [expandedComments, setExpandedComments] = useState<string | null>(null);

  // Shuffle videos on refresh using centralized data and shared utility
  const shuffledVideos = useMemo(() => {
    return shuffleArray(SAMPLE_VIDEOS, refreshKey);
  }, [refreshKey]);

  const toggleComments = (videoId: string) => {
    setExpandedComments(expandedComments === videoId ? null : videoId);
  };

  if (isRefreshing) {
    return (
      <div className="p-2 sm:p-3 flex items-center justify-center py-32">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-3">
      {/* Filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="bg-zinc-900 rounded-2xl p-4 mb-3 space-y-4">
              <FilterSection label="Duration" options={DURATION_OPTIONS} selected={selectedDuration} onSelect={setSelectedDuration} />
              <FilterSection label="Sort" options={SORT_OPTIONS} selected={selectedSort} onSelect={setSelectedSort} />
              <FilterSection label="Upload Date" options={UPLOAD_DATE_OPTIONS} selected={selectedUploadDate} onSelect={setSelectedUploadDate} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category Pills */}
      <div className="bg-zinc-900 rounded-2xl p-3 mb-3">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {CATEGORY_PILLS.map((cat, i) => (
            <button
              key={cat}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                i === 0 ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Video Grid */}
      <div className="space-y-3">
        {shuffledVideos.map((video) => (
          <VideoCardItem
            key={video.id}
            video={video}
            expandedComments={expandedComments}
            onToggleComments={toggleComments}
          />
        ))}
      </div>
    </div>
  );
}
