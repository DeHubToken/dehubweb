import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { PostMediaPreview } from './PostMediaPreview';
import type { MediaFile, AudioFile, LiveMode } from '../types';

interface PostContentAreaProps {
  text: string;
  setText: (text: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  media: MediaFile[];
  onRemoveMedia: (index: number) => void;
  onAddAudio: (index: number, audio: AudioFile) => void;
  onRemoveAudio: (index: number) => void;
  liveMode: LiveMode;
  canPost: boolean;
  destinations: string[];
}

export function PostContentArea({
  text,
  setText,
  textareaRef,
  media,
  onRemoveMedia,
  onAddAudio,
  onRemoveAudio,
  liveMode,
  canPost,
  destinations,
}: PostContentAreaProps) {
  const isLive = liveMode !== null;
  return (
    <div className="p-4 max-h-[60vh] overflow-y-auto">
      <div className="flex gap-3">
        <Avatar className="w-10 h-10 flex-shrink-0">
          <AvatarImage src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100" />
          <AvatarFallback>U</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What's happening?"
            className="w-full bg-transparent text-white text-lg placeholder:text-white/70 resize-none outline-none min-h-[80px] pb-5"
            rows={3}
          />
          <span className={cn("absolute bottom-0 right-0 text-xs", text.length > 280 ? "text-amber-400" : "text-white")}>
            {text.length}/280
          </span>

          <PostMediaPreview 
            media={media} 
            onRemove={onRemoveMedia}
            onAddAudio={onAddAudio}
            onRemoveAudio={onRemoveAudio}
          />

          <AnimatePresence>
            {isLive && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2"
              >
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-400 text-sm font-medium">
                  {liveMode === 'video' ? 'Live Video' : 'Town Hall'} stream will be created
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {canPost && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-2 flex items-center gap-1.5 flex-wrap"
              >
                <span className="text-xs text-zinc-500">In:</span>
                {destinations.map(dest => (
                  <span
                    key={dest}
                    className={cn(
                      "text-xs px-1.5 py-0.5 rounded-full",
                      dest === 'Shorts' ? 'bg-emerald-500/20 text-emerald-400' :
                      dest === 'Live' ? 'bg-red-500/20 text-red-400' :
                      'bg-zinc-800 text-zinc-400'
                    )}
                  >
                    {dest}
                  </span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
