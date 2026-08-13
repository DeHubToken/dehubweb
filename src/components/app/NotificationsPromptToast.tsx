import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { getDocumentScrollTop } from '@/lib/document-scroll';
import {
  getStoredEnabled,
  setStoredEnabled,
  requestNotificationPermission,
} from '@/hooks/use-browser-notifications';
import {
  TOAST_CLASSES,
  TITLE_CLASSES,
  CONTENT_CLASSES,
  CLOSE_CLASSES,
  BUTTON_CLASSES,
} from '@/components/app/NewVersionToast';

/**
 * Soft-ask for browser notifications, styled and positioned like the
 * new-version toast (shared class constants, bottom-right, glass buttons).
 *
 * Chrome's "quieter messaging" and abusive-notification flags key off sites
 * that call `Notification.requestPermission()` uninvited — on load, or from
 * code the user never asked for. Everything here exists to stay on the right
 * side of that line:
 *
 *   - The native browser prompt is only ever triggered by a click on the
 *     toast's own "Turn on" button, inside that click's user gesture.
 *   - The toast itself waits for real engagement (scroll distance + dwell
 *     time) instead of ambushing arrivals.
 *   - `Notification.permission` gates hard: 'denied' is never re-asked (the
 *     browser remembers, and re-prompting is the classic abuse signal);
 *     'granted' means the reader has been through the flow and Settings owns
 *     the toggle from there. Only 'default' is worth a prompt.
 *   - Dismissing snoozes for 60 days; answering — either way — retires the
 *     prompt permanently. The Settings toggle remains the only other surface.
 */

/** Cumulative scroll (any direction) that counts as "scrolled around a bit". */
const SCROLL_THRESHOLD_PX = 1200;

/** Minimum time on the app before the prompt can appear. */
const MIN_DWELL_MS = 20_000;

/** How long a dismissal (X or "Not now") keeps the prompt away. */
const SNOOZE_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

const STATE_KEY = 'dehub_notif_prompt';

interface PromptState {
  done?: boolean;
  snoozedUntil?: number;
}

function readState(): PromptState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as PromptState) : {};
  } catch {
    return {};
  }
}

function writeState(state: PromptState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {}
}

/** The reader answered (either way): never prompt again. */
function markDone(): void {
  writeState({ done: true });
}

/** The reader waved it away without answering: ask again in a while. */
function snooze(): void {
  if (readState().done) return;
  writeState({ snoozedUntil: Date.now() + SNOOZE_MS });
}

function isEligible(): boolean {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'default') return false;
  if (getStoredEnabled()) return false;
  const state = readState();
  if (state.done) return false;
  if (state.snoozedUntil && Date.now() < state.snoozedUntil) return false;
  return true;
}

async function accept(id: string | number): Promise<void> {
  markDone();
  // Kick the native prompt off inside the click gesture, then clear the toast
  // out from under it — awaiting first would leave the gesture behind.
  const request = requestNotificationPermission();
  toast.dismiss(id);
  const result = await request;
  if (result === 'granted') {
    setStoredEnabled(true);
    toast.success(i18n.t('settings.browserNotificationsEnabled', 'Browser notifications enabled'));
  } else if (result === 'denied') {
    // Same message Settings shows: the OS-level "Block" needs the browser's
    // own UI to undo, and saying so beats silent nothing-happened.
    toast.error(
      i18n.t('settings.browserNotificationsDenied', 'Notifications blocked. Enable them in your browser settings.')
    );
  }
  // 'unsupported' stays quiet — nothing the reader can do from here.
}

function decline(id: string | number): void {
  snooze();
  toast.dismiss(id);
}

function showPrompt(): void {
  const id = toast.message('Turn on desktop notifications?', {
    // Sits until answered or waved away, like the version toast.
    duration: Infinity,
    closeButton: true,
    position: 'bottom-right',
    // The X counts as "not now". `snooze` no-ops after `markDone`, so the
    // dismiss that follows an answer doesn't downgrade it to a snooze.
    onDismiss: () => snooze(),
    classNames: {
      toast: TOAST_CLASSES,
      title: TITLE_CLASSES,
      content: CONTENT_CLASSES,
      closeButton: CLOSE_CLASSES,
    },
    description: (
      <span className="flex flex-col gap-3">
        <span>
          {i18n.t(
            'toasts.get_a_heads_up_about_replies_tips_and_dms_while_youre_in_another_tab',
            "Get a heads-up about replies, tips and DMs while you're in another tab."
          )}
        </span>
        <span className="flex flex-col gap-2">
          <button type="button" className={BUTTON_CLASSES} onClick={() => void accept(id)}>
            {i18n.t('toasts.turn_on', 'Turn on')}
          </button>
          <button type="button" className={BUTTON_CLASSES} onClick={() => decline(id)}>
            {i18n.t('toasts.not_now', 'Not now')}
          </button>
        </span>
      </span>
    ),
  });
}

/**
 * Renders nothing; watches for enough engagement from a signed-in desktop
 * reader and raises the soft-ask once. Mounted at the App root, next to
 * <NewVersionToast />.
 */
export function NotificationsPromptToast() {
  const { isAuthenticated } = useAuth();
  const isMobile = useIsMobile();
  const firedRef = useRef(false);

  useEffect(() => {
    // Desktop + signed-in only: `new Notification()` throws on Android Chrome
    // (delivery there needs a push-capable service worker the app doesn't
    // have), and a signed-out visitor has no notification stream to deliver.
    if (isMobile || !isAuthenticated || firedRef.current) return;
    if (!isEligible()) return;

    const startedAt = Date.now();
    let lastTop = getDocumentScrollTop();
    let scrolled = 0;

    function maybeShow(): void {
      if (firedRef.current) return;
      if (scrolled < SCROLL_THRESHOLD_PX) return;
      if (Date.now() - startedAt < MIN_DWELL_MS) return;
      // Raising a permission ask at a hidden tab wastes the one show.
      if (document.hidden) return;
      cleanup();
      // Settings may have flipped state since the watch was armed.
      if (!isEligible()) return;
      firedRef.current = true;
      showPrompt();
    }

    function onScroll(): void {
      // Body is the app's scroller (see lib/document-scroll), and scroll
      // events don't bubble but do capture-propagate, so a capture listener
      // on document sees them.
      const top = getDocumentScrollTop();
      scrolled += Math.abs(top - lastTop);
      lastTop = top;
      maybeShow();
    }

    // The dwell clock keeps ticking while the reader idles after meeting the
    // scroll bar; without it the prompt could only fire on the next scroll.
    const timer = window.setInterval(maybeShow, 5_000);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });

    function cleanup(): void {
      window.clearInterval(timer);
      document.removeEventListener('scroll', onScroll, true);
    }

    return cleanup;
  }, [isMobile, isAuthenticated]);

  return null;
}
