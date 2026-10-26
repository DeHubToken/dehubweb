/**
 * Clip: the viewer's button on a live stream and its replay.
 *
 * Live, it asks the function to grab the last minute; on a replay it opens the
 * editor around where the viewer is watching (`getReplayTime`). Signed-out
 * viewers are sent to log in first — a clip is posted from their account.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Scissors from '@/components/ui/cut-icons/trim';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { captureLiveClip, type LiveClip } from '@/lib/api/live-clips';
import { ClipEditorSheet } from './ClipEditorSheet';

interface Props {
  tokenId: string | number;
  /** Seconds into the replay, or undefined while live. */
  getReplayTime?: () => number | undefined;
  className?: string;
  iconClassName?: string;
  /** Write "Clip" next to the icon. */
  withLabel?: boolean;
}

export function ClipButton({ tokenId, getReplayTime, className, iconClassName, withLabel }: Props) {
  const { t } = useTranslation();
  const { isAuthenticated, openLoginModal } = useAuth();
  const [open, setOpen] = useState(false);
  const [clip, setClip] = useState<LiveClip | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    if (busy) return;
    setBusy(true);
    setClip(null);
    setOpen(true);
    try {
      setClip(await captureLiveClip(tokenId, getReplayTime?.()));
    } catch (e) {
      setOpen(false);
      toast.error((e as Error).message || t('liveClips.failed', 'This clip could not be made.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={start}
        aria-label={t('liveClips.button', 'Clip this moment')}
        title={t('liveClips.button', 'Clip this moment')}
        className={cn('inline-flex items-center justify-center', className)}
      >
        <Scissors className={cn('h-5 w-5', iconClassName)} />
        {withLabel && <span>{t('liveClips.title', 'Clip')}</span>}
      </button>
      <ClipEditorSheet clip={clip} open={open} onOpenChange={setOpen} />
    </>
  );
}
