import X from "@/components/ui/cut-icons/close";

import { motion } from 'framer-motion';
import type { LinkPreviewData } from '@/lib/api/link-preview';
import { LinkPreviewContent } from '@/components/app/cards/LinkPreviewContent';
import { RichLinkCard } from '@/components/app/cards/RichLinkCardLazy';

interface LinkPreviewCardProps {
  preview: LinkPreviewData;
  onRemove: () => void;
}

export function LinkPreviewCard({ preview, onRemove }: LinkPreviewCardProps) {
  if (preview.rich) return <RichLinkCard preview={{ ...preview, rich: preview.rich }} onRemove={onRemove} />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="relative group bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:bg-white/10 transition-colors cursor-pointer"
      onClick={() => window.open(preview.url, '_blank', 'noopener,noreferrer')}
    >
      <LinkPreviewContent key={preview.url} preview={preview} composer />

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-2 right-2 p-1.5 bg-black/40 backdrop-blur-[24px] backdrop-saturate-[180%] border border-white/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
      >
        <X className="w-3.5 h-3.5 text-white" />
      </button>
    </motion.div>
  );
}
