/**
 * Stage recording upload — the corner toast
 * =========================================
 * Pressing End deliberately resets the stage UI before the recording upload
 * finishes, so for a minute or two the only copy of a one-to-two-hour stage is
 * an in-flight fetch nothing on screen admits to. The beforeunload guard stops
 * the tab being closed in that window, but a browser dialog is a last resort,
 * not an explanation — this toast is the explanation. It appears the moment
 * the upload starts, carries the app's own preloader so the wait reads as
 * progress rather than a hang, and flips in place to saved or failed.
 *
 * Styled off the new-version toast (same exported classes, same bottom-right
 * corner on desktop) because that is the app's established shape for "quiet
 * status you can glance at" — and one `id` shared by all three states means
 * sonner updates the card in place instead of stacking three.
 */

import { toast } from 'sonner';
import { DeHubLoader } from '@/components/app/DeHubLoader';
import {
  TOAST_CLASSES,
  TITLE_CLASSES,
  CONTENT_CLASSES,
  CLOSE_CLASSES,
} from '@/components/app/NewVersionToast';

const TOAST_ID = 'stage-recording-upload';

const classNames = {
  toast: TOAST_CLASSES,
  title: TITLE_CLASSES,
  content: CONTENT_CLASSES,
  closeButton: CLOSE_CLASSES,
};

/**
 * Desktop parks the toast bottom-right like the update toast; mobile keeps the
 * shared toaster's placement, where a corner is most of the width anyway.
 * Same 768px line use-mobile draws — read directly because this fires from a
 * context callback, not a component.
 */
function corner(): { position?: 'bottom-right' } {
  return window.matchMedia('(min-width: 768px)').matches
    ? { position: 'bottom-right' }
    : {};
}

/** The upload has started: recording is the only copy, keep the tab open. */
export function showRecordingUploading(): void {
  toast.message('Saving stage recording', {
    id: TOAST_ID,
    // Stays until the upload resolves it one way or the other.
    duration: Infinity,
    ...corner(),
    classNames,
    description: (
      <span className="flex items-center gap-3">
        <DeHubLoader size={28} className="shrink-0" />
        <span>Keep this tab open — the recording is uploading.</span>
      </span>
    ),
  });
}

/** Upload done and recording_url written — safe to close the tab. */
export function showRecordingSaved(): void {
  toast.message('Recording saved', {
    id: TOAST_ID,
    duration: 6_000,
    ...corner(),
    classNames,
    description: "It's safe to close this tab. The stage will appear under Recorded shortly.",
  });
}

/** Both upload attempts failed. Sticky: this is the host's only witness. */
export function showRecordingFailed(): void {
  toast.message('Recording could not be saved', {
    id: TOAST_ID,
    duration: Infinity,
    closeButton: true,
    ...corner(),
    classNames,
    description: 'The upload failed after retrying. The recording could not be kept.',
  });
}

/** Nothing was recorded after all (no chunks) — take the card down. */
export function dismissRecordingToast(): void {
  toast.dismiss(TOAST_ID);
}
