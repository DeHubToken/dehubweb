import { useTranslation } from 'react-i18next';
import Unfollow from '@/components/ui/cut-icons/unfollow';
import Check from '@/components/ui/cut-icons/check';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';

export type NonFollowerOfferStage = 'offer' | 'confirm' | 'working' | 'done' | 'error';

interface NonFollowerOfferSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: NonFollowerOfferStage;
  /** People you follow who do not follow you back. */
  count: number;
  done?: number;
  failed?: number;
  onAsk: () => void;
  onConfirm: () => void;
  onBack: () => void;
  onNotNow: () => void;
}

/**
 * "Unfollow all N accounts not following you back": offer, a second tap to
 * confirm, progress while the server works through them, then the result.
 * Drawer on phone widths, dialog on desktop.
 */
export function NonFollowerOfferSheet({ open, onOpenChange, stage, count, done = 0, failed = 0, onAsk, onConfirm, onBack, onNotNow }: NonFollowerOfferSheetProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const title = stage === 'done'
    ? t('follow.nonFollowers.doneTitle', 'All cleared')
    : stage === 'confirm'
      ? t('follow.nonFollowers.confirmTitle', 'Unfollow {{count}} accounts?', { count })
      : t('follow.nonFollowers.title', 'Clean up who you follow?');

  const body = stage === 'done'
    ? (failed > 0
      ? t('follow.nonFollowers.doneSome', 'Unfollowed {{done}} accounts. {{failed}} could not be unfollowed.', { done, failed })
      : t('follow.nonFollowers.doneAll', 'Unfollowed {{done}} accounts that were not following you back.', { done }))
    : stage === 'working'
      ? t('follow.nonFollowers.working', 'Unfollowing {{done}} of {{total}}...', { done, total: count })
      : stage === 'error'
        ? t('follow.nonFollowers.failed', 'Could not start. Try again in a minute.')
        : stage === 'confirm'
          ? t('follow.nonFollowers.confirmBody', 'They will not be told. You can follow anyone again later.')
          : t('follow.nonFollowers.body', '{{count}} accounts you follow do not follow you back.', { count });

  const progress = count > 0 ? Math.min(100, Math.round(((done + failed) / count) * 100)) : 0;

  const content = (
    <div data-non-follower-offer={stage} className="flex flex-col items-center gap-5 px-5 pb-6 pt-2 text-center">
      <span data-non-follower-icon className="mt-2 flex h-20 w-20 items-center justify-center rounded-[22px] border border-white/15 bg-white/[0.08] text-white">
        {stage === 'done' ? <Check className="h-9 w-9" /> : <Unfollow className="h-9 w-9" />}
      </span>
      {stage === 'offer' && (
        <span data-non-follower-count className="-mt-1 text-4xl font-semibold tabular-nums text-white">{count}</span>
      )}
      <p className="max-w-xs text-sm text-zinc-400" aria-live="polite">{body}</p>
      {stage === 'working' && (
        <div data-non-follower-progress className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-white/80 transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="flex w-full flex-col gap-2">
        {stage === 'offer' && (
          <>
            <Button size="lg" className="w-full rounded-full" onClick={onAsk}>
              {t('follow.nonFollowers.cta', 'Unfollow all {{count}}', { count })}
            </Button>
            <Button variant="ghost" className="w-full rounded-full" onClick={onNotNow}>
              {t('follow.nonFollowers.notNow', 'Not now')}
            </Button>
          </>
        )}
        {stage === 'confirm' && (
          <>
            <Button size="lg" variant="destructive" data-non-follower-confirm className="w-full rounded-full" onClick={onConfirm}>
              {t('follow.nonFollowers.confirm', 'Yes, unfollow {{count}}', { count })}
            </Button>
            <Button variant="ghost" className="w-full rounded-full" onClick={onBack}>
              {t('follow.nonFollowers.cancel', 'Cancel')}
            </Button>
          </>
        )}
        {stage === 'working' && (
          <Button variant="ghost" className="w-full rounded-full" onClick={() => onOpenChange(false)}>
            {t('follow.nonFollowers.background', 'Keep going in the background')}
          </Button>
        )}
        {stage === 'error' && (
          <>
            <Button size="lg" className="w-full rounded-full" onClick={onConfirm}>
              {t('follow.tryAgain', 'Try again')}
            </Button>
            <Button variant="ghost" className="w-full rounded-full" onClick={() => onOpenChange(false)}>
              {t('follow.nonFollowers.close', 'Close')}
            </Button>
          </>
        )}
        {stage === 'done' && (
          <Button size="lg" className="w-full rounded-full" onClick={() => onOpenChange(false)}>
            {t('follow.nonFollowers.close', 'Close')}
          </Button>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent data-non-follower-sheet glass>
          <DrawerTitle className="px-5 pt-5 text-center text-lg font-semibold text-white">{title}</DrawerTitle>
          <DrawerDescription className="sr-only">{body}</DrawerDescription>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-non-follower-sheet className="max-w-sm border border-white/10 bg-black/40 shadow-2xl backdrop-blur-2xl">
        <DialogTitle className="pt-2 text-center text-lg font-semibold text-white">{title}</DialogTitle>
        <DialogDescription className="sr-only">{body}</DialogDescription>
        {content}
      </DialogContent>
    </Dialog>
  );
}

export default NonFollowerOfferSheet;
