/**
 * Video Card Component
 * ====================
 * Displays video content with thumbnail, duration, and universal styling.
 * 
 * @example
 * ```tsx
 * <VideoCard video={videoData} />
 * ```
 */

import { Eye } from 'lucide-react';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { TranslatableText } from '../TranslatableText';
import type { VideoItem } from '@/types/feed.types';

interface VideoCardProps {
  video: VideoItem;
}

export function VideoCard({ video }: VideoCardProps) {
  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      <CardHeader
        username={video.channel}
        avatarSeed={video.channelAvatar}
        verified={video.verified}
        contentType="video"
      />

      {/* Thumbnail */}
      <div className="relative aspect-video bg-zinc-800">
        <img src={video.thumbnail} alt="" className="w-full h-full object-cover" />
        <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-xs text-white font-medium">
          {video.duration}
        </div>
        {/* View count */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/70 px-2 py-0.5 rounded">
          <Eye className="w-3 h-3 text-white" />
          <span className="text-white text-xs font-medium">{video.views}</span>
        </div>
        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center cursor-pointer hover:bg-black/80 transition-colors">
            <div className="w-0 h-0 border-l-[18px] border-l-white border-y-[11px] border-y-transparent ml-1" />
          </div>
        </div>
      </div>

      {/* Info & Actions */}
      <div className="p-3">
        <ActionBar className="p-0 mb-2" />
        <TranslatableText text={video.title} className="text-white text-sm font-medium" as="h3" />
        <p className="text-zinc-500 text-xs mt-1">{video.uploadedAgo}</p>
      </div>
    </div>
  );
}
