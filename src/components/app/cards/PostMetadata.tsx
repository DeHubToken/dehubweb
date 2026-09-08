/**
 * Post Metadata Component
 * =======================
 * Displays timestamp, view count, and optional translate control below post content.
 */

import { Eye, Headphones, RotateCcw, Loader2, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatTimeAgo } from '@/lib/feed-utils';
import { LANGUAGE_NAMES } from '@/hooks/use-user-language';
import { cn } from '@/lib/utils';

interface PostMetadataProps {
  timestamp?: string;
  /** Already includes signed-out viewers — the API serves one total. */
  viewCount?: string | number;
  /** Post token id. */
  tokenId?: string | number;
  /** Whether this is an ad/sponsored post */
  isAd?: boolean;
  /** Whether this is an audio post (shows "listens" instead of "views") */
  isAudio?: boolean;
  /** On-demand translation control */
  translateControl?: {
    isTranslated: boolean;
    isLoading: boolean;
    error: string | null;
    onTranslate: () => void;
    onShowOriginal: () => void;
    /** ISO code the post was detected as, known once a translation came back. */
    sourceLang?: string | null;
  };
}

export function PostMetadata({ timestamp, viewCount, tokenId, isAd, isAudio, translateControl }: PostMetadataProps) {
  const { t } = useTranslation();

  // Format timestamp - if it's an ISO string, convert to relative time
  const formattedTimestamp = timestamp ? (
    timestamp.includes('T') || timestamp.includes('-') 
      ? formatTimeAgo(timestamp) 
      : timestamp
  ) : undefined;

  const hasMetadata = formattedTimestamp || viewCount;

  const renderTranslateControl = () => {
    if (!translateControl) return null;

    // The language the post is actually written in. Only known once a
    // translation has come back, so until then the control is just the icon.
    const { sourceLang } = translateControl;
    const sourceLangName =
      sourceLang && !['unknown', 'auto', 'und'].includes(sourceLang)
        ? LANGUAGE_NAMES[sourceLang]
        : undefined;

    if (translateControl.isTranslated) {
      return (
        <button
          onClick={translateControl.onShowOriginal}
          className="flex items-center gap-1 text-white hover:text-zinc-300 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          <span>{t('common.showOriginal')}</span>
        </button>
      );
    }

    return (
      <button
        onClick={translateControl.onTranslate}
        disabled={translateControl.isLoading}
        aria-label="Translate this post"
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
            <span>{t('common.translating')}</span>
          </>
        ) : translateControl.error ? (
          <span>{translateControl.error}</span>
        ) : (
          <>
            <Languages className="w-4 h-4" />
            {/* Back on the original after "show original": name the language it
                is in, so the button reads as an offer rather than a mystery. */}
            {sourceLangName && <span>{sourceLangName}</span>}
          </>
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
          {isAudio ? <Headphones className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {viewCount}
        </span>
      )}
      {hasMetadata && translateControl && <span>•</span>}
      {renderTranslateControl()}
    </div>
  );
}
