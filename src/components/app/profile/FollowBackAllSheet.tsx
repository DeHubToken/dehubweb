import { useTranslation } from 'react-i18next';
import UserPlus from '@/components/ui/cut-icons/add-account';
import Check from '@/components/ui/cut-icons/check';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type FollowBackAllStage = 'confirm' | 'working' | 'done' | 'failed';

interface FollowBackAllSheetProps {
  stage: FollowBackAllStage;
  /** Followers you don't follow yet. */
  count: number;
  completed: number;
  followed: number;
  failed: number;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * The small sheet "Follow back all" raises on phones: how many people, a tap to
 * confirm, progress, then a tick. It slides up inside the followers drawer
 * rather than opening a second vaul drawer, which would fight the open one for
 * focus and drag. Desktop uses it too, centred in the panel: a toast sat
 * outside the drawer, where its buttons could not be clicked.
 *
 * It never leaves on its own: every stage has a button, the result stays up
 * until it is tapped away, and a failure says so here with Try again. Closing
 * it mid-run only hides it; the follows carry on. data-vaul-no-drag keeps a
 * tap that wobbles from being read as a drag on the drawer underneath.
 */
export function FollowBackAllSheet({ stage, count, completed, followed, failed, onConfirm, onClose }: FollowBackAllSheetProps) {
  const { t } = useTranslation();

  const title = stage === 'done'
    ? t('follow.followedBackCount', { count: followed, defaultValue: 'Followed back {{count}} people' })
    : stage === 'failed'
      ? t('follow.followBackAllFailed', 'Could not follow anyone back')
      : t('follow.followBackConfirmTitle', { count, defaultValue: 'Follow back {{count}} people?' });

  const body = stage === 'failed'
    ? t('follow.followBackConfirmBody', 'They already follow you. Private accounts get a follow request.')
    : stage === 'done'
    ? (failed > 0
      ? t('follow.followedBackSome', { defaultValue: 'Followed back {{followed}} people; {{failed}} failed', followed, failed })
      : t('follow.followBackDoneBody', 'They will see you in their followers.'))
    : stage === 'working'
      ? t('follow.followingBackProgress', { defaultValue: 'Following back {{completed}} of {{total}}', completed, total: count })
      : t('follow.followBackConfirmBody', 'They already follow you. Private accounts get a follow request.');

  const progress = count > 0 ? Math.min(100, Math.round((completed / count) * 100)) : 0;

  return (
    <div data-follow-back-sheet={stage} data-vaul-no-drag className="absolute inset-0 z-30 flex flex-col justify-end md:justify-center">
      <button
        type="button"
        aria-label={t('follow.followBackNotNow', 'Not now')}
        className="absolute inset-0 bg-black/45 animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="follow-back-sheet-title"
        className="relative mx-2 mb-2 md:mx-auto md:mb-0 md:w-full md:max-w-sm flex flex-col items-center gap-4 rounded-[28px] border border-white/10 bg-zinc-950/85 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 text-center shadow-2xl backdrop-blur-2xl animate-in slide-in-from-bottom-8 fade-in duration-300"
      >
        <span aria-hidden className="h-1 w-9 rounded-full bg-white/25 md:hidden" />
        <span
          data-follow-back-icon
          className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-white/15 bg-white/[0.08] text-white"
        >
          {stage === 'working'
            ? <Loader2 className="h-7 w-7 animate-spin" />
            : stage === 'done'
            ? <Check className="h-8 w-8 animate-in zoom-in-50 duration-300" />
            : <UserPlus className="h-8 w-8" />}
        </span>
        <h3 id="follow-back-sheet-title" className="text-lg font-semibold text-white">{title}</h3>
        <p className="-mt-2 max-w-xs text-sm text-zinc-400" aria-live="polite">{body}</p>
        {stage === 'working' && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-white/80 transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
        )}
        <div className="flex w-full flex-col gap-1.5">
          {stage === 'confirm' && (
            <>
              <Button size="lg" data-follow-back-confirm className="w-full rounded-full" onClick={onConfirm}>
                {t('follow.followBackConfirm', 'Follow back')}
              </Button>
              <Button variant="ghost" className="w-full rounded-full" onClick={onClose}>
                {t('follow.followBackNotNow', 'Not now')}
              </Button>
            </>
          )}
          {stage === 'working' && (
            <Button variant="ghost" data-follow-back-hide className="w-full rounded-full" onClick={onClose}>
              {t('common.close', 'Close')}
            </Button>
          )}
          {stage === 'failed' && (
            <>
              <Button size="lg" data-follow-back-retry className="w-full rounded-full" onClick={onConfirm}>
                {t('common.tryAgain', 'Try again')}
              </Button>
              <Button variant="ghost" className="w-full rounded-full" onClick={onClose}>
                {t('common.close', 'Close')}
              </Button>
            </>
          )}
          {stage === 'done' && (
            <Button size="lg" className="w-full rounded-full" onClick={onClose}>
              {t('follow.followBackDone', 'Done')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface FollowBackAllButtonProps {
  onClick: () => void;
  /** Counting who is left to follow back. */
  finding: boolean;
  /** Following them back. */
  working: boolean;
  completed: number;
  total: number;
  /** Play the arrival shake. Ignored under reduced motion. */
  nudge: boolean;
  onNudgeEnd: () => void;
}

/** The white "Follow back all" bar at the top of your own followers list. */
export function FollowBackAllButton({ onClick, finding, working, completed, total, nudge, onNudgeEnd }: FollowBackAllButtonProps) {
  const { t } = useTranslation();
  return (
    <Button
      data-follow-back-all
      onClick={onClick}
      disabled={working || finding}
      onAnimationEnd={onNudgeEnd}
      className={cn(
        'w-full h-10 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 disabled:bg-white/15 disabled:text-zinc-400',
        nudge && 'motion-safe:animate-follow-back-nudge',
      )}
    >
      {working || finding ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          {working && total > 0
            ? t('follow.followingBackProgress', { defaultValue: 'Following back {{completed}} of {{total}}', completed, total })
            : t('follow.findingFollowers', 'Finding followers...')}
        </>
      ) : (
        <>
          <UserPlus className="w-4 h-4 mr-2" />
          {t('follow.followBackAll', 'Follow back all')}
        </>
      )}
    </Button>
  );
}

export default FollowBackAllSheet;
