/**
 * AI Button Component
 * ===================
 * Floating AI button for post thumbnails.
 */

import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface AIButtonProps {
  onClick: () => void;
}

export function AIButton({ onClick }: AIButtonProps) {
  return (
    <motion.button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white hover:bg-black/80 hover:border-white/40 transition-all"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      aria-label="Ask AI about this post"
    >
      <Sparkles className="w-4 h-4" />
    </motion.button>
  );
}
