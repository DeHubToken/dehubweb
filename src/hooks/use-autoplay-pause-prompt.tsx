import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAutoplay } from '@/contexts/AutoplayContext';
import { Switch } from '@/components/ui/switch';
import i18n from '@/i18n';
import {
  AUTOPLAY_PAUSE_CONFIRM_MS,
  AUTOPLAY_PROMPT_STORAGE_KEY,
  createAutoplayPauseTracker,
} from '@/lib/autoplay-pause-prompt';

const tracker = createAutoplayPauseTracker();
const TOAST_ID = 'autoplay-pause-prompt';

export function useAutoplayPausePrompt(videoId: string) {
  const { autoplayEnabled, setAutoplayEnabled } = useAutoplay();
  const enabledRef = useRef(autoplayEnabled);
  enabledRef.current = autoplayEnabled;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPause = useRef<(() => void) | null>(null);
  const cancelPause = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pendingPause.current = null;
  }, []);
  useEffect(() => () => {
    // Scrolling can remove the card before the gesture window ends. A pause
    // that was not reversed still counts when its player leaves the feed.
    const confirm = pendingPause.current;
    cancelPause();
    confirm?.();
  }, [videoId, cancelPause]);
  useEffect(() => {
    if (!autoplayEnabled) {
      cancelPause();
      toast.dismiss(TOAST_ID);
    }
  }, [autoplayEnabled, cancelPause]);

  const recordPause = useCallback(() => {
    cancelPause();
    if (!enabledRef.current) return;
    pendingPause.current = () => {
      if (!enabledRef.current) return;
      const now = Date.now();
      let lastPromptAt = 0;
      try { lastPromptAt = Number(localStorage.getItem(AUTOPLAY_PROMPT_STORAGE_KEY)) || 0; } catch { /* session fallback */ }
      if (!tracker.recordPause(videoId, now, lastPromptAt)) return;
      try { localStorage.setItem(AUTOPLAY_PROMPT_STORAGE_KEY, String(now)); } catch { /* session fallback */ }
      toast.message(i18n.t('settings.autoplayPausePrompt'), {
        id: TOAST_ID,
        duration: Infinity,
        closeButton: true,
        description: (
          <label className="flex items-center justify-between gap-6 pt-2">
            <span>{i18n.t('settings.autoPlay')}</span>
            <Switch
              checked
              aria-label={i18n.t('settings.autoPlay')}
              onCheckedChange={(enabled) => {
                setAutoplayEnabled(enabled);
                toast.dismiss(TOAST_ID);
              }}
            />
          </label>
        ),
      });
    };
    timer.current = setTimeout(() => {
      const confirm = pendingPause.current;
      cancelPause();
      confirm?.();
    }, AUTOPLAY_PAUSE_CONFIRM_MS);
  }, [videoId, setAutoplayEnabled, cancelPause]);

  return { recordPause, cancelPause };
}
