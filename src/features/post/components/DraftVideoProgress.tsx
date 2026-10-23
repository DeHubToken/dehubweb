import '@/styles/post-processing.css';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { DraftVideoSnapshot } from '../lib/draft-video';

/**
 * The attached video's early upload, under its preview: bytes first, then
 * the server's transcode, then ready. Purely informative — Post never waits
 * on it here; handlePost picks up wherever it has got to.
 *
 * Renders nothing once the draft has fallen back to the old flow, since there
 * is then nothing in progress to report.
 */
export function DraftVideoProgress({ draft }: { draft: DraftVideoSnapshot | null | undefined }) {
  const { t } = useTranslation();
  if (!draft || draft.phase === 'failed' || draft.phase === 'unavailable') return null;

  const percent = draft.phase === 'uploading'
    ? draft.uploadPercent
    : draft.phase === 'processing' ? draft.processPercent : 100;
  const label = draft.phase === 'uploading'
    ? t('postProcessing.uploading')
    : draft.phase === 'processing' ? t('postProcessing.preparing') : t('postProcessing.ready');

  return (
    <div
      data-video-progress
      data-phase={draft.phase}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="w-[280px] sm:w-[320px] md:w-[380px]"
    >
      <div data-vp-track>
        <div data-vp-fill style={{ width: `${percent}%` }} />
      </div>
      <div data-vp-row>
        <span data-vp-label>
          {label}
          {draft.phase === 'ready' && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
        </span>
        <span data-vp-percent>{percent}%</span>
      </div>
    </div>
  );
}
