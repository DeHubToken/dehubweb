/**
 * Post Metadata Component
 * =======================
 * Displays timestamp, view count, and optional translate control below post content.
 */

import { Eye, Headphones, RotateCcw, Loader2, Languages } from 'lucide-react';
import { formatTimeAgo } from '@/lib/feed-utils';
import { cn } from '@/lib/utils';

interface PostMetadataProps {
  timestamp?: string;
  viewCount?: string | number;
  /** Whether this is an ad/sponsored post */
  isAd?: boolean;
  /** On-demand translation control */
  translateControl?: {
    isTranslated: boolean;
    isLoading: boolean;
    error: string | null;
    onTranslate: () => void;
    onShowOriginal: () => void;
  };
}

export function PostMetadata({ timestamp, viewCount, isAd, translateControl }: PostMetadataProps) {
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
          <Languages className="w-4 h-4" />
        )}
      </button>
    );
  };

  if (!hasMetadata && !translateControl && !isAd) return null;

  return (
    <div className="flex items-center gap-2 text-zinc-500 text-xs flex-wrap">
      {isAd && (
        <span className="px-1.5 py-0.5 bg-yellow-500 text-black text-xs font-bold rounded">
          AD
        </span>
      )}
      {isAd && hasMetadata && <span>•</span>}
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
