/**
 * Videos Feed Component
 * =====================
 * Displays a grid/list of video content with filtering options.
 * Uses universal card components for consistent styling.
 * 
 * @module components/app/feeds/VideosFeed
 */

import { useState } from 'react';
import { MoreVertical, ListPlus, Clock, Flag, Download, Ban, Repeat2, Send, Link, MessageCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CardHeader } from '@/components/app/cards/CardHeader';
import { ActionBar } from '@/components/app/cards/ActionBar';

// ============================================================================
// TYPES
// ============================================================================

interface VideosFeedProps {
  showFilters?: boolean;
}

interface YouTubeVideo {
  id: string;
  thumbnail: string;
  duration: string;
  title: string;
  channel: string;
  channelAvatar: string;
  verified: boolean;
  views: string;
  uploadedAgo: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DURATION_OPTIONS = ['0-1m', '1-4m', '4-20m', '20m+'];
const SORT_OPTIONS = ['New to Old', 'Most Liked', 'Most Viewed', 'Most Commented'];
const UPLOAD_DATE_OPTIONS = ['1d', '1w', '1y', 'All Time'];
const CATEGORY_PILLS = ['All', 'PPV', 'W2E', 'Programming', 'Web Dev', 'JavaScript', 'React', 'Python', 'Gaming', 'Music'];

const MOCK_VIDEOS: YouTubeVideo[] = [
  {
    id: '1',
    thumbnail: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=480&h=270&fit=crop',
    duration: '12:34',
    title: 'Building a Full Stack App in 2024 - Complete Guide',
    channel: 'Tech Tutorials',
    channelAvatar: 'tech',
    verified: true,
    views: '1.2M views',
    uploadedAgo: '2 weeks ago',
  },
  {
    id: '2',
    thumbnail: 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=480&h=270&fit=crop',
    duration: '8:45',
    title: 'Top 10 Programming Languages to Learn in 2024',
    channel: 'Code Academy',
    channelAvatar: 'code',
    verified: true,
    views: '856K views',
    uploadedAgo: '5 days ago',
  },
  {
    id: '3',
    thumbnail: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=480&h=270&fit=crop',
    duration: '23:12',
    title: 'Web Development Roadmap 2024 - From Zero to Hero',
    channel: 'Dev Masters',
    channelAvatar: 'dev',
    verified: false,
    views: '432K views',
    uploadedAgo: '1 month ago',
  },
  {
    id: '4',
    thumbnail: 'https://images.unsplash.com/photo-1550439062-609e1531270e?w=480&h=270&fit=crop',
    duration: '15:20',
    title: 'React vs Vue vs Angular - Which One to Choose?',
    channel: 'Framework Wars',
    channelAvatar: 'framework',
    verified: true,
    views: '2.1M views',
    uploadedAgo: '3 weeks ago',
  },
  {
    id: '5',
    thumbnail: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=480&h=270&fit=crop',
    duration: '45:00',
    title: 'Complete CSS Tutorial for Beginners',
    channel: 'Web Dev Simplified',
    channelAvatar: 'css',
    verified: true,
    views: '3.5M views',
    uploadedAgo: '6 months ago',
  },
  {
    id: '6',
    thumbnail: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=480&h=270&fit=crop',
    duration: '18:30',
    title: 'JavaScript Tips & Tricks You Need to Know',
    channel: 'JS Mastery',
    channelAvatar: 'js',
    verified: true,
    views: '789K views',
    uploadedAgo: '1 week ago',
  },
];

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
  video: YouTubeVideo;
  expandedComments: string | null;
  onToggleComments: (id: string) => void;
  commentText: string;
  onCommentChange: (text: string) => void;
  onPostComment: (id: string) => void;
}

function VideoCardItem({ 
  video, 
  expandedComments, 
  onToggleComments, 
  commentText, 
  onCommentChange,
  onPostComment 
}: VideoCardProps) {
  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      {/* Header with menu */}
      <div className="flex items-center justify-between">
        <CardHeader
          username={video.channel}
          avatarSeed={video.channelAvatar}
          verified={video.verified}
          contentType="video"
        />
        <div className="pr-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-zinc-400 hover:text-white">
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
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-3 pt-3 border-t border-zinc-800"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-white">Comments</span>
                <button onClick={() => onToggleComments(video.id)} className="text-zinc-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex gap-2 mb-3">
                <Avatar className="w-8 h-8">
                  <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=user" />
                  <AvatarFallback className="bg-zinc-700">U</AvatarFallback>
                </Avatar>
                <div className="flex-1 flex gap-2">
                  <Input
                    placeholder="Add a comment..."
                    value={commentText}
                    onChange={(e) => onCommentChange(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && onPostComment(video.id)}
                  />
                  <button
                    onClick={() => onPostComment(video.id)}
                    disabled={!commentText.trim()}
                    className={cn(
                      "px-3 py-1 rounded-lg text-sm font-medium transition-colors",
                      commentText.trim()
                        ? "bg-blue-500 text-white hover:bg-blue-600"
                        : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                    )}
                  >
                    Post
                  </button>
                </div>
              </div>

              {/* Mock Comments */}
              <div className="space-y-3">
                {[
                  { seed: 'commenter1', name: 'viewer_123', time: '2h ago', text: 'Great content! Really helpful.' },
                  { seed: 'commenter2', name: 'tech_fan', time: '5h ago', text: 'Thanks for sharing this!' },
                ].map((comment) => (
                  <div key={comment.seed} className="flex gap-2">
                    <Avatar className="w-7 h-7">
                      <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.seed}`} />
                      <AvatarFallback className="bg-zinc-700">C</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-xs">
                        <span className="font-semibold text-white">{comment.name}</span>
                        <span className="text-zinc-500 ml-2">{comment.time}</span>
                      </p>
                      <p className="text-sm text-zinc-300">{comment.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VideosFeed({ showFilters = false }: VideosFeedProps) {
  const [selectedDuration, setSelectedDuration] = useState(DURATION_OPTIONS[0]);
  const [selectedSort, setSelectedSort] = useState(SORT_OPTIONS[0]);
  const [selectedUploadDate, setSelectedUploadDate] = useState(UPLOAD_DATE_OPTIONS[3]);
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  const toggleComments = (videoId: string) => {
    setExpandedComments(expandedComments === videoId ? null : videoId);
    setCommentText('');
  };

  const handlePostComment = (videoId: string) => {
    if (commentText.trim()) {
      console.log('Posted comment on video', videoId, ':', commentText);
      setCommentText('');
    }
  };

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
        {MOCK_VIDEOS.map((video) => (
          <VideoCardItem
            key={video.id}
            video={video}
            expandedComments={expandedComments}
            onToggleComments={toggleComments}
            commentText={commentText}
            onCommentChange={setCommentText}
            onPostComment={handlePostComment}
          />
        ))}
      </div>
    </div>
  );
}
