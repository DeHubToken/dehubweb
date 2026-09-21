/**
 * Common Ground sheet
 * ===================
 * The creator turned Common Ground mode on for this post, so a reply goes
 * through three short steps before it is sent:
 *
 *   1. the strongest point on the other side, in one sentence
 *   2. what the two sides actually agree on
 *   3. a reminder about all-or-nothing thinking, and that shouting settles
 *      nothing
 *
 * then one last look at the draft with the coach's suggestions inline, and a
 * Post button. The two answers are private reflection: they never leave the
 * device and are not attached to the comment.
 *
 * Dialog on desktop, drawer on phone widths — the same split GeneralAIChat
 * uses. Completion is remembered per thread for the session by the caller.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Handshake, Scale, MessageCircleWarning } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCoachEnabled } from '@/hooks/use-coach-enabled';
import { useConversationCoach } from '@/hooks/use-conversation-coach';
import { CoachSuggestions } from './CoachSuggestions';
import { cn } from '@/lib/utils';

/** Each reflection has to be at least this long to count. */
export const COMMON_GROUND_MIN_CHARS = 10;

interface CommonGroundSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The reply about to be posted; reviewed in the last step, never edited here. */
  draft: string;
  /** The caller posts the reply and closes the sheet. */
  onConfirm: () => void;
}

const FIELD_CLASS =
  'min-h-[88px] bg-white/[0.04] border-white/[0.12] text-white text-sm placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-white/30 resize-none';

export function CommonGroundSheet({ open, onOpenChange, draft, onConfirm }: CommonGroundSheetProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const coachEnabled = useCoachEnabled();
  const coach = useConversationCoach();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [otherSide, setOtherSide] = useState('');
  const [sharedGround, setSharedGround] = useState('');
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);

  // A fresh set of steps every time the sheet opens — the answers are
  // reflection for this reply, not a form to be resubmitted.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setOtherSide('');
    setSharedGround('');
    coach.reset();
    const id = window.setTimeout(() => firstFieldRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
    // coach.reset is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The last step runs the coach on the draft. When the reader has switched
  // coaching off there is nothing to wait for and the Post button is there
  // at once.
  useEffect(() => {
    if (!open || step !== 4) return;
    if (!coachEnabled || !draft.trim()) return;
    void coach.check(draft, 'commonGround');
    // coach.check is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, coachEnabled, draft]);

  const otherSideOk = otherSide.trim().length >= COMMON_GROUND_MIN_CHARS;
  const sharedGroundOk = sharedGround.trim().length >= COMMON_GROUND_MIN_CHARS;

  const stepLabel = step <= 3 ? t('conversation.commonGround.stepOf', { step, total: 3 }) : t('conversation.commonGround.reviewTitle');

  const body = (
    <div data-common-ground-step={step} className="flex flex-col gap-4">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{stepLabel}</p>

      {step === 1 && (
        <div className="flex flex-col gap-2">
          <label htmlFor="common-ground-other-side" className="text-sm font-medium text-white">
            {t('conversation.commonGround.step1Title')}
          </label>
          <Textarea
            id="common-ground-other-side"
            ref={firstFieldRef}
            value={otherSide}
            onChange={(e) => setOtherSide(e.target.value)}
            placeholder={t('conversation.commonGround.step1Placeholder')}
            maxLength={400}
            className={FIELD_CLASS}
          />
          {otherSide.length > 0 && !otherSideOk && (
            <p className="text-xs text-zinc-500">{t('conversation.commonGround.tooShort')}</p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-2">
          <label htmlFor="common-ground-shared" className="text-sm font-medium text-white">
            {t('conversation.commonGround.step2Title')}
          </label>
          <Textarea
            id="common-ground-shared"
            autoFocus
            value={sharedGround}
            onChange={(e) => setSharedGround(e.target.value)}
            placeholder={t('conversation.commonGround.step2Placeholder')}
            maxLength={400}
            className={FIELD_CLASS}
          />
          {sharedGround.length > 0 && !sharedGroundOk && (
            <p className="text-xs text-zinc-500">{t('conversation.commonGround.tooShort')}</p>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <div className="flex items-center gap-2 text-white">
              <Scale className="w-4 h-4 shrink-0 text-zinc-300" />
              <p className="text-sm font-medium">{t('conversation.commonGround.reminderTitle')}</p>
            </div>
            <p className="mt-2 text-sm text-zinc-300">{t('conversation.commonGround.reminderBody')}</p>
            <ul className="mt-3 flex flex-col gap-2">
              <li className="flex gap-2 text-xs text-zinc-400">
                <span className="shrink-0 text-zinc-500">•</span>
                <span>{t('conversation.commonGround.example1')}</span>
              </li>
              <li className="flex gap-2 text-xs text-zinc-400">
                <span className="shrink-0 text-zinc-500">•</span>
                <span>{t('conversation.commonGround.example2')}</span>
              </li>
            </ul>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <MessageCircleWarning className="w-4 h-4 mt-0.5 shrink-0 text-zinc-300" />
            <p className="text-sm text-zinc-300">{t('conversation.commonGround.noShouting')}</p>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-3">
          {draft.trim() && (
            <blockquote className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-sm text-zinc-200 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
              {draft.trim()}
            </blockquote>
          )}
          <CoachSuggestions status={coach.status} flags={coach.flags} onDismiss={coach.dismiss} />
        </div>
      )}

      <p className="text-xs text-zinc-500">{t('conversation.commonGround.privateNote')}</p>

      <div className={cn('flex items-center gap-2', step > 1 ? 'justify-between' : 'justify-end')}>
        {step > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
            className="text-zinc-300"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            {t('conversation.commonGround.back')}
          </Button>
        )}
        {step === 1 && (
          <Button type="button" disabled={!otherSideOk} onClick={() => setStep(2)}>
            {t('conversation.commonGround.continueLabel')}
          </Button>
        )}
        {step === 2 && (
          <Button type="button" disabled={!sharedGroundOk} onClick={() => setStep(3)}>
            {t('conversation.commonGround.continueLabel')}
          </Button>
        )}
        {step === 3 && (
          <Button type="button" onClick={() => setStep(4)}>
            {t('conversation.commonGround.continueLabel')}
          </Button>
        )}
        {step === 4 && (
          <Button type="button" data-common-ground-post onClick={onConfirm}>
            {t('conversation.commonGround.postReply')}
          </Button>
        )}
      </div>
    </div>
  );

  const title = (
    <span className="flex items-center gap-2">
      <Handshake className="w-4 h-4 shrink-0 text-zinc-300" />
      {t('conversation.commonGround.title')}
    </span>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent data-common-ground-sheet glass className="max-h-[92vh]">
          <DrawerHeader className="text-left pb-2">
            <DrawerTitle className="text-white">{title}</DrawerTitle>
            <DrawerDescription className="text-zinc-400 text-xs">{t('conversation.commonGround.sheetHint')}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-common-ground-sheet className="max-w-md bg-black/40 backdrop-blur-2xl border border-white/10 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">{title}</DialogTitle>
          <DialogDescription className="text-zinc-400 text-xs">{t('conversation.commonGround.sheetHint')}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
