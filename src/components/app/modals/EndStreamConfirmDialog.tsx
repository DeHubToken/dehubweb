/**
 * End Stream confirmation
 * =======================
 * Ending a broadcast is one-way — the ingest drops, the live card dies and a
 * browser broadcast that never aired has its post discarded. Every End Stream
 * control used to fire on a single tap, including a red pill sitting a few
 * pixels from the controls on a phone. This is the gate they all share.
 */

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
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="z-[10000]">
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to end the stream?</AlertDialogTitle>
          <AlertDialogDescription>
            Your broadcast stops for everyone watching and cannot be resumed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep streaming</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-500/90 text-white hover:bg-red-500"
          >
            End Stream
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
