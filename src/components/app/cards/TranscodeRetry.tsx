/**
 * What a creator sees on a post whose video could not be processed.
 *
 * The server keeps the file they uploaded when an encode fails, so the fix is
 * a button and not an errand: the same file goes back through the encoder
 * without them finding it again. Posts that failed before that archive existed
 * have nothing to retry from — the server says so in its refusal, and that
 * message is what the toast shows, because it is the only case where deleting
 * and re-uploading is still the answer.
 *
 * Shared by the feed/post card and the shorts carousel, which wrap it in their
 * own overlay boxes.
 */
import { useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { retryTranscode } from '@/lib/api/dehub/content';

interface TranscodeRetryProps {
  tokenId: number | string;
  /** Only the creator may retry, and only they are told there is a file kept. */
  isOwner: boolean;
}

export function TranscodeRetry({ tokenId, isOwner }: TranscodeRetryProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'sending' | 'queued'>('idle');

  const handleRetry = async () => {
    setState('sending');
    try {
      await retryTranscode(tokenId);
      // The post itself will move to 'pending' on the next feed read; until
      // then this stands in for it, so the button cannot be pressed twice.
      setState('queued');
      toast.success(t('videoPlayer.retryQueued'));
    } catch (error: any) {
      setState('idle');
      // The server's wording, not ours: it knows whether this is a post with
      // no stored file, one already processing, or something transient.
      toast.error(error?.message || t('videoPlayer.retryFailed'));
    }
  };

  if (state === 'queued') {
    return (
      <>
        <Loader2 className="w-7 h-7 text-white animate-spin" />
        <span className="text-white/80 text-xs font-medium tracking-wide drop-shadow">
          {t('videoPlayer.retryQueued')}
        </span>
      </>
    );
  }

  return (
    <>
      <div className="w-11 h-11 rounded-xl bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center">
        <AlertTriangle className="w-5 h-5 text-white/80" />
      </div>
      <span className="text-white/80 text-xs font-medium tracking-wide drop-shadow px-4 text-center">
        {t('videoPlayer.processingFailed')}
      </span>
      {isOwner && (
        <>
          <span className="text-white/60 text-[11px] tracking-wide drop-shadow px-6 text-center">
            {t('videoPlayer.retryHint')}
          </span>
          <button
            type="button"
            onClick={(e) => {
              // The overlay sits inside the card's tap layer, which opens the
              // post — without this the button navigates instead of retrying.
              e.stopPropagation();
              e.preventDefault();
              handleRetry();
            }}
            disabled={state === 'sending'}
            className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-60 border border-white/20 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-md transition-colors"
          >
            {state === 'sending' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            {state === 'sending' ? t('videoPlayer.retrying') : t('videoPlayer.retry')}
          </button>
        </>
      )}
    </>
  );
}
