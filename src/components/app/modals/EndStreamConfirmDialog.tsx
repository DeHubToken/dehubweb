/**
 * End Stream confirmation
 * =======================
 * Ending a broadcast is one-way — the ingest drops, the live card dies and a
 * browser broadcast that never aired has its post discarded. Every End Stream
 * control used to fire on a single tap, including a red pill sitting a few
 * pixels from the controls on a phone. This is the gate they all share.
 */

import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function EndStreamConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="z-[10000]">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('goLive.endStreamConfirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('goLive.endStreamConfirmBody')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('goLive.keepStreaming')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-500/90 text-white hover:bg-red-500"
          >
            {t('goLive.endStream')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
