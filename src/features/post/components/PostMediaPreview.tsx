import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MediaFile } from '../types';

interface PostMediaPreviewProps {
  media: MediaFile[];
  onRemove: (index: number) => void;
}

export function PostMediaPreview({ media, onRemove }: PostMediaPreviewProps) {
  if (media.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="mt-2 grid gap-2"
        style={{
          gridTemplateColumns: media.length === 1 ? '1fr' : 'repeat(2, 1fr)',
        }}
      >
        {media.map((m, index) => (
          <div key={index} className="relative rounded-xl overflow-hidden bg-zinc-900">
            {m.type === 'image' ? (
              <img src={m.preview} alt="" className="w-full h-32 object-cover" />
            ) : (
              <div className="relative">
                <video src={m.preview} className="w-full h-32 object-cover" />
                {m.duration && (
                  <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-0.5 rounded text-xs text-white">
                    {Math.floor(m.duration / 60)}:{String(Math.floor(m.duration % 60)).padStart(2, '0')}
                    {m.duration < 90 && <span className="ml-1 text-emerald-400">• Short</span>}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => onRemove(index)}
              className="absolute top-2 right-2 p-1 bg-black/70 hover:bg-black rounded-full transition-colors"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}
