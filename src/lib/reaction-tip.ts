/**
 * One-time hint that the like button hides more reactions.
 *
 * Shown after the viewer's first plain like, since that is the moment they
 * have found the button but not the tray behind it. Anyone who has already
 * opened the tray (hover or hold) knows, so that marks it seen without a toast.
 */
import { toast } from 'sonner';
import i18n from '@/i18n';

const SEEN_KEY = 'dehub:reaction-tip-seen';

function isSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
}

export function markReactionTipSeen(): void {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* storage blocked */ }
}

export function maybeShowReactionTip(): void {
  if (isSeen()) return;
  markReactionTipSeen();
  toast.info(i18n.t('toasts.reactionTip'), { duration: 5000 });
}
