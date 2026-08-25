/**
 * Replay resolution for ended livestreams.
 *
 * The backend records every stream through Livepeer, then moves the finished
 * file into DeHub's own bucket and deletes the Livepeer copy — so a replay is
 * a plain mp4 on the CDN, not an HLS playlist, and it only exists once that
 * capture reports `ready`.
 *
 * Lives on its own because both the feed mapper and the post page need it, and
 * neither should be importing the other.
 */

interface RecordingRecord {
  status?: string;
  url?: string;
  /** Set when the capture was cut down to the creator's daily allowance. */
  truncated?: boolean;
}

/**
 * Deliberately strict about `status`: a failed or skipped capture still writes
 * a recording object, and handing a card half a record would put a play button
 * over a URL that does not exist.
 */
export function extractReplayUrl(stream: unknown): string | undefined {
  const recording = (stream as { recording?: RecordingRecord })?.recording;
  if (!recording || recording.status !== 'ready') return undefined;
  return recording.url || undefined;
}

/**
 * Whether the stored replay is only the opening stretch of the broadcast —
 * the card labels it PARTIAL rather than presenting a cut as the whole show.
 */
export function isReplayTruncated(stream: unknown): boolean {
  const recording = (stream as { recording?: RecordingRecord })?.recording;
  return recording?.status === 'ready' && !!recording.truncated;
}
