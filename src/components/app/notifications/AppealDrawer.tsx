/**
 * Appeal a moderation decision.
 *
 * The notification that opens this already says what was removed and why. What
 * it used to end with was a line asking the creator to email support — no
 * reference, no record, and no way to know whether anyone read it. This files
 * the appeal against that specific decision and hands back a reference number.
 *
 * @module components/app/notifications/AppealDrawer
 */

import { useEffect, useState } from 'react';
import { Loader2, Scale } from 'lucide-react';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { appealModerationDecision } from '@/lib/api/dehub';

const MIN_REASON = 20;
const MAX_REASON = 4000;

interface AppealDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notificationId: string;
  /** What the decision was about, shown back so the appeal is unambiguous. */
  subject?: string;
  onFiled?: (ref: string) => void;
}

export function AppealDrawer({
  open,
  onOpenChange,
  notificationId,
  subject,
  onFiled,
}: AppealDrawerProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // A fresh drawer is a fresh appeal — keeping the last draft would file it
  // against whichever decision was opened next.
  useEffect(() => {
    if (!open) {
      setReason('');
      setIsSubmitting(false);
    }
  }, [open]);

  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= MIN_REASON && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const result = await appealModerationDecision({ notificationId, reason: trimmed });
      toast.success(
        result.duplicateOf
          ? `You have already appealed this — reference ${result.duplicateOf}`
          : `Appeal filed — reference ${result.ref}`,
      );
      onFiled?.(result.ref);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not file that appeal');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2 text-white">
            <Scale className="w-5 h-5" />
            Appeal this decision
          </DrawerTitle>
          <DrawerDescription className="text-zinc-400">
            {subject
              ? `A person will read this and look again at ${subject}.`
              : 'A person will read this and look at the decision again.'}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-3" data-vaul-no-drag>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={MAX_REASON}
            placeholder="What do you think was missed? Context about the content helps more than anything else."
            className="bg-white/5 border-white/10 text-white min-h-[140px] rounded-xl resize-none"
          />
          <p className="text-xs text-zinc-500 text-right">
            {trimmed.length < MIN_REASON
              ? `${MIN_REASON - trimmed.length} more characters`
              : `${reason.length}/${MAX_REASON}`}
          </p>

          <div className="flex gap-3 pt-1">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="flex-1 text-zinc-400 hover:text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit} variant="glass" className="flex-1">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Send appeal
            </Button>
          </div>

          <p className="text-[11px] text-zinc-500">
            You get a reference number, and the answer comes back here. One appeal per decision —
            sending again shows you the first one.
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
