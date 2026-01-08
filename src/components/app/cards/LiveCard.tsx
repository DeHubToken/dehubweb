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

import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsSection, generateRandomComments, generateRandomQuotes } from './CommentsSection';
import type { LiveStream } from '@/types/feed.types';

interface LiveCardProps {
  stream: LiveStream;
}

export function LiveCard({ stream }: LiveCardProps) {
  const [showComments, setShowComments] = useState(false);

  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      <CardHeader
        username={stream.streamer}
        avatarSeed={stream.avatar}
        contentType="live"
        isLive
      />

      {/* Thumbnail */}
      <div className="aspect-video bg-zinc-800">
        <img src={stream.thumbnail} alt="" className="w-full h-full object-cover" />
      </div>

      {/* Info & Actions */}
      <div className="p-3">
        <ActionBar postId={stream.id} className="p-0 mb-2" onComment={() => setShowComments(!showComments)} />
        <p className="font-semibold text-white text-sm">{stream.viewers} watching</p>
        <h3 className="text-white text-sm mt-1">{stream.title}</h3>
        <p className="text-zinc-500 text-xs mt-1">{stream.game}</p>

        {/* Comments Section */}
        <AnimatePresence>
          {showComments && (
            <CommentsSection 
              onClose={() => setShowComments(false)} 
              initialReplies={generateRandomComments(15, stream.id)}
              initialQuotes={generateRandomQuotes(5, stream.id)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
