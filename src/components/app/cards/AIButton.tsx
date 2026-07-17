/**
 * AI Button Component
 * ===================
 * Floating AI button for post thumbnails.
 * Uses CSS hover instead of framer-motion for performance.
 */

import { Sparkles } from 'lucide-react';

interface AIButtonProps {
  onClick: () => void;
}

export function AIButton({ onClick }: AIButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute top-2 right-2 z-10 w-8 h-8 rounded-xl bg-black/60 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white hover:bg-black/80 hover:border-white/40 hover:scale-110 active:scale-95 transition-all"
      aria-label="Ask AI about this post"
    >
      <Sparkles className="w-4 h-4" />
    </button>
  );
}
