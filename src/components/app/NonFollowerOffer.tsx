import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { useAuth } from '@/contexts/AuthContext';
import {
  DONE_SNOOZE_MS,
  NOT_NOW_SNOOZE_MS,
  snoozeNonFollowerOffer,
  subscribeNonFollowerOffer,
} from '@/lib/non-follower-streak';
import type { NonFollowerOfferStage } from './NonFollowerOfferSheet';

const NonFollowerOfferSheet = lazy(() => import('./NonFollowerOfferSheet'));

const POLL_MS = 1500;

/**
 * After two unfollows in a row of people who never followed back, offers to
 * unfollow everyone else who doesn't. Hidden when one or none are left.
 * The server does the unfollowing in the background; this polls its progress
 * and shows the result. Mounted at the App root next to <AvatarPrompt />.
 */
export function NonFollowerOffer() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<NonFollowerOfferStage>('offer');
  const [count, setCount] = useState(0);
  const [progress, setProgress] = useState({ done: 0, failed: 0 });
  const pollRef = useRef<number | null>(null);
  const openRef = useRef(false);
  openRef.current = open;

  const stopPolling = () => {
    if (pollRef.current) window.clearTimeout(pollRef.current);
    pollRef.current = null;
  };
  useEffect(() => stopPolling, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    return subscribeNonFollowerOffer(async () => {
      try {
        const { getNonFollowerCount } = await import('@/lib/api/dehub');
        const { count: n, job } = await getNonFollowerCount();
        if (job?.running || n < 2) return;
        setCount(n);
        setStage('offer');
        setProgress({ done: 0, failed: 0 });
        setShown(true);
        setOpen(true);
      } catch { /* the offer is a nicety; never surface its failure */ }
    });
  }, [isAuthenticated]);

  const finish = useCallback((done: number, failed: number) => {
    stopPolling();
    setProgress({ done, failed });
    setStage('done');
    snoozeNonFollowerOffer(DONE_SNOOZE_MS);
    // Sent to the background: the result arrives as a toast instead.
    if (!openRef.current) toast.success(i18n.t('follow.nonFollowers.doneToast', 'Unfollowed {{done}} accounts not following you back', { done }));
    // Counts, follow buttons and lists all changed under us.
    void queryClient.invalidateQueries({ queryKey: ['dehub-profile'] });
    void queryClient.invalidateQueries({ queryKey: ['user-follow-status'] });
    void queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0] ?? '').toLowerCase().includes('follow') });
  }, [queryClient]);

  const poll = useCallback(async () => {
    try {
      const { getUnfollowNonFollowersStatus } = await import('@/lib/api/dehub');
      const job = await getUnfollowNonFollowersStatus();
      if (!job) { finish(progress.done, progress.failed); return; }
      if (job.total) setCount(job.total);
      setProgress({ done: job.done, failed: job.failed });
      if (!job.running) { finish(job.done, job.failed); return; }
    } catch { /* keep polling; a blip should not end the job on screen */ }
    pollRef.current = window.setTimeout(() => void poll(), POLL_MS);
  }, [finish, progress.done, progress.failed]);

  const confirm = async () => {
    setStage('working');
    try {
      const { unfollowAllNonFollowers } = await import('@/lib/api/dehub');
      const job = await unfollowAllNonFollowers();
      if (job.total) setCount(job.total);
      if (!job.running) { finish(job.done, job.failed); return; }
      pollRef.current = window.setTimeout(() => void poll(), POLL_MS);
    } catch {
      setStage('error');
    }
  };

  const notNow = () => {
    snoozeNonFollowerOffer(NOT_NOW_SNOOZE_MS);
    setOpen(false);
  };

  const onOpenChange = (next: boolean) => {
    // Swiping the offer away counts as Not now.
    if (!next && (stage === 'offer' || stage === 'confirm')) snoozeNonFollowerOffer(NOT_NOW_SNOOZE_MS);
    setOpen(next);
  };

  if (!shown) return null;
  return (
    <Suspense fallback={null}>
      <NonFollowerOfferSheet
        open={open}
        onOpenChange={onOpenChange}
        stage={stage}
        count={count}
        done={progress.done}
        failed={progress.failed}
        onAsk={() => setStage('confirm')}
        onConfirm={() => void confirm()}
        onBack={() => setStage('offer')}
        onNotNow={notNow}
      />
    </Suspense>
  );
}
