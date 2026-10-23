import '@/styles/post-processing.css';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getNFTInfo } from '@/lib/api/dehub';
import { subscribeJobChannel } from '@/lib/api/dehub/job-socket';
import { setVideoProcessingStatus } from '@/hooks/use-video-processing-status';
import { usePostProcessingStore, type PostProcessingPhase } from '@/store/postProcessingStore';

const POLL_MS = 4_000;
const DONE_VISIBLE_MS = 6_000;
const FAILED_VISIBLE_MS = 10_000;

interface PostProcessingPillProps {
  phase: PostProcessingPhase;
  progress: number;
  thumbnail?: string;
  onPress?: () => void;
}

/** The pill itself, without the following — the state gallery draws it too. */
export function PostProcessingPill({ phase, progress, thumbnail, onPress }: PostProcessingPillProps) {
  const { t } = useTranslation();
  const percent = Math.max(0, Math.min(100, Math.round(progress)));
  const content = (
    <>
      <span data-pd-thumb aria-hidden>
        {thumbnail && <img src={thumbnail} alt="" />}
        <span data-pd-ring style={{ ['--pd-progress' as string]: `${phase === 'processing' ? percent : 100}%` }} />
      </span>
      {phase === 'processing' ? (
        <>
          <span data-pd-text>{t('postProcessing.preparingVideo')}</span>
          {percent > 0 && <span data-pd-percent>{percent}%</span>}
        </>
      ) : phase === 'done' ? (
        <span data-pd-text>
          {t('postProcessing.posted')} · <span data-pd-view>{t('postProcessing.view')}</span>
        </span>
      ) : (
        <span data-pd-text>{t('postProcessing.failed')}</span>
      )}
    </>
  );
  return onPress ? (
    <button type="button" data-processing-dock data-phase={phase} onClick={onPress} aria-live="polite">
      {content}
    </button>
  ) : (
    <div data-processing-dock data-phase={phase} role="status" aria-live="polite">
      {content}
    </div>
  );
}

/**
 * Follows a just-published video through its transcode: the token's socket
 * channel for the instant answer, and nft_info every few seconds in case the
 * socket is down or the event was missed. The home feed is refreshed when the
 * post lands and again when it becomes playable, so the card swaps in on its
 * own.
 */
export default function PostProcessingDock() {
  const job = usePostProcessingStore((s) => s.job);
  const update = usePostProcessingStore((s) => s.update);
  const dismiss = usePostProcessingStore((s) => s.dismiss);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const tokenId = job?.tokenId;
  const phase = job?.phase;

  // Refresh the feed the moment the post exists, and again once it plays.
  useEffect(() => {
    if (!tokenId || phase === 'failed') return;
    if (phase === 'done') setVideoProcessingStatus(queryClient, tokenId, 'done');
    void queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
    void queryClient.invalidateQueries({ queryKey: ['dehub-feed'] });
  }, [tokenId, phase, queryClient]);

  useEffect(() => {
    if (!tokenId || phase !== 'processing') return;
    let stopped = false;
    const unsubscribe = subscribeJobChannel(tokenId, (event) => {
      if (event.stage === 'done') update(tokenId, { phase: 'done', progress: 100 });
      else if (event.stage === 'failed') update(tokenId, { phase: 'failed' });
      else if (typeof event.progress === 'number') update(tokenId, { progress: event.progress });
    });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      timer = null;
      try {
        const post = await getNFTInfo(tokenId);
        if (stopped) return;
        if (post.transcodingStatus === 'done') return update(tokenId, { phase: 'done', progress: 100 });
        if (post.transcodingStatus === 'failed') return update(tokenId, { phase: 'failed' });
      } catch {
        // Try again on the next tick.
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => {
      stopped = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [tokenId, phase, update]);

  useEffect(() => {
    if (!tokenId || phase === 'processing') return;
    if (phase === 'failed') setVideoProcessingStatus(queryClient, tokenId, 'failed');
    const timer = setTimeout(() => dismiss(tokenId), phase === 'done' ? DONE_VISIBLE_MS : FAILED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [tokenId, phase, dismiss, queryClient]);

  if (!job) return null;
  const onPress = job.phase === 'done'
    ? () => { dismiss(job.tokenId); navigate(`/app/post/${job.tokenId}`); }
    : job.phase === 'failed' ? () => dismiss(job.tokenId) : undefined;

  return (
    <div data-processing-dock-anchor>
      <PostProcessingPill phase={job.phase} progress={job.progress} thumbnail={job.thumbnail} onPress={onPress} />
    </div>
  );
}
