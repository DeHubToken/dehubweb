import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { PostMediaPreview } from './PostMediaPreview';
import type { MediaFile, AudioFile, LiveMode } from '../types';
import { useEffect, useCallback } from 'react';

interface PostContentAreaProps {
  text: string;
  setText: (text: string) => void;
  editorRef: React.RefObject<HTMLDivElement>;
  media: MediaFile[];
  onRemoveMedia: (index: number) => void;
  onAddAudio: (index: number, audio: AudioFile) => void;
  onRemoveAudio: (index: number) => void;
  onToggleMusicVideo: (index: number) => void;
  onAddThumbnail: (index: number, thumbnailUrl: string) => void;
  onRemoveThumbnail: (index: number) => void;
  liveMode: LiveMode;
  canPost: boolean;
  destinations: string[];
  hasVideo: boolean;
}

export function PostContentArea({
  text,
  setText,
  editorRef,
  media,
  onRemoveMedia,
  onAddAudio,
  onRemoveAudio,
  onToggleMusicVideo,
  onAddThumbnail,
  onRemoveThumbnail,
  liveMode,
  canPost,
  destinations,
  hasVideo,
}: PostContentAreaProps) {
  const isLive = liveMode !== null;

  // Get plain text length for character count
  const getPlainTextLength = useCallback(() => {
    if (!editorRef.current) return 0;
    return editorRef.current.innerText.length;
  }, [editorRef]);

  const charCount = text.length;

  // Handle input changes
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    // Convert to plain text for state (preserving line breaks)
    const plainText = editorRef.current.innerText;
    setText(plainText);
  }, [editorRef, setText]);

  // Sync content when text is cleared (e.g., on form reset)
  useEffect(() => {
    if (text === '' && editorRef.current && editorRef.current.innerHTML !== '') {
      editorRef.current.innerHTML = '';
    }
  }, [text, editorRef]);

  return (
    <div className="p-4 max-h-[60vh] overflow-y-auto">
      <div className="flex gap-3">
        <Avatar className="w-10 h-10 flex-shrink-0">
          <AvatarImage src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100" />
          <AvatarFallback>U</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 relative">
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            data-placeholder={hasVideo ? "This first line is used for thumbnail titles..." : "What's happening?"}
            className="w-full bg-transparent text-white text-lg resize-none outline-none min-h-[80px] pb-5 empty:before:content-[attr(data-placeholder)] empty:before:text-white/70 empty:before:pointer-events-none"
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          />
          <span className={cn("absolute bottom-0 right-0 text-xs", charCount > 280 ? "text-amber-400" : "text-white")}>
            {charCount}/280
          </span>

          <PostMediaPreview 
            media={media} 
            onRemove={onRemoveMedia}
            onAddAudio={onAddAudio}
            onRemoveAudio={onRemoveAudio}
            onToggleMusicVideo={onToggleMusicVideo}
            onAddThumbnail={onAddThumbnail}
            onRemoveThumbnail={onRemoveThumbnail}
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
                      dest === 'Music' ? 'bg-purple-500/20 text-purple-400' :
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
