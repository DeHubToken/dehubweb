import { useState } from 'react';
import { MoreVertical, ThumbsUp, ThumbsDown, Share, Clock, CheckCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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

const DURATION_OPTIONS = ['0-1m', '1-4m', '4-20m', '20m+'];
const SORT_OPTIONS = ['New to Old', 'Most Liked', 'Most Viewed', 'Most Commented'];
const UPLOAD_DATE_OPTIONS = ['1d', '1w', '1y', 'All Time'];

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

function FilterSection({ 
  label, 
  options, 
  selected, 
  onSelect 
}: { 
  label: string; 
  options: string[]; 
  selected: string; 
  onSelect: (value: string) => void;
}) {
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

export function VideosFeed({ showFilters = false }: VideosFeedProps) {
  const [selectedDuration, setSelectedDuration] = useState(DURATION_OPTIONS[0]);
  const [selectedSort, setSelectedSort] = useState(SORT_OPTIONS[0]);
  const [selectedUploadDate, setSelectedUploadDate] = useState(UPLOAD_DATE_OPTIONS[3]);

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
              <FilterSection
                label="Duration"
                options={DURATION_OPTIONS}
                selected={selectedDuration}
                onSelect={setSelectedDuration}
              />
              <FilterSection
                label="Sort"
                options={SORT_OPTIONS}
                selected={selectedSort}
                onSelect={setSelectedSort}
              />
              <FilterSection
                label="Upload Date"
                options={UPLOAD_DATE_OPTIONS}
                selected={selectedUploadDate}
                onSelect={setSelectedUploadDate}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category Pills */}
      <div className="bg-zinc-900 rounded-2xl p-3 mb-3">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {['All', 'PPV', 'W2E', 'Programming', 'Web Dev', 'JavaScript', 'React', 'Python', 'Gaming', 'Music'].map((cat, i) => (
            <button
              key={cat}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                i === 0
                  ? 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Video Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
        {MOCK_VIDEOS.map((video) => (
          <div key={video.id} className="bg-zinc-900 rounded-2xl overflow-hidden cursor-pointer hover:bg-zinc-800/50 transition-colors">
            {/* Thumbnail */}
            <div className="relative aspect-video bg-zinc-800">
              <img src={video.thumbnail} alt="" className="w-full h-full object-cover" />
              <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-xs text-white font-medium">
                {video.duration}
              </div>
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                <div className="flex gap-2">
                  <button className="p-2 bg-black/60 rounded-full">
                    <Clock className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="p-3 flex gap-3">
              <Avatar className="w-9 h-9 flex-shrink-0">
                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${video.channelAvatar}`} />
                <AvatarFallback className="bg-zinc-700">{video.channel[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-white text-sm line-clamp-2 leading-tight mb-1">
                  {video.title}
                </h3>
                <div className="flex items-center gap-1 text-zinc-500 text-xs">
                  <span>{video.channel}</span>
                  {video.verified && (
                    <CheckCircle className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                </div>
                <p className="text-zinc-500 text-xs">
                  {video.views} • {video.uploadedAgo}
                </p>
              </div>
              <button className="text-zinc-400 hover:text-white self-start">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
