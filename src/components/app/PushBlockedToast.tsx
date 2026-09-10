import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  getStoredEnabled,
  useNotificationPermission,
  useWebPushState,
} from '@/hooks/use-browser-notifications';
import { BUTTON_CLASSES } from '@/components/ui/toast-classes';

/**
 * Tells a reader whose notifications are silently dead that they are dead.
 *
 * The Settings row already reports this state, but only to someone who happens
 * to open Settings — and nobody opens Settings to check whether a thing they
 * believe is working still works. So the people worst affected are exactly the
 * ones who will never see it: switch on, permission granted, nothing arriving,
 * no reason to suspect anything. One reader sat in that state for seven months.
 *
 * This is deliberately NOT the soft-ask's twin. That one asks for a permission,
 * so it has to earn the right to appear (scroll distance, dwell, one shot ever)
 * or it trips Chrome's abusive-notification heuristics. This one asks for
 * nothing and triggers no browser UI; it reports a fault the reader cannot
 * otherwise find out about. The restraint it does need is different: only fire
 * when the state has actually resolved to a fault, and take a dismissal as an
 * answer for a fortnight.
 */

/** Long enough that a fixed problem stops nagging, short enough to resurface. */
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

/** Don't land during first paint — a toast at boot reads as a page error. */
const MIN_DWELL_MS = 8_000;

const STATE_KEY = 'dehub_push_blocked_prompt';

function snoozedUntil(): number {
  try {
    return Number(localStorage.getItem(STATE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function snooze(): void {
  try {
    localStorage.setItem(STATE_KEY, String(Date.now() + SNOOZE_MS));
  } catch {}
}

function show(goToSettings: () => void): void {
  const id = toast.message(i18n.t('toasts.push_blocked_title', 'Notifications are not reaching you'), {
    duration: Infinity,
    closeButton: true,
    position: 'bottom-right',
    // The X is an answer too.
    onDismiss: () => snooze(),
    description: (
      <span className="flex flex-col gap-3">
        <span>
          {i18n.t(
            'toasts.push_blocked_body',
            'Your system is blocking notifications for this browser, so nothing reaches you while DeHub is closed. Turn them back on for your browser in your system notification settings, then switch DeHub notifications off and on again.',
          )}
        </span>
        <span className="flex flex-row gap-2">
          <button
            type="button"
            className={BUTTON_CLASSES}
            onClick={() => {
              snooze();
              toast.dismiss(id);
              goToSettings();
            }}
          >
            {i18n.t('toasts.push_blocked_more', 'More detail')}
          </button>
          <button
            type="button"
            className={BUTTON_CLASSES}
            onClick={() => {
              snooze();
              toast.dismiss(id);
            }}
          >
            {i18n.t('toasts.not_now', 'Not now')}
          </button>
        </span>
      </span>
    ),
  });
}

/**
 * Renders nothing; raises the notice once per load for a signed-in desktop
 * reader whose push subscription failed. Mounted at the App root beside
 * <NotificationsPromptToast />.
 */
export function PushBlockedToast() {
  const { isAuthenticated } = useAuth();
  const isMobile = useIsMobile();
  const permission = useNotificationPermission();
  const pushState = useWebPushState();
  const firedRef = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (firedRef.current) return;
    // Desktop and signed-in, matching the soft-ask: the remedy names a
    // desktop OS's notification settings, and a signed-out visitor has no
    // notification stream to miss.
    if (isMobile || !isAuthenticated) return;
    // 'granted' plus a stored on: this reader believes notifications work.
    // A denied permission is a different fault with its own copy in Settings.
    if (permission !== 'granted' || !getStoredEnabled()) return;
    // Only once the state has actually resolved to a failure. 'unknown' is
    // the normal state for the first second of a load.
    //
    // Both failures belong here and they are not the same thing:
    // 'unavailable' is a subscription that could not be created, 'blocked'
    // is one that exists while the OS refuses to display anything from the
    // browser. The second is the one nothing used to detect, because the
    // enable-time test used the page's Notification constructor, which
    // succeeds on a blocked machine.
    if (pushState !== 'unavailable' && pushState !== 'blocked') return;
    if (Date.now() < snoozedUntil()) return;

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (firedRef.current) return;
      // A notice raised at a hidden tab is a notice nobody reads.
      if (document.hidden) return;
      if (Date.now() - startedAt < MIN_DWELL_MS) return;
      // Settings may have been used to turn the whole thing off since this
      // was armed, and a dismissal in another tab counts here too.
      if (!getStoredEnabled() || Date.now() < snoozedUntil()) return;
      firedRef.current = true;
      window.clearInterval(timer);
      show(() => navigate('/settings'));
    }, 5_000);

    return () => window.clearInterval(timer);
  }, [isAuthenticated, isMobile, permission, pushState, navigate]);

  return null;
}
