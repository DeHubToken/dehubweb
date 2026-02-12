/**
 * Post Metadata Component
 * =======================
 * Displays timestamp, view count, and optional translate control below post content.
 */

import { Eye, RotateCcw, Loader2 } from 'lucide-react';
import translateGlobeIcon from '@/assets/icons/translate-globe-icon.png';
import { formatTimeAgo } from '@/lib/feed-utils';
import { cn } from '@/lib/utils';

interface PostMetadataProps {
  timestamp?: string;
  viewCount?: string | number;
  /** On-demand translation control */
  translateControl?: {
    isTranslated: boolean;
    isLoading: boolean;
    error: string | null;
    onTranslate: () => void;
    onShowOriginal: () => void;
  };
}

export function PostMetadata({ timestamp, viewCount, translateControl }: PostMetadataProps) {
  // Format timestamp - if it's an ISO string, convert to relative time
  const formattedTimestamp = timestamp ? (
    timestamp.includes('T') || timestamp.includes('-') 
      ? formatTimeAgo(timestamp) 
      : timestamp
  ) : undefined;

  const hasMetadata = formattedTimestamp || viewCount;

  const renderTranslateControl = () => {
    if (!translateControl) return null;

    if (translateControl.isTranslated) {
      return (
        <button
          onClick={translateControl.onShowOriginal}
          className="flex items-center gap-1 text-white hover:text-zinc-300 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Show original</span>
        </button>
      );
    }

    return (
      <button
        onClick={translateControl.onTranslate}
        disabled={translateControl.isLoading}
        className={cn(
          "flex items-center gap-1 transition-colors",
          translateControl.error 
            ? "text-red-400" 
            : "text-zinc-500 hover:text-zinc-300"
        )}
      >
        {translateControl.isLoading ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Translating...</span>
          </>
        ) : translateControl.error ? (
          <span>{translateControl.error}</span>
        ) : (
          <img src={translateGlobeIcon} alt="Translate" className="w-4 h-4 opacity-50 brightness-200 invert" />
        )}
      </button>
    );
  };

  if (!hasMetadata && !translateControl) return null;

  return (
    <div className="flex items-center gap-2 text-zinc-500 text-xs flex-wrap">
      {formattedTimestamp && <span>{formattedTimestamp}</span>}
      {formattedTimestamp && viewCount && <span>•</span>}
      {viewCount && (
        <span className="flex items-center gap-1">
          <Eye className="w-3 h-3" />
          {viewCount}
        </span>
      )}
      {hasMetadata && translateControl && <span>•</span>}
      {renderTranslateControl()}
    </div>
  );
}
