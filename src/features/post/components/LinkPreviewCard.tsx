import { X, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import type { LinkPreviewData } from '@/lib/api/link-preview';

interface LinkPreviewCardProps {
  preview: LinkPreviewData;
  onRemove: () => void;
}

export function LinkPreviewCard({ preview, onRemove }: LinkPreviewCardProps) {
  const domain = new URL(preview.url).hostname.replace('www.', '');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="relative group bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:bg-white/10 transition-colors cursor-pointer"
      onClick={() => window.open(preview.url, '_blank', 'noopener,noreferrer')}
    >
      <div className="flex">
        {/* Image */}
        {preview.image && (
          <div className="w-32 h-24 flex-shrink-0 bg-white/5">
            <img
              src={preview.image}
              alt={preview.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 p-3 min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-white/50 mb-1">
            <ExternalLink className="w-3 h-3" />
            <span className="truncate">{preview.siteName || domain}</span>
          </div>
          <h4 className="text-sm font-medium text-white line-clamp-1 mb-0.5">
            {preview.title}
          </h4>
          {preview.description && (
            <p className="text-xs text-white/60 line-clamp-2">
              {preview.description}
            </p>
          )}
        </div>
      </div>

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-2 right-2 p-1.5 bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
      >
        <X className="w-3.5 h-3.5 text-white" />
      </button>
    </motion.div>
  );
}
