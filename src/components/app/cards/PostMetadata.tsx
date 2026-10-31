import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Post Metadata Component
 * =======================
 * Displays timestamp, view count, and optional translate control below post content.
 */

import { lazy, Suspense, useState } from 'react';
import { watchedLabel } from '@/i18n/watched-label';
import Stats from "@/components/ui/cut-icons/stats";
import { Headphones, RotateCcw, Loader2 } from "lucide-react";
import Eye from "@/components/ui/cut-icons/visibility";
import Clock from "@/components/ui/cut-icons/clock";
import Languages from "@/components/ui/cut-icons/language";

import { useTranslation } from 'react-i18next';
import { formatTimeAgo } from '@/lib/feed-utils';
import { LANGUAGE_NAMES } from '@/hooks/use-user-language';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useBoostedPost } from './boosted-post';

const PostStatsSheet = lazy(() => import('@/components/app/post-stats/PostStatsSheet'));

interface PostMetadataProps {
  className?: string;
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
  /** The viewer has played this video before: append to its view count. */
  watched?: boolean;
  /** The viewer made this post: the view count opens its stats. */
  isOwnPost?: boolean;
}

export function PostMetadata({ className, timestamp, viewCount, tokenId, isAd, isAudio, translateControl, watched, isOwnPost }: PostMetadataProps) {
  const [statsOpen, setStatsOpen] = useState(false);
  const canOpenStats = !!isOwnPost && !isAd && tokenId != null && /^\d+$/.test(String(tokenId));
  const { t: _copy } = _useCopy();
  const { t, i18n } = useTranslation();
  const boosted = useBoostedPost();
  const navigate = useNavigate();

  // Format timestamp - if it's an ISO string, convert to relative time
  const formattedTimestamp = timestamp ? (
    timestamp.includes('T') || timestamp.includes('-') 
      ? formatTimeAgo(timestamp) 
      : timestamp
  ) : undefined;

  const displayedCount = typeof viewCount === 'string' ? viewCount.replace(/\s+views?$/i, '') : viewCount;
  const hasViews = viewCount !== undefined && viewCount !== null;
  const hasMetadata = formattedTimestamp || hasViews;

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
        aria-label={_copy("copy.2f45e002d1d8", { defaultValue: "Translate this post" })}
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

  if (!hasMetadata && !translateControl && !isAd && !boosted) return null;

  return (
    <div data-post-metadata className={cn("flex items-center gap-x-3 gap-y-1 text-zinc-500 text-xs flex-wrap", className)}>
      {isAd && (
        <span className="px-1.5 py-0.5 bg-yellow-500 text-black text-xs font-bold rounded">{_copy("copy.c7bf4bbdbcd8", { defaultValue: "AD" })}</span>
      )}
      {formattedTimestamp && (
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>{formattedTimestamp}</span>
        </span>
      )}
      {boosted && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); navigate('/app/superpowers'); }}
          className="uppercase tracking-wider text-[11px] text-white/80 hover:text-white transition-colors"
        >
          {_copy("copy.c1f1c8819e33", { defaultValue: "Boosted" })}
        </button>
      )}
      {hasViews && (canOpenStats ? (
        <button
          type="button"
          data-post-stats-trigger
          data-no-navigate
          onClick={(e) => { e.stopPropagation(); setStatsOpen(true); }}
          aria-label={t('postStats.open', 'See how your post is doing')}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 -my-0.5 bg-white/10 text-white/80 hover:text-white hover:bg-white/15 transition-colors"
        >
          {isAudio ? <Headphones className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          <span className="tabular-nums">{displayedCount}</span>
          <Stats aria-hidden="true" className="w-3 h-3" />
        </button>
      ) : (
        <span className="flex items-center gap-1">
          {isAudio ? <Headphones className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          <span className="tabular-nums">{displayedCount}{watched ? watchedLabel(i18n.resolvedLanguage ?? i18n.language) : ''}</span>
        </span>
      ))}
      {canOpenStats && statsOpen ? (
        <Suspense fallback={null}>
          <PostStatsSheet open={statsOpen} onOpenChange={setStatsOpen} tokenId={tokenId!} />
        </Suspense>
      ) : null}
      {renderTranslateControl()}
    </div>
  );
}
