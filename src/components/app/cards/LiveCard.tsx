/**
 * Live Card Component
 * ===================
 * Displays live stream content with viewer count and universal styling.
 * 
 * @example
 * ```tsx
 * <LiveCard stream={liveData} />
 * ```
 */

import { Eye } from 'lucide-react';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import type { LiveStream } from '@/types/feed.types';

interface LiveCardProps {
  stream: LiveStream;
}

export function LiveCard({ stream }: LiveCardProps) {
  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      <CardHeader
        username={stream.streamer}
        avatarSeed={stream.avatar}
        contentType="live"
        isLive
      />

      {/* Thumbnail */}
      <div className="relative aspect-video bg-zinc-800">
        <img src={stream.thumbnail} alt="" className="w-full h-full object-cover" />
        <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/70 px-2 py-0.5 rounded">
          <Eye className="w-3 h-3 text-red-500" />
          <span className="text-white text-xs font-medium">{stream.viewers}</span>
        </div>
      </div>

      {/* Info & Actions */}
      <div className="p-3">
        <ActionBar className="p-0 mb-2" />
        <p className="font-semibold text-white text-sm">{stream.viewers} watching</p>
        <h3 className="text-white text-sm mt-1">{stream.title}</h3>
        <p className="text-zinc-500 text-xs mt-1">{stream.game}</p>
      </div>
    </div>
  );
}
